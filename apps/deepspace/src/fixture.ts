import type { SavingsNotification } from './schema';

export const syntheticNotification: SavingsNotification = Object.freeze({
  userId: 'synthetic-user',
  opportunityId: 'synthetic-opportunity',
  type: 'PRICE_DROP',
  title: 'Price drop ready for review',
  message: 'A fixture offer is $25.00 below the recorded purchase price. User approval is still required.',
  createdAt: '2026-10-17T16:00:00.000Z',
  readAt: '',
  synthetic: 1
});
