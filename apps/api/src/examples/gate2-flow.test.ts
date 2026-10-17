import {expect,test} from 'vitest';
import {runGate2Example} from './gate2-flow.js';
test('complete Gate 2 example produces a user-approved, evidence-backed matched recovery',async()=>{
  await expect(runGate2Example()).resolves.toEqual({purchaseStatus:'MATCHED',policyEligibility:'VERIFIED',deadlineType:'RETURN',
    savingsCents:14000,recommendation:'READY_FOR_USER_APPROVAL',approvedStatus:'APPROVED',refundState:'MATCHED',
    subscriptionIncreaseCents:300,rentalDifferenceCents:2000});
});
