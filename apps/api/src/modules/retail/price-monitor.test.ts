import { expect, test } from 'vitest';
import { buildPriceDropOpportunity, compareExactProduct } from './price-monitor.js';

const purchase = { id:'purchase-1',transactionId:'tx',receiptIds:['r'],merchantName:'Best Buy',orderNumber:null,
  purchasedAt:'2026-10-01T12:00:00.000Z',amountCents:100000,currency:'USD' as const,matchStatus:'MATCHED' as const,
  items:[{name:'Laptop',brand:'Acme',model:'ABC-1',sku:'123',gtin:null,quantity:1,unitPriceCents:100000}] };
const offer = { id:'offer',source:'BEST_BUY' as const,retailerName:'Best Buy',productName:'Laptop',sku:'123',model:'ABC-1',gtin:null,
  condition:'NEW' as const,priceCents:85000,shippingCents:1000,currency:'USD' as const,inStock:true,
  productUrl:'https://www.bestbuy.com/site/item/123.p',observedAt:'2026-10-17T12:00:00.000Z' };

test('T14 compares exact identity, freshness, shipping and arithmetic savings', () => {
  expect(compareExactProduct({purchase,item:purchase.items[0],offer,maximumAgeMs:3_600_000,now:'2026-10-17T12:30:00.000Z'}))
    .toEqual({exactMatch:true,reason:'SKU',netOfferCents:86000,savingsCents:14000,fresh:true});
});
test('T14 rejects fuzzy identity and stale offers', () => {
  expect(buildPriceDropOpportunity({id:'o',purchase,item:{...purchase.items[0],sku:'different',model:null},offer,evidenceIds:['e'],
    maximumAgeMs:3_600_000,now:'2026-10-17T12:30:00.000Z'})).toBeNull();
  expect(buildPriceDropOpportunity({id:'o',purchase,item:purchase.items[0],offer,evidenceIds:['e'],
    maximumAgeMs:1_000,now:'2026-10-17T12:30:00.000Z'})).toBeNull();
});
test('T14 builds a review-gated opportunity and deduplicates evidence IDs', () => {
  expect(buildPriceDropOpportunity({id:'o',purchase,item:purchase.items[0],offer,evidenceIds:['e','e'],maximumAgeMs:3_600_000,
    now:'2026-10-17T12:30:00.000Z'})).toMatchObject({estimatedSavingsCents:14000,eligibility:'REVIEW_REQUIRED',evidenceIds:['e']});
});
