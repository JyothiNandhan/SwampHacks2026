import { BillingComparisonSchema, type Evidence } from '@moneyback/contracts';
import type { z } from 'zod';

type BillingComparison = z.output<typeof BillingComparisonSchema>;

export interface RentalCharge { label: string; amountCents: number; evidenceId: string | null }

export interface RentalComparisonResult {
  comparison: BillingComparison;
  changedLines: Array<{ label: string; expectedCents: number; actualCents: number }>;
  unverifiedFees: RentalCharge[];
}

export function compareRentalBill(input: {
  purchaseId: string; agreement: RentalCharge[]; finalBill: RentalCharge[]; evidence: Evidence[];
}): RentalComparisonResult {
  const evidenceIds = new Set(input.evidence.map(item => item.id));
  const expected = indexCharges(input.agreement);
  const actual = indexCharges(input.finalBill);
  const changedLines: RentalComparisonResult['changedLines'] = [];
  const unverifiedFees: RentalCharge[] = [];
  let differenceCents = 0;
  for (const [label, charge] of actual) {
    const baseline = expected.get(label);
    if (!baseline) {
      unverifiedFees.push(charge);
      differenceCents += charge.amountCents;
    } else if (baseline.amountCents !== charge.amountCents) {
      changedLines.push({ label: charge.label, expectedCents: baseline.amountCents, actualCents: charge.amountCents });
      differenceCents += Math.max(0, charge.amountCents - baseline.amountCents);
    }
  }
  const citedIds = [...new Set([...input.agreement, ...input.finalBill].map(item => item.evidenceId)
    .filter((id): id is string => Boolean(id && evidenceIds.has(id))))];
  const allDisputedCited = [...changedLines.map(item => actual.get(normalize(item.label))!), ...unverifiedFees]
    .every(item => Boolean(item.evidenceId && evidenceIds.has(item.evidenceId)));
  const comparison = BillingComparisonSchema.parse({
    purchaseId: input.purchaseId, differenceCents, evidenceIds: citedIds,
    eligibility: differenceCents === 0 ? 'INELIGIBLE' : allDisputedCited ? 'VERIFIED' : 'REVIEW_REQUIRED'
  });
  return { comparison, changedLines, unverifiedFees };
}

function indexCharges(charges: RentalCharge[]): Map<string, RentalCharge> {
  const result = new Map<string, RentalCharge>();
  for (const charge of charges) {
    if (!Number.isSafeInteger(charge.amountCents) || charge.amountCents < 0 || !charge.label.trim()) throw new Error('INVALID_RENTAL_CHARGE');
    const key = normalize(charge.label);
    if (result.has(key)) throw new Error('DUPLICATE_RENTAL_LINE');
    result.set(key, { ...charge, label: charge.label.trim() });
  }
  return result;
}
function normalize(value: string): string { return value.trim().toLowerCase().replace(/[^a-z0-9]/g, ''); }

