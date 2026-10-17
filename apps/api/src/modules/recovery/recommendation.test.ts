import { describe,expect,test } from 'vitest';
import type { Evidence,Opportunity,RecoveryCase } from '@moneyback/contracts';
import { createApprovalArtifacts,createRecoveryRecommendation } from './recommendation.js';
import { transitionRecoveryCase } from './state-machine.js';
const now='2026-10-17T16:00:00.000Z';
const recoveryCase:RecoveryCase={id:'case-1',opportunityId:'opportunity-1',status:'REVIEW',expectedRefundCents:2500,confirmedRefundCents:0,matchingNessieDepositId:null,approvedAt:null,updatedAt:now};
const opportunity:Opportunity={id:'opportunity-1',purchaseId:'purchase-1',type:'PRICE_DROP',estimatedSavingsCents:2500,currency:'USD',status:'REVIEW',eligibility:'VERIFIED',evidenceIds:['evidence-1'],deadlineAt:null,createdAt:now};
const evidence:Evidence={id:'evidence-1',sourceType:'OFFER',sourceId:'offer-1',category:'PRICE_OBSERVATION',acquisitionMethod:'BEST_BUY_API',rawUrl:'https://www.bestbuy.com/site/item/1.p',checksum:null,createdAt:now};
describe('T11 recommendations and audit artifacts',()=>{
  test('creates an evidence-backed draft that still requires user approval',()=>expect(createRecoveryRecommendation(opportunity,[evidence])).toMatchObject({decision:'READY_FOR_USER_APPROVAL',reasonCodes:['EVIDENCE_VERIFIED'],requiresExplicitApproval:true}));
  test('falls back to review when evidence is absent',()=>expect(createRecoveryRecommendation(opportunity,[])).toMatchObject({decision:'REVIEW',reasonCodes:['EVIDENCE_MISSING'],actionDraft:null}));
  test('builds canonical approval artifacts without submitting',()=>{
    const approved=transitionRecoveryCase(recoveryCase,'APPROVED',{actor:'USER',explicitApproval:true,occurredAt:now});
    const artifacts=createApprovalArtifacts(approved,opportunity,{eventId:'event-1',notificationId:'notification-1'},now);
    expect(artifacts.event.eventType).toBe('USER_APPROVED_RECOVERY');expect(artifacts.notification.message).toContain('separate explicit action');
  });
});
