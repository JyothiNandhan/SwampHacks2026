import type { Subscription } from '@moneyback/contracts';

export interface SubscriptionObservation { id: string; merchantName: string; planName: string | null; amountCents: number; occurredAt: string; recurring: boolean }
export interface SubscriptionChange { subscriptionId: string; previousAmountCents: number; currentAmountCents: number; increaseCents: number; supported: boolean; reason: string }

export function detectSubscriptionPriceChange(subscription: Subscription, history: SubscriptionObservation[]): SubscriptionChange | null {
  const candidates = history.filter(item => item.recurring && normalize(item.merchantName) === normalize(subscription.merchantName) &&
    normalize(item.planName ?? '') === normalize(subscription.planName ?? '')).sort((a,b) => Date.parse(a.occurredAt)-Date.parse(b.occurredAt));
  if (candidates.length < 2) return null;
  const current = candidates.at(-1)!;
  const previous = candidates.at(-2)!;
  for (const value of [current.amountCents, previous.amountCents]) if (!Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_SUBSCRIPTION_AMOUNT');
  if (current.amountCents <= previous.amountCents) return null;
  return { subscriptionId: subscription.id, previousAmountCents: previous.amountCents, currentAmountCents: current.amountCents,
    increaseCents: current.amountCents - previous.amountCents, supported: true, reason: 'CONSECUTIVE_RECURRING_CHARGES' };
}
function normalize(value: string): string { return value.trim().toLowerCase().replace(/[^a-z0-9]/g,''); }
