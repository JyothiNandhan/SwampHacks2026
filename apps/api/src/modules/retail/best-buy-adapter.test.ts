import { describe, expect, test, vi } from 'vitest';
import { BestBuyAdapter, BestBuyApiError } from './best-buy-adapter.js';

const observedAt = new Date('2026-10-17T12:00:00.000Z');

describe('BestBuyAdapter', () => {
  test('loads a SKU and normalizes it to the shared ProductOffer contract', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        sku: 6577010,
        name: 'Example Smart Watch',
        salePrice: 249.99,
        url: 'https://www.bestbuy.com/site/example/6577010.p',
        onlineAvailability: true,
        modelNumber: 'WATCH-42',
        upc: '012345678905'
      })
    );
    const adapter = new BestBuyAdapter({
      apiKey: 'test-key',
      fetchImpl,
      now: () => observedAt
    });

    await expect(adapter.getOfferBySku('6577010')).resolves.toEqual({
      id: 'best-buy:6577010:2026-10-17T12:00:00.000Z',
      source: 'BEST_BUY',
      retailerName: 'Best Buy',
      productName: 'Example Smart Watch',
      sku: '6577010',
      model: 'WATCH-42',
      gtin: '012345678905',
      condition: 'NEW',
      priceCents: 24999,
      shippingCents: null,
      currency: 'USD',
      inStock: true,
      productUrl: 'https://www.bestbuy.com/site/example/6577010.p',
      observedAt: '2026-10-17T12:00:00.000Z'
    });

    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe('/v1/products/6577010.json');
    expect(requestedUrl.searchParams.get('apiKey')).toBe('test-key');
  });

  test('builds a keyword search and returns normalized offers', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json({
        total: 1,
        products: [
          {
            sku: '12345',
            name: 'Stainless Oven',
            salePrice: 584,
            url: 'https://www.bestbuy.com/site/stainless-oven/12345.p',
            onlineAvailability: false
          }
        ]
      })
    );
    const adapter = new BestBuyAdapter({
      apiKey: 'test-key',
      fetchImpl,
      now: () => observedAt
    });

    const offers = await adapter.searchOffers('stainless oven', 5);

    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ sku: '12345', priceCents: 58400 });
    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(decodeURIComponent(requestedUrl.pathname)).toBe(
      '/v1/products(search=stainless&search=oven)'
    );
    expect(requestedUrl.searchParams.get('pageSize')).toBe('5');
  });

  test('rejects invalid SKU values before sending a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const adapter = new BestBuyAdapter({ apiKey: 'test-key', fetchImpl });

    await expect(adapter.getOfferBySku('123/secret')).rejects.toThrow(
      'Best Buy SKU must contain only digits'
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('does not expose the API key in HTTP errors', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('unauthorized', { status: 401 })
    );
    const adapter = new BestBuyAdapter({ apiKey: 'super-secret', fetchImpl });

    const request = adapter.getOfferBySku('6577010');
    await expect(request).rejects.toBeInstanceOf(BestBuyApiError);
    await expect(request).rejects.not.toThrow('super-secret');
  });
});
