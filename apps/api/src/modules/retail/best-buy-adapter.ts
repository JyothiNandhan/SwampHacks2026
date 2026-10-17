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
});

const BestBuySearchResponseSchema = z.object({
  products: z.array(BestBuyProductSchema),
  total: z.number().int().nonnegative().optional()
});

type BestBuyProduct = z.infer<typeof BestBuyProductSchema>;

export class BestBuyApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number
  ) {
    super(message);
    this.name = 'BestBuyApiError';
  }
}

export interface BestBuyAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class BestBuyAdapter {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;

  constructor(private readonly options: BestBuyAdapterOptions) {
    if (!options.apiKey.trim()) {
      throw new Error('BESTBUY_API_KEY is required');
    }

    this.baseUrl = (options.baseUrl ?? 'https://api.bestbuy.com').replace(/\/$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
  }

  async getOfferBySku(sku: string): Promise<ProductOffer> {
    const normalizedSku = normalizeSku(sku);
    const url = new URL(`/v1/products/${encodeURIComponent(normalizedSku)}.json`, this.baseUrl);
    this.addCommonParameters(url);

    const payload = await this.requestJson(url);
    return this.toProductOffer(BestBuyProductSchema.parse(payload));
  }

  async searchOffers(query: string, pageSize = 10): Promise<ProductOffer[]> {
    const terms = query.trim().split(/\s+/).filter(Boolean);
    if (terms.length === 0) {
      throw new Error('Best Buy search query must not be empty');
    }
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new Error('Best Buy pageSize must be an integer from 1 to 100');
    }

    const searchExpression = terms
      .map((term) => `search=${encodeURIComponent(term)}`)
      .join('&');
    const url = new URL(`/v1/products(${searchExpression})`, this.baseUrl);
    this.addCommonParameters(url);
    url.searchParams.set('pageSize', String(pageSize));

    const payload = BestBuySearchResponseSchema.parse(await this.requestJson(url));
    return payload.products.map((product) => this.toProductOffer(product));
  }

  private addCommonParameters(url: URL): void {
    url.searchParams.set('format', 'json');
    url.searchParams.set(
      'show',
      'sku,name,salePrice,url,onlineAvailability,modelNumber,upc'
    );
    url.searchParams.set('apiKey', this.options.apiKey);
  }

  private async requestJson(url: URL): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { accept: 'application/json' }
      });
    } catch (error) {
      throw new BestBuyApiError(
        `Best Buy request failed: ${error instanceof Error ? error.message : 'network error'}`
      );
    }

    if (!response.ok) {
      throw new BestBuyApiError(
        `Best Buy request returned HTTP ${response.status}`,
        response.status
      );
    }

    try {
      return await response.json();
    } catch {
      throw new BestBuyApiError('Best Buy returned invalid JSON', response.status);
    }
  }

  private toProductOffer(product: BestBuyProduct): ProductOffer {
    const sku = String(product.sku);
    const observedAt = this.now().toISOString();

    return ProductOfferSchema.parse({
      id: `best-buy:${sku}:${observedAt}`,
      source: 'BEST_BUY',
      retailerName: 'Best Buy',
      productName: product.name,
      sku,
      model: product.modelNumber ?? null,
      gtin: product.upc ?? null,
      condition: 'NEW',
      priceCents: dollarsToCents(product.salePrice),
      shippingCents: null,
      currency: 'USD',
      inStock: product.onlineAvailability ?? null,
      productUrl: product.url,
      observedAt
    });
  }
}

function normalizeSku(sku: string): string {
  const normalized = sku.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error('Best Buy SKU must contain only digits');
  }
  return normalized;
}

function dollarsToCents(dollars: number): number {
  const cents = Math.round(dollars * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) {
    throw new Error('Best Buy salePrice cannot be represented as integer cents');
  }
  return cents;
}

