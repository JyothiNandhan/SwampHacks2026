import { readFileSync } from 'node:fs';
import { describe, expect, test, vi } from 'vitest';
import { BrightDataAdapter, BrightDataApiError } from './bright-data-adapter.js';

const amazonFixture = JSON.parse(readFileSync(new URL('./fixtures/bright-data-amazon.json', import.meta.url), 'utf8'));
const walmartFixture = JSON.parse(readFileSync(new URL('./fixtures/bright-data-walmart.json', import.meta.url), 'utf8'));
const datasetIds = { amazon: 'gd_amazon123', walmart: 'gd_walmart123' };

function responseFor(payload: unknown, status = 200): Response {
  return Response.json(payload, { status });
}

describe('BrightDataAdapter', () => {
  test('triggers, polls and normalizes an Amazon snapshot', async () => {
    const fetchImpl = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(responseFor({ snapshot_id: 'sd_snapshot1' }))
      .mockResolvedValueOnce(responseFor({ snapshot_id: 'sd_snapshot1', status: 'running' }))
      .mockResolvedValueOnce(responseFor({ snapshot_id: 'sd_snapshot1', status: 'ready' }))
      .mockResolvedValueOnce(responseFor(amazonFixture));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const adapter = new BrightDataAdapter({ apiKey: 'test-token', datasetIds, fetchImpl, sleep, pollIntervalMs: 25 });

    const offers = await adapter.collectOffers('amazon', ['https://www.amazon.com/dp/B0EXAMPLE1']);
    expect(offers).toEqual([expect.objectContaining({
      id: 'bright-data:sd_snapshot1:0', source: 'BRIGHT_DATA', retailerName: 'Amazon',
      productName: 'Example Smart Watch', sku: 'B0EXAMPLE1', model: 'WATCH-42', condition: 'NEW',
      priceCents: 21995, shippingCents: null, currency: 'USD', inStock: true,
      observedAt: '2026-10-17T13:00:00.000Z'
    })]);
    expect(sleep).toHaveBeenCalledWith(25);
    const triggerUrl = new URL(String(fetchImpl.mock.calls[0]?.[0]));
    expect(triggerUrl.pathname).toBe('/datasets/v3/trigger');
    expect(triggerUrl.searchParams.get('dataset_id')).toBe('gd_amazon123');
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toMatchObject({ authorization: 'Bearer test-token' });
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toEqual({
      input: [{ url: 'https://www.amazon.com/dp/B0EXAMPLE1' }], limit_per_input: 1
    });
  });

  test('normalizes Walmart field variants and exact cents', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(responseFor(walmartFixture));
    const adapter = new BrightDataAdapter({ apiKey: 'token', datasetIds, fetchImpl });
    const offers = await adapter.downloadOffers('s_snapshot2', 'walmart');
    expect(offers).toEqual([expect.objectContaining({
      retailerName: 'Walmart', sku: '987654321', gtin: '012345678905', condition: 'OPEN_BOX',
      priceCents: 22450, shippingCents: 0, inStock: false,
      productUrl: 'https://www.walmart.com/ip/987654321'
    })]);
  });

  test.each([
    ['failed', 'BRIGHT_DATA_SNAPSHOT_FAILED'],
    ['canceled', 'BRIGHT_DATA_SNAPSHOT_CANCELED']
  ] as const)('maps %s snapshot state to a safe error', async (status, code) => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(responseFor({ snapshot_id: 's_job1', status }));
    const adapter = new BrightDataAdapter({ apiKey: 'token', datasetIds, fetchImpl });
    await expect(adapter.waitForSnapshot('s_job1')).rejects.toMatchObject({ code });
  });

  test('stops polling at the configured attempt limit', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockImplementation(async () =>
      responseFor({ snapshot_id: 's_job1', status: 'running' }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    const adapter = new BrightDataAdapter({ apiKey: 'token', datasetIds, fetchImpl, sleep, maxPollAttempts: 2 });
    await expect(adapter.waitForSnapshot('s_job1')).rejects.toMatchObject({ code: 'BRIGHT_DATA_TIMEOUT' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  test('rejects missing datasets and cross-retailer input URLs before fetching', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const missing = new BrightDataAdapter({ apiKey: 'token', datasetIds: {}, fetchImpl });
    await expect(missing.triggerCollection('amazon', ['https://www.amazon.com/dp/1']))
      .rejects.toMatchObject({ code: 'BRIGHT_DATA_NOT_CONFIGURED' });
    const adapter = new BrightDataAdapter({ apiKey: 'token', datasetIds, fetchImpl });
    await expect(adapter.triggerCollection('amazon', ['https://www.walmart.com/ip/1']))
      .rejects.toMatchObject({ code: 'BRIGHT_DATA_INVALID_RESPONSE' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('rejects invalid timestamp, currency, price and retailer result links', async () => {
    const invalidRecords = [
      { ...amazonFixture[0], scraped_at: 'yesterday' },
      { ...amazonFixture[0], currency: 'EUR' },
      { ...amazonFixture[0], final_price: 'free' },
      { ...amazonFixture[0], url: 'https://attacker.example/item' }
    ];
    for (const record of invalidRecords) {
      const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(responseFor([record]));
      const adapter = new BrightDataAdapter({ apiKey: 'token', datasetIds, fetchImpl });
      await expect(adapter.downloadOffers('s_job1', 'amazon')).rejects.toMatchObject({
        code: 'BRIGHT_DATA_INVALID_RESPONSE'
      });
    }
  });

  test('sanitizes upstream failures and marks rate limits retryable', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response('token and private record', { status: 429 }));
    const adapter = new BrightDataAdapter({ apiKey: 'super-secret', datasetIds, fetchImpl });
    const request = adapter.getSnapshotStatus('s_job1');
    await expect(request).rejects.toEqual(expect.objectContaining({
      code: 'BRIGHT_DATA_RATE_LIMITED', statusCode: 429, retryable: true
    }));
    await expect(request).rejects.not.toThrow('super-secret');
    await expect(request).rejects.toBeInstanceOf(BrightDataApiError);
  });
});

test('reads live Walmart model/availability fields without inventing shipping and rejects conflicts', async () => {
  const record={product_name:'Casio F91W-1',url:'https://www.walmart.com/ip/192953947',final_price:21.92,currency:'USD',condition:'New',mpn:'F91W-1',product_identifiers:{model:'F91W-1'},specifications:[{name:'Model',value:'F91W-1'}],is_available:true,availability:'in_stock',available_for_delivery:true};
  const fetchImpl=vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json([record])).mockResolvedValueOnce(Response.json([{...record,availability:'out_of_stock'}])).mockResolvedValueOnce(Response.json([{...record,model:'DIFFERENT-MODEL'}]));
  const adapter=new BrightDataAdapter({apiKey:'fixture',datasetIds,fetchImpl});
  expect((await adapter.downloadOffers('sd_live1','walmart'))[0]).toMatchObject({model:'F91W-1',inStock:true,condition:'NEW',priceCents:2192,shippingCents:null});
  expect((await adapter.downloadOffers('sd_live2','walmart'))[0].inStock).toBe(false);
  await expect(adapter.downloadOffers('sd_live3','walmart')).rejects.toMatchObject({code:'BRIGHT_DATA_INVALID_RESPONSE'});
});
