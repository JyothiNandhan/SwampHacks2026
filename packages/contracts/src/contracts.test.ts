import { readFileSync, readdirSync } from 'node:fs';
import type { ZodType } from 'zod';
import { describe, expect, test } from 'vitest';
import * as contracts from './index.js';

const fixtureDir = new URL('../fixtures/', import.meta.url);
const fixtures = Object.fromEntries(readdirSync(fixtureDir).filter(f => f.endsWith('.json')).map(file => [
  file.replace('.json', ''), JSON.parse(readFileSync(new URL(file, fixtureDir), 'utf8')) as unknown
]));
const schemas: Record<string, ZodType> = {}; // assigned from canonical exports below
for (const [name, schema] of Object.entries(contracts)) {
  if (name.endsWith('Schema') && typeof schema === 'object' && schema && 'safeParse' in schema) {
    schemas[name.replace(/Schema$/, '')] = schema as ZodType;
  }
}
describe('frozen v1 JSON fixtures', () => {
  for (const [name, schema] of Object.entries(schemas)) {
    // ReceiptSource is an enum embedded in Receipt, rather than a domain entity.
    if (name.endsWith('Request') || name === 'Health' || name === 'ReceiptSource') continue;
    test(`${name} fixture validates without transformations`, () => {
      expect(fixtures[name]).toBeDefined();
      expect(schema.parse(fixtures[name])).toEqual(fixtures[name]);
    });
  }
});
test.each([-1, 1.5, 2147483648, NaN, Infinity, '30000'])('invalid cents rejected: %s', amount => {
  expect(contracts.Cents.safeParse(amount).success).toBe(false);
});
test('uncertain receipts preserve nulls and extra/renamed fields fail', () => {
  const receipt = contracts.ReceiptSchema.parse(fixtures.Receipt);
  expect(contracts.ReceiptSchema.safeParse({ ...receipt, totalCents: null, purchasedAt: null }).success).toBe(true);
  expect(contracts.ReceiptSchema.safeParse({ ...receipt, total_amount: 30000 }).success).toBe(false);
  expect(contracts.ReceiptSchema.safeParse({ ...receipt, purchasedAt: '2026-10-17' }).success).toBe(false);
});
test('offers reject malformed links, negative shipping, date-only timestamps and unknown conditions', () => {
  const offer = contracts.ProductOfferSchema.parse(fixtures.ProductOffer);
  for (const invalid of [{ productUrl: 'invalid' }, { productUrl: 'javascript:alert(1)' }, { productUrl: 'ftp://example.com/watch' }, { shippingCents: -1 }, { observedAt: '2026-10-17' }, { condition: 'MINT' }]) {
    expect(contracts.ProductOfferSchema.safeParse({ ...offer, ...invalid }).success).toBe(false);
  }
});
test('policies require evidence and refunds cannot claim unsupported confirmation', () => {
  const policy = contracts.PolicySchema.parse(fixtures.Policy);
  expect(contracts.PolicySchema.safeParse({ ...policy, evidenceIds: [] }).success).toBe(false);
  const refund = contracts.RefundSchema.parse(fixtures.Refund);
  expect(contracts.RefundSchema.safeParse({ ...refund, status: 'CONFIRMED' }).success).toBe(false);
  expect(contracts.RefundSchema.safeParse({ ...refund, simulated: false }).success).toBe(false);
  expect(contracts.RefundSchema.safeParse({ ...refund, status: 'MATCHED', depositId: 'deposit-1', confirmedAmountCents: 2500 }).success).toBe(true);
});
test('HTTP envelopes and explicit user approval are frozen', () => {
  expect(contracts.PageSchema(contracts.PurchaseSchema).parse({ data: [fixtures.Purchase], nextCursor: null }).data).toHaveLength(1);
  expect(contracts.ResponseSchema(contracts.PurchaseSchema).safeParse(fixtures.Purchase).success).toBe(false);
  expect(contracts.ApprovalRequestSchema.safeParse({ approved: false }).success).toBe(false);
});
test('all registered routes refer to exported runtime validators and declare security', () => {
  const registry = JSON.parse(readFileSync(new URL('../../../config/api-contract.json', import.meta.url), 'utf8'));
  expect(registry.contractVersion).toBe(contracts.CONTRACT_VERSION);
  for (const route of registry.routes) {
    for (const field of ['responseSchema', 'errorSchema', ...(route.method === 'POST' ? ['requestSchema'] : [])]) {
      expect(route[field]).toBeTypeOf('string');
      expect(route[field] in contracts.HttpSchemas).toBe(true);
    }
    expect(['public', 'user', 'internal', 'admin/demo']).toContain(route.security);
    if (route.security === 'public') expect(route.path).toBe('/health');
  }
});
