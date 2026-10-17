import { ProductOfferSchema, type ProductOffer } from '@moneyback/contracts';
import { z } from 'zod';

const BestBuyProductSchema = z.object({
  sku: z.union([z.string(), z.number()]),
  name: z.string().min(1),
  salePrice: z.number().finite().nonnegative(),
  url: z.string().url(),
  onlineAvailability: z.boolean().nullable().optional(),
  modelNumber: z.string().nullable().optional(),
  upc: z.string().nullable().optional()
}).passthrough();

const BestBuySearchResponseSchema = z.object({
  products: z.array(BestBuyProductSchema),
  total: z.number().int().nonnegative().optional()
}).passthrough();

type BestBuyProduct = z.infer<typeof BestBuyProductSchema>;
export type BestBuyErrorCode = 'BEST_BUY_UNAUTHORIZED' | 'BEST_BUY_NOT_FOUND' |
  'BEST_BUY_RATE_LIMITED' | 'BEST_BUY_UPSTREAM_ERROR' | 'BEST_BUY_TIMEOUT' |
  'BEST_BUY_NETWORK_ERROR' | 'BEST_BUY_INVALID_RESPONSE';

/** Contains only safe metadata; never includes the credentialed upstream URL or body. */
export class BestBuyApiError extends Error {
  constructor(readonly code: BestBuyErrorCode, readonly statusCode?: number) {
    super(code);
    this.name = 'BestBuyApiError';
  }

  get retryable(): boolean {
    return ['BEST_BUY_RATE_LIMITED', 'BEST_BUY_TIMEOUT', 'BEST_BUY_NETWORK_ERROR'].includes(this.code) ||
      (this.code === 'BEST_BUY_UPSTREAM_ERROR' && (this.statusCode ?? 0) >= 500);
  }
}

export interface BestBuyAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class BestBuyAdapter {
  readonly #apiKey: string;
  readonly #baseUrl: URL;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;
  readonly #now: () => Date;

  constructor(options: BestBuyAdapterOptions) {
    if (!options.apiKey.trim()) throw new Error('BESTBUY_API_KEY is required');
    this.#apiKey = options.apiKey;
    this.#baseUrl = parseProviderBaseUrl(options.baseUrl ?? 'https://api.bestbuy.com', 'Best Buy');
    this.#timeoutMs = parseTimeout(options.timeoutMs ?? 10_000);
    this.#fetch = options.fetchImpl ?? fetch;
    this.#now = options.now ?? (() => new Date());
  }

  async getOfferBySku(sku: string): Promise<ProductOffer> {
    const normalizedSku = normalizeSku(sku);
    const payload = await this.requestJson(this.createUrl(`/v1/products/${encodeURIComponent(normalizedSku)}.json`));
    return this.parseOffer(payload);
  }

  async searchOffers(query: string, pageSize = 10): Promise<ProductOffer[]> {
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0 || terms.length > 10 || terms.some(term => term.length > 100)) {
      throw new Error('Best Buy search query must contain 1 to 10 terms of at most 100 characters');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new Error('Best Buy pageSize must be an integer from 1 to 100');
    }

    const expression = terms.map(term => `search=${encodeURIComponent(term)}`).join('&');
    const url = this.createUrl(`/v1/products(${expression})`);
    url.searchParams.set('pageSize', String(pageSize));
    const parsed = BestBuySearchResponseSchema.safeParse(await this.requestJson(url));
    if (!parsed.success) throw new BestBuyApiError('BEST_BUY_INVALID_RESPONSE');
    return parsed.data.products.map(product => this.toProductOffer(product));
  }

  private createUrl(pathname: string): URL {
    const url = new URL(this.#baseUrl);
    url.pathname = this.#baseUrl.pathname.replace(/\/$/, '') + pathname;
    url.searchParams.set('format', 'json');
    url.searchParams.set('show', 'sku,name,salePrice,url,onlineAvailability,modelNumber,upc');
    url.searchParams.set('apiKey', this.#apiKey);
    return url;
  }

  private async requestJson(url: URL): Promise<unknown> {
    const signal = AbortSignal.timeout(this.#timeoutMs);
    try {
      const response = await this.#fetch(url, {
        method: 'GET', headers: { accept: 'application/json' }, redirect: 'error', signal
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        const code: BestBuyErrorCode = response.status === 401 || response.status === 403 ? 'BEST_BUY_UNAUTHORIZED' :
          response.status === 404 ? 'BEST_BUY_NOT_FOUND' : response.status === 429 ? 'BEST_BUY_RATE_LIMITED' :
            'BEST_BUY_UPSTREAM_ERROR';
        throw new BestBuyApiError(code, response.status);
      }
      try { return await response.json(); }
      catch { throw new BestBuyApiError('BEST_BUY_INVALID_RESPONSE'); }
    } catch (error) {
      if (error instanceof BestBuyApiError) throw error;
      throw new BestBuyApiError(signal.aborted ? 'BEST_BUY_TIMEOUT' : 'BEST_BUY_NETWORK_ERROR');
    }
  }

  private parseOffer(payload: unknown): ProductOffer {
    const parsed = BestBuyProductSchema.safeParse(payload);
    if (!parsed.success) throw new BestBuyApiError('BEST_BUY_INVALID_RESPONSE');
    return this.toProductOffer(parsed.data);
  }

  private toProductOffer(product: BestBuyProduct): ProductOffer {
    const sku = String(product.sku);
    const productUrl = validateRetailerUrl(product.url);
    let observedAt: string;
    try { observedAt = this.#now().toISOString(); }
    catch { throw new BestBuyApiError('BEST_BUY_INVALID_RESPONSE'); }

    const result = ProductOfferSchema.safeParse({
      id: `best-buy:${sku}:${observedAt}`,
      source: 'BEST_BUY', retailerName: 'Best Buy', productName: product.name, sku,
      model: product.modelNumber ?? null, gtin: product.upc ?? null, condition: 'NEW',
      priceCents: dollarsToCents(product.salePrice), shippingCents: null, currency: 'USD',
      inStock: product.onlineAvailability ?? null, productUrl, observedAt
    });
    if (!result.success) throw new BestBuyApiError('BEST_BUY_INVALID_RESPONSE');
    return result.data;
  }
}

function normalizeSku(sku: string): string {
  const normalized = sku.trim();
  if (!/^\d+$/.test(normalized)) throw new Error('Best Buy SKU must contain only digits');
  return normalized;
}

function dollarsToCents(dollars: number): number {
  const cents = Math.round(dollars * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 2_147_483_647) {
    throw new BestBuyApiError('BEST_BUY_INVALID_RESPONSE');
  }
  return cents;
}

function parseTimeout(timeoutMs: number): number {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120_000) {
    throw new Error('Best Buy timeout must be an integer from 1 to 120000 milliseconds');
  }
  return timeoutMs;
}

function parseProviderBaseUrl(value: string, provider: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error(`Invalid ${provider} base URL`); }
  const localHttp = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || localHttp) || url.username || url.password || url.search || url.hash) {
    throw new Error(`Invalid ${provider} base URL`);
  }
  return url;
}

function validateRetailerUrl(value: string): string {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || (url.hostname !== 'bestbuy.com' && !url.hostname.endsWith('.bestbuy.com'))) throw new Error();
    return url.toString();
  } catch { throw new BestBuyApiError('BEST_BUY_INVALID_RESPONSE'); }
}

