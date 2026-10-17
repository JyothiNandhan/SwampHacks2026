import { RefundSchema, type Refund, type RecoveryCase } from '@moneyback/contracts';

export interface DepositCandidate {
  id: string; amountCents: number; occurredAt: string; reference: string | null; simulated: true; evidenceId: string;
}

export interface RefundExpectation {
  id: string; caseId: string; expectedAmountCents: number; expectedAt: string | null;
  merchantName: string; reference: string | null; createdAt: string; evidenceIds: string[];
}

/** Reconciles only strongly correlated simulated deposits; equal amount alone is never sufficient. */
export function reconcileRefund(input: {
  recoveryCase: RecoveryCase; expectation: RefundExpectation; deposits: DepositCandidate[]; now: string; gracePeriodDays?: number;
}): Refund[] {
  if (input.expectation.caseId !== input.recoveryCase.id) throw new Error('REFUND_CASE_MISMATCH');
  const now = new Date(input.now);
  if (Number.isNaN(now.valueOf())) throw new Error('INVALID_RECONCILIATION_TIME');
  const candidates = input.deposits.filter(deposit => isCorrelated(deposit.reference, input.expectation));
  const refunds = candidates.map(deposit => RefundSchema.parse({
    id: `${input.expectation.id}:${deposit.id}`, caseId: input.recoveryCase.id, depositId: deposit.id,
    expectedAmountCents: input.expectation.expectedAmountCents, confirmedAmountCents: deposit.amountCents,
    status: 'MATCHED', simulated: true, evidenceIds: [...new Set([...input.expectation.evidenceIds, deposit.evidenceId])],
    expectedAt: input.expectation.expectedAt, createdAt: input.expectation.createdAt, updatedAt: now.toISOString()
  }));
  if (refunds.length) return refunds;
  const graceMs = (input.gracePeriodDays ?? 3) * 86_400_000;
  const missing = input.expectation.expectedAt !== null && now.valueOf() > Date.parse(input.expectation.expectedAt) + graceMs;
  return [RefundSchema.parse({ id: input.expectation.id, caseId: input.recoveryCase.id, depositId: null,
    expectedAmountCents: input.expectation.expectedAmountCents, confirmedAmountCents: null,
    status: missing ? 'REJECTED' : 'PENDING', simulated: true, evidenceIds: input.expectation.evidenceIds,
    expectedAt: input.expectation.expectedAt, createdAt: input.expectation.createdAt, updatedAt: now.toISOString() })];
}

export function summarizeRefunds(expectedAmountCents: number, refunds: Refund[]): {
  matchedAmountCents: number; remainingAmountCents: number; state: 'PENDING'|'PARTIAL'|'MATCHED'|'OVERPAID';
} {
  const matchedAmountCents = refunds.filter(item => item.status === 'MATCHED' || item.status === 'CONFIRMED')
    .reduce((sum,item) => sum + (item.confirmedAmountCents ?? 0), 0);
  return { matchedAmountCents, remainingAmountCents: Math.max(0, expectedAmountCents-matchedAmountCents),
    state: matchedAmountCents === 0 ? 'PENDING' : matchedAmountCents < expectedAmountCents ? 'PARTIAL' :
      matchedAmountCents === expectedAmountCents ? 'MATCHED' : 'OVERPAID' };
}

function isCorrelated(reference: string | null, expectation: RefundExpectation): boolean {
  const candidate = normalize(reference);
  if (!candidate) return false;
  const explicit = normalize(expectation.reference);
  if (explicit && candidate.includes(explicit)) return true;
  const merchant = normalize(expectation.merchantName);
  return merchant.length >= 4 && candidate.includes(merchant) && /refund|credit|return/.test(candidate);
}
function normalize(value: string | null): string { return value?.trim().toLowerCase().replace(/[^a-z0-9]/g,'') ?? ''; }

