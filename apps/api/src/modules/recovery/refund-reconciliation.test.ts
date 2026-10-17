import { describe,expect,test } from 'vitest';
import { reconcileRefund,summarizeRefunds } from './refund-reconciliation.js';
const recoveryCase={id:'case',opportunityId:'opp',status:'PENDING' as const,expectedRefundCents:10000,confirmedRefundCents:0,matchingNessieDepositId:null,approvedAt:'2026-10-01T00:00:00Z',updatedAt:'2026-10-01T00:00:00Z'};
const expectation={id:'refund',caseId:'case',expectedAmountCents:10000,expectedAt:'2026-10-10T00:00:00Z',merchantName:'Best Buy',reference:'RMA-42',createdAt:'2026-10-01T00:00:00Z',evidenceIds:['case-evidence']};
describe('T15 refund reconciliation',()=>{
  test('supports partial refunds and rejects unrelated equal-amount deposits',()=>{const refunds=reconcileRefund({recoveryCase,expectation,now:'2026-10-12T00:00:00Z',deposits:[
    {id:'unrelated',amountCents:10000,occurredAt:'2026-10-11T00:00:00Z',reference:'Payroll',simulated:true,evidenceId:'d1'},
    {id:'partial',amountCents:4000,occurredAt:'2026-10-11T00:00:00Z',reference:'Best Buy refund RMA-42',simulated:true,evidenceId:'d2'}]});
    expect(refunds).toHaveLength(1);expect(refunds[0].depositId).toBe('partial');expect(summarizeRefunds(10000,refunds)).toMatchObject({matchedAmountCents:4000,remainingAmountCents:6000,state:'PARTIAL'});});
  test('marks a late missing expectation without falsely matching',()=>expect(reconcileRefund({recoveryCase,expectation,deposits:[],now:'2026-10-20T00:00:00Z'})[0].status).toBe('REJECTED'));
});
