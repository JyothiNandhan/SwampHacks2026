import { describe, expect, test } from 'vitest';
import type { RecoveryCase } from '@moneyback/contracts';
import { RecoveryTransitionError, transitionRecoveryCase } from './state-machine.js';
const now='2026-10-17T16:00:00.000Z';
const recoveryCase:RecoveryCase={id:'case-1',opportunityId:'opportunity-1',status:'REVIEW',expectedRefundCents:2500,
  confirmedRefundCents:0,matchingNessieDepositId:null,approvedAt:null,updatedAt:now};
describe('T07 recovery state machine',()=>{
  test('requires explicit user approval and records its timestamp',()=>{
    expect(()=>transitionRecoveryCase(recoveryCase,'APPROVED',{actor:'AGENT',explicitApproval:true,occurredAt:now})).toThrowError(RecoveryTransitionError);
    expect(transitionRecoveryCase(recoveryCase,'APPROVED',{actor:'USER',explicitApproval:true,occurredAt:now})).toMatchObject({status:'APPROVED',approvedAt:now});
  });
  test('forbids agent-driven submission and illegal terminal transitions',()=>{
    const approved={...recoveryCase,status:'APPROVED',approvedAt:now} as RecoveryCase;
    expect(()=>transitionRecoveryCase(approved,'SUBMITTED',{actor:'AGENT',occurredAt:now})).toThrow('AGENT_SUBMISSION_FORBIDDEN');
    expect(()=>transitionRecoveryCase({...recoveryCase,status:'CONFIRMED'},'REVIEW',{actor:'USER',occurredAt:now})).toThrow('INVALID_TRANSITION');
  });
});
