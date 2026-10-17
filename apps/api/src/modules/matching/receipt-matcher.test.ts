import { describe, expect, test } from 'vitest';
import type { Receipt, Transaction } from '@moneyback/contracts';
import { detectDuplicateReceipts, matchReceiptToTransactions } from './receipt-matcher.js';

const receipt: Receipt = {
  id: 'receipt-1', source: 'PHOTO', merchantName: 'Best Buy', orderNumber: 'BB-123',
  purchasedAt: '2026-10-15T14:00:00.000Z', totalCents: 12000, currency: 'USD',
  originalFileId: 'file-1', extractionStatus: 'EXTRACTED'
};
const transaction = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: 'transaction-1', nessiePurchaseId: 'purchase-1', accountId: 'account-1', merchantId: 'merchant-1',
  merchantName: 'Best Buy', amountCents: 12000, currency: 'USD', occurredAt: '2026-10-15T16:00:00.000Z',
  receiptStatus: 'UNMATCHED', ...overrides
});

describe('receipt matching', () => {
  test('scores amount, merchant, date and reference and returns a confirmed candidate', () => {
    expect(matchReceiptToTransactions(receipt, [transaction()], {
      transactionReferences: { 'transaction-1': 'bb123' }
    })).toEqual([{
      transactionId: 'transaction-1', receiptId: 'receipt-1', score: 100,
      matchedFields: ['AMOUNT', 'MERCHANT', 'DATE', 'REFERENCE'], status: 'CONFIRMED'
    }]);
  });

  test('sorts candidates and leaves weak matches proposed for review by downstream code', () => {
    const candidates = matchReceiptToTransactions(receipt, [
      transaction({ id: 'weak', amountCents: 9000, merchantName: 'Other', occurredAt: '2026-08-01T00:00:00.000Z' }),
      transaction({ id: 'strong' })
    ]);
    expect(candidates.map(candidate => [candidate.transactionId, candidate.status])).toEqual([
      ['strong', 'CONFIRMED'], ['weak', 'PROPOSED']
    ]);
  });
});

describe('duplicate receipt detection', () => {
  test('groups checksum and business-key duplicates while retaining every original', () => {
    const result = detectDuplicateReceipts([
      { receipt, checksum: 'same-checksum' },
      { receipt: { ...receipt, id: 'receipt-2', source: 'EMAIL', originalFileId: 'file-2' }, checksum: 'same-checksum' },
      { receipt: { ...receipt, id: 'receipt-3', orderNumber: 'OTHER', originalFileId: 'file-3' } }
    ]);
    expect(result.groups).toEqual([{ receiptIds: ['receipt-1', 'receipt-2'], canonicalReceiptId: 'receipt-1' }]);
    expect(result.retainedReceiptIds).toEqual(['receipt-1', 'receipt-2', 'receipt-3']);
    expect(result.warningCodes).toContain('KEEP_ORIGINAL_PAPER_RECEIPTS');
  });

  test('does not group receipts that lack both checksum equality and a complete business key', () => {
    expect(detectDuplicateReceipts([{ receipt: { ...receipt, orderNumber: null } }, {
      receipt: { ...receipt, id: 'receipt-2', orderNumber: null, originalFileId: 'file-2' }
    }]).groups).toEqual([]);
  });
});
