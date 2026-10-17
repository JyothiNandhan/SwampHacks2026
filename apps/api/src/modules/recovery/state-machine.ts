import { RecoveryCaseSchema, type RecoveryCase } from '@moneyback/contracts';

export type RecoveryStatus = RecoveryCase['status'];
export type RecoveryActor = 'USER' | 'STAFF' | 'SYSTEM' | 'AGENT';

export interface TransitionContext {
  actor: RecoveryActor;
  occurredAt: string;
  explicitApproval?: boolean;
  reason?: string;
}

export class RecoveryTransitionError extends Error {
  constructor(public readonly code: 'INVALID_TRANSITION' | 'EXPLICIT_APPROVAL_REQUIRED' | 'AGENT_SUBMISSION_FORBIDDEN') {
    super(code);
    this.name = 'RecoveryTransitionError';
  }
}

const transitions: Readonly<Record<RecoveryStatus, readonly RecoveryStatus[]>> = {
  DETECTED: ['REVIEW', 'EXPIRED'],
  REVIEW: ['APPROVED', 'REJECTED', 'EXPIRED'],
  APPROVED: ['SUBMITTED', 'REJECTED', 'EXPIRED'],
  SUBMITTED: ['PENDING', 'REJECTED'],
  PENDING: ['CONFIRMED', 'REJECTED', 'EXPIRED'],
  CONFIRMED: [],
  REJECTED: [],
  EXPIRED: []
};

export function transitionRecoveryCase(currentInput: RecoveryCase, target: RecoveryStatus,
  context: TransitionContext): RecoveryCase {
  const current = RecoveryCaseSchema.parse(currentInput);
  const occurredAt = new Date(context.occurredAt);
  if (Number.isNaN(occurredAt.valueOf())) throw new RecoveryTransitionError('INVALID_TRANSITION');
  if (!transitions[current.status].includes(target)) throw new RecoveryTransitionError('INVALID_TRANSITION');
  if (target === 'APPROVED' && (context.actor !== 'USER' || context.explicitApproval !== true)) {
    throw new RecoveryTransitionError('EXPLICIT_APPROVAL_REQUIRED');
  }
  if (target === 'SUBMITTED' && context.actor === 'AGENT') {
    throw new RecoveryTransitionError('AGENT_SUBMISSION_FORBIDDEN');
  }
  if (target === 'SUBMITTED' && !['USER', 'STAFF'].includes(context.actor)) {
    throw new RecoveryTransitionError('AGENT_SUBMISSION_FORBIDDEN');
  }
  return RecoveryCaseSchema.parse({
    ...current,
    status: target,
    approvedAt: target === 'APPROVED' ? occurredAt.toISOString() : current.approvedAt,
    updatedAt: occurredAt.toISOString()
  });
}

export function allowedRecoveryTransitions(status: RecoveryStatus): readonly RecoveryStatus[] {
  return transitions[status];
}
