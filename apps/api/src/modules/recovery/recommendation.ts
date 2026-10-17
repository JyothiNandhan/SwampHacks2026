import {
  EventSchema,
  EvidenceSchema,
  NotificationSchema,
  OpportunitySchema,
  RecoveryCaseSchema,
  type Event,
  type Evidence,
  type Notification,
  type Opportunity,
  type RecoveryCase
} from '@moneyback/contracts';

export interface RecoveryRecommendation {
  opportunityId: string;
  decision: 'REVIEW' | 'READY_FOR_USER_APPROVAL' | 'NO_ACTION';
  reasonCodes: string[];
  evidenceIds: string[];
  actionDraft: string | null;
  requiresExplicitApproval: true;
}

export interface RecoveryArtifacts {
  event: Event;
  notification: Notification;
}

export function createRecoveryRecommendation(opportunityInput: Opportunity,
  evidenceInputs: Evidence[]): RecoveryRecommendation {
  const opportunity = OpportunitySchema.parse(opportunityInput);
  const evidence = evidenceInputs.map(item => EvidenceSchema.parse(item));
  const available = new Set(evidence.map(item => item.id));
  const missing = opportunity.evidenceIds.filter(id => !available.has(id));
  if (missing.length || !opportunity.evidenceIds.length) {
    return recommendation(opportunity, 'REVIEW', ['EVIDENCE_MISSING'], null);
  }
  if (opportunity.eligibility === 'INELIGIBLE') {
    return recommendation(opportunity, 'NO_ACTION', ['POLICY_INELIGIBLE'], null);
  }
  if (opportunity.eligibility !== 'VERIFIED') {
    return recommendation(opportunity, 'REVIEW', ['ELIGIBILITY_REQUIRES_REVIEW'], null);
  }
  if (opportunity.estimatedSavingsCents === null || opportunity.estimatedSavingsCents <= 0) {
    return recommendation(opportunity, 'NO_ACTION', ['NO_VERIFIED_SAVINGS'], null);
  }
  return recommendation(opportunity, 'READY_FOR_USER_APPROVAL', ['EVIDENCE_VERIFIED'],
    `Request review for a potential USD ${(opportunity.estimatedSavingsCents / 100).toFixed(2)} recovery. ` +
    'Verify the cited evidence and submit only after the user explicitly approves.');
}

/** Creates auditable user-facing artifacts; it never submits a merchant action. */
export function createApprovalArtifacts(caseInput: RecoveryCase, opportunityInput: Opportunity,
  ids: { eventId: string; notificationId: string }, occurredAt: string): RecoveryArtifacts {
  const recoveryCase = RecoveryCaseSchema.parse(caseInput);
  const opportunity = OpportunitySchema.parse(opportunityInput);
  if (recoveryCase.opportunityId !== opportunity.id || recoveryCase.status !== 'APPROVED' || !recoveryCase.approvedAt) {
    throw new Error('APPROVED_CASE_REQUIRED');
  }
  const event = EventSchema.parse({
    id: ids.eventId,
    entityType: 'RECOVERY_CASE',
    entityId: recoveryCase.id,
    eventType: 'USER_APPROVED_RECOVERY',
    eventPayload: { opportunityId: opportunity.id, approvedAt: recoveryCase.approvedAt },
    createdAt: occurredAt
  });
  const notification = NotificationSchema.parse({
    id: ids.notificationId,
    opportunityId: opportunity.id,
    type: notificationType(opportunity.type),
    title: 'Recovery approved',
    message: 'Your approval was recorded. Submission remains a separate explicit action.',
    createdAt: occurredAt,
    readAt: null
  });
  return { event, notification };
}

function recommendation(opportunity: Opportunity, decision: RecoveryRecommendation['decision'], reasonCodes: string[],
  actionDraft: string | null): RecoveryRecommendation {
  return {
    opportunityId: opportunity.id,
    decision,
    reasonCodes,
    evidenceIds: [...opportunity.evidenceIds],
    actionDraft,
    requiresExplicitApproval: true
  };
}

function notificationType(type: Opportunity['type']): Notification['type'] {
  if (type === 'PRICE_DROP') return 'PRICE_DROP';
  if (type === 'MISSING_REFUND') return 'REFUND';
  if (type === 'SUBSCRIPTION_INCREASE' || type === 'OVERBILLING') return 'BILLING';
  if (type === 'WARRANTY') return 'WARRANTY';
  return 'RETURN_DEADLINE';
}
