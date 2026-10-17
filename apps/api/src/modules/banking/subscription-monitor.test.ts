import { expect, test } from 'vitest';
import { detectSubscriptionPriceChange } from './subscription-monitor.js';
const subscription = {id:'s',accountId:'a',merchantName:'Stream Co',planName:'Plus',amountCents:1299,currency:'USD' as const,
  billingCycle:'MONTHLY' as const,startedAt:'2026-08-01T00:00:00.000Z',nextBillingAt:null};
test('T16 alerts only on two supported recurring observations', () => {
  expect(detectSubscriptionPriceChange(subscription,[
    {id:'1',merchantName:'Stream Co',planName:'Plus',amountCents:999,occurredAt:'2026-09-01T00:00:00Z',recurring:true},
    {id:'2',merchantName:'stream-co',planName:'Plus',amountCents:1299,occurredAt:'2026-10-01T00:00:00Z',recurring:true}
  ])).toMatchObject({increaseCents:300,supported:true});
  expect(detectSubscriptionPriceChange(subscription,[{id:'1',merchantName:'Stream Co',planName:'Plus',amountCents:999,occurredAt:'2026-09-01T00:00:00Z',recurring:false}])).toBeNull();
});
