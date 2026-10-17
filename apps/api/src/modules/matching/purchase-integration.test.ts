import { expect,test,vi } from 'vitest';
import { createPurchaseIntegrator } from './purchase-integration.js';
const receipt={id:'r',source:'PHOTO' as const,merchantName:'Best Buy',orderNumber:'ORDER-1',purchasedAt:'2026-10-17T12:00:00Z',totalCents:10000,currency:'USD' as const,originalFileId:'f',extractionStatus:'EXTRACTED' as const};
const transaction={id:'t',nessiePurchaseId:'n',accountId:'a',merchantId:'m',merchantName:'Best Buy',amountCents:10000,currency:'USD' as const,occurredAt:'2026-10-17T13:00:00Z',receiptStatus:'UNMATCHED' as const};
test('T12 sends a confirmed match, normalized items and evidence through one persistence boundary',async()=>{
  const save=vi.fn(async(input)=>({id:'p',transactionId:'t',receiptIds:['r'],merchantName:'Best Buy',orderNumber:'ORDER-1',
    purchasedAt:receipt.purchasedAt,amountCents:10000,currency:'USD' as const,matchStatus:input.matchStatus,items:input.items}));
  const integrate=createPurchaseIntegrator({save});
  const item={name:'Laptop',brand:null,model:'A1',sku:'123',gtin:null,quantity:1,unitPriceCents:10000};
  const evidence={id:'e',sourceType:'RECEIPT' as const,sourceId:'r',category:'PURCHASE_PROOF',acquisitionMethod:'PHOTO',rawUrl:null,checksum:'abc',createdAt:'2026-10-17T12:00:00Z'};
  const result=await integrate({userId:'u',receipt,transactions:[transaction],items:[item],evidence:[evidence],transactionReferences:{t:'ORDER-1'}});
  expect(result?.matchStatus).toBe('MATCHED'); expect(save).toHaveBeenCalledOnce();
});
test('T12 does not persist weak guesses',async()=>{
  const save=vi.fn(); const integrate=createPurchaseIntegrator({save});
  expect(await integrate({userId:'u',receipt:{...receipt,merchantName:'Other',totalCents:999,purchasedAt:'2025-01-01T00:00:00Z'},transactions:[transaction],items:[],evidence:[]})).toBeNull();
  expect(save).not.toHaveBeenCalled();
});
