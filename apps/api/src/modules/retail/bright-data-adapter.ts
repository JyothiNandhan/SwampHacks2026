import { ProductOfferSchema, type ProductOffer } from '@moneyback/contracts';
import { z } from 'zod';

export type BrightDataRetailer = 'amazon' | 'walmart';
export type BrightDataErrorCode = 'BRIGHT_DATA_NOT_CONFIGURED' | 'BRIGHT_DATA_UNAUTHORIZED' |
  'BRIGHT_DATA_NOT_FOUND' | 'BRIGHT_DATA_RATE_LIMITED' | 'BRIGHT_DATA_UPSTREAM_ERROR' |
  'BRIGHT_DATA_TIMEOUT' | 'BRIGHT_DATA_NETWORK_ERROR' | 'BRIGHT_DATA_INVALID_RESPONSE' |
  'BRIGHT_DATA_SNAPSHOT_FAILED' | 'BRIGHT_DATA_SNAPSHOT_CANCELED';

const TriggerResponseSchema = z.object({ snapshot_id: z.string().min(1) }).passthrough();
const ProgressResponseSchema = z.object({
  snapshot_id: z.string().min(1), dataset_id: z.string().min(1).optional(),
  status: z.enum(['starting', 'running', 'ready', 'failed', 'canceled']),
  error_message: z.string().optional()
}).passthrough();
const RawRecordSchema = z.record(z.string(), z.unknown());
const SnapshotResponseSchema = z.union([
  z.array(RawRecordSchema), z.object({ data: z.array(RawRecordSchema) }).passthrough()
]);

/** Safe provider error. It never includes tokens, input URLs, provider bodies, or raw records. */
export class BrightDataApiError extends Error {
  constructor(readonly code: BrightDataErrorCode, readonly statusCode?: number) {
    super(code);
    this.name = 'BrightDataApiError';
  }
  get retryable(): boolean {
    return ['BRIGHT_DATA_RATE_LIMITED', 'BRIGHT_DATA_TIMEOUT', 'BRIGHT_DATA_NETWORK_ERROR'].includes(this.code) ||
      (this.code === 'BRIGHT_DATA_UPSTREAM_ERROR' && (this.statusCode ?? 0) >= 500);
  }
}

export interface BrightDataAdapterOptions {
  apiKey: string;
  datasetIds: Partial<Record<BrightDataRetailer, string>>;
  baseUrl?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  fetchImpl?: typeof fetch;
  sleep?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
}

export interface BrightDataSnapshotStatus {
  snapshotId: string;
  status: 'starting' | 'running' | 'ready' | 'failed' | 'canceled';
}

export class BrightDataAdapter {
  readonly #apiKey: string;
  readonly #datasetIds: Partial<Record<BrightDataRetailer, string>>;
  readonly #baseUrl: URL;
  readonly #timeoutMs: number;
  readonly #pollIntervalMs: number;
  readonly #maxPollAttempts: number;
  readonly #fetch: typeof fetch;
  readonly #sleep: (milliseconds: number) => Promise<void>;
  readonly #now: () => Date;

  constructor(options: BrightDataAdapterOptions) {
    if (!options.apiKey.trim()) throw new BrightDataApiError('BRIGHT_DATA_NOT_CONFIGURED');
    this.#apiKey = options.apiKey;
    this.#datasetIds = options.datasetIds;
    this.#baseUrl = parseBaseUrl(options.baseUrl ?? 'https://api.brightdata.com');
    this.#timeoutMs = boundedInteger(options.timeoutMs ?? 30_000, 1, 120_000, 'timeoutMs');
    this.#pollIntervalMs = boundedInteger(options.pollIntervalMs ?? 2_000, 0, 60_000, 'pollIntervalMs');
    this.#maxPollAttempts = boundedInteger(options.maxPollAttempts ?? 30, 1, 300, 'maxPollAttempts');
    this.#fetch = options.fetchImpl ?? fetch;
    this.#sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)));
    this.#now = options.now ?? (() => new Date());
  }

  async triggerCollection(retailer: BrightDataRetailer, productUrls: string[]): Promise<string> {
    const datasetId = this.datasetIdFor(retailer);
    if (!productUrls.length || productUrls.length > 100) {
      throw new Error('Bright Data collection requires 1 to 100 product URLs');
    }
    const input = productUrls.map(value => ({ url: validateProductUrl(value, retailer) }));
    const url = this.apiUrl('/datasets/v3/trigger');
    url.searchParams.set('dataset_id', datasetId);
    url.searchParams.set('notify', 'false');
    url.searchParams.set('include_errors', 'true');
    url.searchParams.set('format', 'json');
    const payload = await this.requestJson(url, {
      method: 'POST', body: JSON.stringify({ input, limit_per_input: 1 })
    });
    const parsed = TriggerResponseSchema.safeParse(payload);
    if (!parsed.success || !isSnapshotId(parsed.data.snapshot_id)) {
      throw new BrightDataApiError('BRIGHT_DATA_INVALID_RESPONSE');
    }
    return parsed.data.snapshot_id;
  }

