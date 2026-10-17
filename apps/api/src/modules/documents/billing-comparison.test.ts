import { expect,test } from 'vitest';
import { compareRentalBill } from './billing-comparison.js';
const evidence=(id:string)=>({id,sourceType:'POLICY' as const,sourceId:id,category:'TERMS',acquisitionMethod:'FIXTURE',rawUrl:null,checksum:id,createdAt:'2026-10-17T12:00:00.000Z'});
test('T17 detects changed and unverified lines without overstating eligibility',()=>{
  const result=compareRentalBill({purchaseId:'purchase-1',evidence:[evidence('agreement'),evidence('bill')],agreement:[{label:'Daily rate',amountCents:10000,evidenceId:'agreement'}],finalBill:[{label:'Daily rate',amountCents:12000,evidenceId:'bill'},{label:'Cleaning fee',amountCents:5000,evidenceId:null}]});
  expect(result.comparison).toMatchObject({differenceCents:7000,eligibility:'REVIEW_REQUIRED'});
  expect(result.changedLines).toEqual([{label:'Daily rate',expectedCents:10000,actualCents:12000}]);expect(result.unverifiedFees[0].label).toBe('Cleaning fee');
});
