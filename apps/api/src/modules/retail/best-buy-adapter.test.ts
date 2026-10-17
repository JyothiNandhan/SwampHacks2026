import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';
import { BestBuyAdapter, BestBuyApiError } from './best-buy-adapter.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/best-buy-product.json', import.meta.url), 'utf8'));
const observedAt = new Date('2026-10-17T12:00:00.000Z');

describe('BestBuyAdapter', () => {
  test('loads a SKU and normalizes the fixture to ProductOffer', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture));
    const adapter = new BestBuyAdapter({ apiKey: 'test-key', fetchImpl, now: () => observedAt });
    await expect(adapter.getOfferBySku('6577010')).resolves.toEqual({
      id: 'best-buy:6577010:2026-10-17T12:00:00.000Z', source: 'BEST_BUY', retailerName: 'Best Buy',
      productName: 'Example Smart Watch', sku: '6577010', model: 'WATCH-42', gtin: '012345678905',
      condition: 'NEW', priceCents: 24999, shippingCents: null, currency: 'USD', inStock: true,
      productUrl: 'https://www.bestbuy.com/site/example/6577010.p', observedAt: '2026-10-17T12:00:00.000Z'
    });
    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(requestedUrl.pathname).toBe('/v1/products/6577010.json');
    expect(requestedUrl.searchParams.get('apiKey')).toBe('test-key');
  });

  test('builds a keyword search and returns normalized offers', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ total: 1, products: [fixture] }));
    const adapter = new BestBuyAdapter({ apiKey: 'test-key', fetchImpl, now: () => observedAt });
    const offers = await adapter.searchOffers('smart watch', 5);
    expect(offers).toHaveLength(1);
    expect(offers[0]).toMatchObject({ sku: '6577010', priceCents: 24999 });
    const requestedUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(decodeURIComponent(requestedUrl.pathname)).toBe('/v1/products(search=smart&search=watch)');
    expect(requestedUrl.searchParams.get('pageSize')).toBe('5');
  });

  test('rejects invalid input before sending a request', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const adapter = new BestBuyAdapter({ apiKey: 'test-key', fetchImpl });
    await expect(adapter.getOfferBySku('123/secret')).rejects.toThrow('Best Buy SKU must contain only digits');
    await expect(adapter.searchOffers('   ')).rejects.toThrow('Best Buy search query');
    await expect(adapter.searchOffers('watch', 101)).rejects.toThrow('pageSize');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('rejects non-Best-Buy links and invalid provider payloads', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ ...fixture, url: 'https://attacker.example/product' }))
      .mockResolvedValueOnce(Response.json({ ...fixture, salePrice: '249.99' }));
    const adapter = new BestBuyAdapter({ apiKey: 'test-key', fetchImpl, now: () => observedAt });
    await expect(adapter.getOfferBySku('6577010')).rejects.toMatchObject({ code: 'BEST_BUY_INVALID_RESPONSE' });
    await expect(adapter.getOfferBySku('6577010')).rejects.toMatchObject({ code: 'BEST_BUY_INVALID_RESPONSE' });
  });

  test('classifies HTTP failures without exposing the API key or body', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('super-secret body', { status: 429 }));
    const adapter = new BestBuyAdapter({ apiKey: 'super-secret-key', fetchImpl });
    const request = adapter.getOfferBySku('6577010');
    await expect(request).rejects.toEqual(expect.objectContaining({
      code: 'BEST_BUY_RATE_LIMITED', statusCode: 429, retryable: true
    }));
    await expect(request).rejects.not.toThrow('super-secret');
    await expect(request).rejects.toBeInstanceOf(BestBuyApiError);
  });
});