  async getSnapshotStatus(snapshotId: string): Promise<BrightDataSnapshotStatus> {
    validateSnapshotId(snapshotId);
    const payload = await this.requestJson(this.apiUrl(`/datasets/v3/progress/${snapshotId}`), { method: 'GET' });
    const parsed = ProgressResponseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.snapshot_id !== snapshotId) {
      throw new BrightDataApiError('BRIGHT_DATA_INVALID_RESPONSE');
    }
    return { snapshotId, status: parsed.data.status };
  }

  async waitForSnapshot(snapshotId: string): Promise<void> {
    for (let attempt = 1; attempt <= this.#maxPollAttempts; attempt += 1) {
      const { status } = await this.getSnapshotStatus(snapshotId);
      if (status === 'ready') return;
      if (status === 'failed') throw new BrightDataApiError('BRIGHT_DATA_SNAPSHOT_FAILED');
      if (status === 'canceled') throw new BrightDataApiError('BRIGHT_DATA_SNAPSHOT_CANCELED');
      if (attempt < this.#maxPollAttempts) await this.#sleep(this.#pollIntervalMs);
    }
    throw new BrightDataApiError('BRIGHT_DATA_TIMEOUT');
  }

  async downloadOffers(snapshotId: string, retailer: BrightDataRetailer): Promise<ProductOffer[]> {
    validateSnapshotId(snapshotId);
    const url = this.apiUrl(`/datasets/v3/snapshot/${snapshotId}`);
    url.searchParams.set('format', 'json');
    const parsed = SnapshotResponseSchema.safeParse(await this.requestJson(url, { method: 'GET' }));
    if (!parsed.success) throw new BrightDataApiError('BRIGHT_DATA_INVALID_RESPONSE');
    const records = Array.isArray(parsed.data) ? parsed.data : parsed.data.data;
    return records.map((record, index) => this.normalizeOffer(record, retailer, snapshotId, index));
  }

  async collectOffers(retailer: BrightDataRetailer, productUrls: string[]): Promise<ProductOffer[]> {
    const snapshotId = await this.triggerCollection(retailer, productUrls);
    await this.waitForSnapshot(snapshotId);
    return this.downloadOffers(snapshotId, retailer);
  }

  private datasetIdFor(retailer: BrightDataRetailer): string {
    const value = this.#datasetIds[retailer]?.trim();
    if (!value || !/^(?:gd|ds)_[A-Za-z0-9_-]+$/.test(value)) {
      throw new BrightDataApiError('BRIGHT_DATA_NOT_CONFIGURED');
    }
    return value;
  }

  private apiUrl(pathname: string): URL {
    const url = new URL(this.#baseUrl);
    url.pathname = this.#baseUrl.pathname.replace(/\/$/, '') + pathname;
    return url;
  }

  private async requestJson(url: URL, init: RequestInit): Promise<unknown> {
    const signal = AbortSignal.timeout(this.#timeoutMs);
    try {
      const response = await this.#fetch(url, {
        ...init, redirect: 'error', signal,
        headers: { accept: 'application/json', authorization: `Bearer ${this.#apiKey}`,
          ...(init.body ? { 'content-type': 'application/json' } : {}) }
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        const code: BrightDataErrorCode = response.status === 401 || response.status === 403 ? 'BRIGHT_DATA_UNAUTHORIZED' :
          response.status === 404 ? 'BRIGHT_DATA_NOT_FOUND' : response.status === 429 ? 'BRIGHT_DATA_RATE_LIMITED' :
            'BRIGHT_DATA_UPSTREAM_ERROR';
        throw new BrightDataApiError(code, response.status);
      }
      try { return await response.json(); }
      catch { throw new BrightDataApiError('BRIGHT_DATA_INVALID_RESPONSE'); }
    } catch (error) {
      if (error instanceof BrightDataApiError) throw error;
      throw new BrightDataApiError(signal.aborted ? 'BRIGHT_DATA_TIMEOUT' : 'BRIGHT_DATA_NETWORK_ERROR');
    }
  }

  private normalizeOffer(record: Record<string, unknown>, retailer: BrightDataRetailer,
    snapshotId: string, index: number): ProductOffer {
    const productName = firstString(record, ['title', 'product_name', 'name']);
    const rawUrl = firstString(record, ['url', 'product_url', 'link']);
    if (!productName || !rawUrl) throw new BrightDataApiError('BRIGHT_DATA_INVALID_RESPONSE');
    const productUrl = validateProductUrl(rawUrl, retailer);
    const currency = firstString(record, ['currency', 'currency_code']);
    if (currency && !['USD', '$', 'US$'].includes(currency.toUpperCase())) {
      throw new BrightDataApiError('BRIGHT_DATA_INVALID_RESPONSE');
    }
    const timestamp = firstString(record, ['timestamp', 'scraped_at', 'last_updated', 'updated_at']);
    let observedAt: string;
    try { observedAt = timestamp ?? this.#now().toISOString(); }
    catch { throw new BrightDataApiError('BRIGHT_DATA_INVALID_RESPONSE'); }
    const sku = firstString(record, ['sku', 'asin', 'product_id']);
    const result = ProductOfferSchema.safeParse({
      id: `bright-data:${snapshotId}:${index}`, source: 'BRIGHT_DATA',
      retailerName: retailer === 'amazon' ? 'Amazon' : 'Walmart', productName,
      sku, model: exactModel(record),
      gtin: firstString(record, ['gtin', 'upc', 'ean']), condition: parseCondition(record.condition),
      priceCents: priceToCents(firstValue(record, ['final_price', 'price', 'current_price'])),
      shippingCents: optionalPriceToCents(firstValue(record, ['shipping_price', 'shipping_cost'])),
      currency: 'USD', inStock: availableOnline(record),
      productUrl, observedAt
    });
    if (!result.success) throw new BrightDataApiError('BRIGHT_DATA_INVALID_RESPONSE');
    return result.data;
  }
}

function exactModel(record: Record<string, unknown>): string | null {
  const values = [firstString(record, ['model']), firstString(record, ['model_number']), firstString(record, ['mpn'])];
  const identifiers = record.product_identifiers;
  if (identifiers && typeof identifiers === 'object' && !Array.isArray(identifiers)) values.push(firstString(identifiers as Record<string, unknown>, ['model']));
  if (Array.isArray(record.specifications)) for (const entry of record.specifications) {
    if (entry && typeof entry === 'object' && ['model','model number','manufacturer part number'].includes(String(entry.name).trim().toLowerCase())) values.push(firstString(entry, ['value']));
  }
  const known = values.filter((v): v is string => Boolean(v));
  if (new Set(known.map(value => value.toUpperCase().replace(/[^A-Z0-9]/g, ''))).size > 1) throw new BrightDataApiError('BRIGHT_DATA_INVALID_RESPONSE');
  return known[0] ?? null;
}
function availableOnline(record: Record<string, unknown>): boolean | null {
  const values = ['in_stock','is_available','availability','availability_text','stock_status','available_for_delivery'].map(key => parseAvailability(record[key]));
  if (values.includes(false)) return false;
  return values.includes(true) ? true : null;
}

function firstValue(record: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) if (record[key] !== undefined && record[key] !== null) return record[key];
  return undefined;
}
function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  const value = firstValue(record, keys);
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return null;
}
function priceToCents(value: unknown): number {
  if (typeof value === 'number') {
    const cents = Math.round(value * 100);
    if (Number.isSafeInteger(cents) && cents >= 0 && cents <= 2_147_483_647) return cents;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().replace(/^(?:USD|US\$|\$)\s*/i, '').replaceAll(',', '');
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(normalized);
    if (match) {
      const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
      if (Number.isSafeInteger(cents) && cents <= 2_147_483_647) return cents;
    }
  }
  throw new BrightDataApiError('BRIGHT_DATA_INVALID_RESPONSE');
}
function optionalPriceToCents(value: unknown): number | null {
  return value === undefined || value === null || value === '' ? null : priceToCents(value);
}
function parseCondition(value: unknown): ProductOffer['condition'] {
  if (typeof value !== 'string') return 'UNKNOWN';
  const normalized = value.trim().toLowerCase().replaceAll('-', '_').replaceAll(' ', '_');
  if (['new', 'brand_new'].includes(normalized)) return 'NEW';
  if (['open_box', 'openbox'].includes(normalized)) return 'OPEN_BOX';
  if (['refurbished', 'renewed', 'certified_refurbished'].includes(normalized)) return 'REFURBISHED';
  if (normalized === 'used' || normalized.startsWith('used_')) return 'USED';
  return 'UNKNOWN';
}
function parseAvailability(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replaceAll('_', ' ');
  if (['in stock', 'available', 'available now', 'true'].includes(normalized)) return true;
  if (['out of stock', 'unavailable', 'sold out', 'false'].includes(normalized)) return false;
  return null;
}
function validateProductUrl(value: string, retailer: BrightDataRetailer): string {
  const domain = retailer === 'amazon' ? 'amazon.com' : 'walmart.com';
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || (url.hostname !== domain && !url.hostname.endsWith(`.${domain}`))) throw new Error();
    return url.toString();
  } catch { throw new BrightDataApiError('BRIGHT_DATA_INVALID_RESPONSE'); }
}
function parseBaseUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Invalid Bright Data base URL'); }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || localHttp) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid Bright Data base URL');
  }
  return url;
}
function boundedInteger(value: number, minimum: number, maximum: number, name: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid Bright Data ${name}`);
  return value;
}
function isSnapshotId(value: string): boolean { return /^s(?:d)?_[A-Za-z0-9_-]+$/.test(value); }
function validateSnapshotId(value: string): void {
  if (!isSnapshotId(value)) throw new BrightDataApiError('BRIGHT_DATA_INVALID_RESPONSE');
}
