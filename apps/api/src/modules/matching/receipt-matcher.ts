import {
  MatchCandidateSchema,
  ReceiptGroupSchema,
  ReceiptSchema,
  TransactionSchema,
  type MatchCandidate,
  type Receipt,
  type Transaction
} from '@moneyback/contracts';

export interface ReceiptMatchOptions {
  receiptReference?: string | null;
  transactionReferences?: Readonly<Record<string, string | null | undefined>>;
  maximumDateDistanceDays?: number;
}

export interface DuplicateReceiptInput {
  receipt: Receipt;
  checksum?: string | null;
}

export interface DuplicateReceiptResult {
  groups: Array<{ receiptIds: string[]; canonicalReceiptId: string }>;
  retainedReceiptIds: string[];
  warningCodes: string[];
}

const DAY_MS = 86_400_000;

/**
 * Produces explainable candidates only. It never mutates receipt/transaction state;
 * confirmation and persistence remain explicit user-scoped service operations.
 */
export function matchReceiptToTransactions(
  receiptInput: Receipt,
  transactionInputs: Transaction[],
  options: ReceiptMatchOptions = {}
): MatchCandidate[] {
  const receipt = ReceiptSchema.parse(receiptInput);
  const transactions = transactionInputs.map(value => TransactionSchema.parse(value));
  const maximumDateDistanceDays = options.maximumDateDistanceDays ?? 7;
  if (!Number.isInteger(maximumDateDistanceDays) || maximumDateDistanceDays < 0 || maximumDateDistanceDays > 31) {
    throw new Error('INVALID_MATCH_WINDOW');
  }

  return transactions.map(transaction => {
    let score = 0;
    const matchedFields: MatchCandidate['matchedFields'] = [];
    if (receipt.totalCents !== null && receipt.totalCents === transaction.amountCents) {
      score += 45;
      matchedFields.push('AMOUNT');
    }

    const receiptMerchant = normalizeText(receipt.merchantName);
    const transactionMerchant = normalizeText(transaction.merchantName);
    if (receiptMerchant && transactionMerchant) {
      if (receiptMerchant === transactionMerchant) score += 25;
      else if (receiptMerchant.includes(transactionMerchant) || transactionMerchant.includes(receiptMerchant)) score += 15;
      if (score > (matchedFields.includes('AMOUNT') ? 45 : 0)) matchedFields.push('MERCHANT');
    }

    if (receipt.purchasedAt) {
      const distanceDays = Math.abs(Date.parse(receipt.purchasedAt) - Date.parse(transaction.occurredAt)) / DAY_MS;
      if (distanceDays <= maximumDateDistanceDays) {
        score += distanceDays < 1 ? 20 : Math.max(5, 20 - Math.floor(distanceDays) * 3);
        matchedFields.push('DATE');
      }
    }

    const receiptReference = normalizeText(options.receiptReference ?? receipt.orderNumber);
    const transactionReference = normalizeText(options.transactionReferences?.[transaction.id]);
    if (receiptReference && transactionReference && receiptReference === transactionReference) {
      score += 10;
      matchedFields.push('REFERENCE');
    }

    const boundedScore = Math.min(100, score);
    return MatchCandidateSchema.parse({
      transactionId: transaction.id,
      receiptId: receipt.id,
      score: boundedScore,
      matchedFields,
      status: boundedScore >= 80 ? 'CONFIRMED' : boundedScore >= 55 ? 'REVIEW' : 'PROPOSED'
    });
  }).sort((left, right) => right.score - left.score || left.transactionId.localeCompare(right.transactionId));
}

/** Groups likely duplicates without deleting originals. */
export function detectDuplicateReceipts(inputs: DuplicateReceiptInput[]): DuplicateReceiptResult {
  const validated = inputs.map(input => ({ receipt: ReceiptSchema.parse(input.receipt), checksum: clean(input.checksum) }));
  const parent = validated.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const join = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  for (let left = 0; left < validated.length; left += 1) {
    for (let right = left + 1; right < validated.length; right += 1) {
      if (areDuplicates(validated[left], validated[right])) join(left, right);
    }
  }

  const buckets = new Map<number, Receipt[]>();
  validated.forEach((entry, index) => {
    const root = find(index);
    buckets.set(root, [...(buckets.get(root) ?? []), entry.receipt]);
  });
  const groups = [...buckets.values()].filter(group => group.length > 1).map(group => {
    const receiptIds = group.map(receipt => receipt.id).sort();
    return ReceiptGroupSchema.parse({ receiptIds, canonicalReceiptId: receiptIds[0] });
  });

  return {
    groups,
    retainedReceiptIds: validated.map(entry => entry.receipt.id),
    warningCodes: groups.length ? ['POSSIBLE_DUPLICATE_RECEIPTS', 'KEEP_ORIGINAL_PAPER_RECEIPTS'] : []
  };
}

function areDuplicates(left: { receipt: Receipt; checksum: string | null }, right: { receipt: Receipt; checksum: string | null }): boolean {
  if (left.checksum && right.checksum && left.checksum === right.checksum) return true;
  const leftReceipt = left.receipt;
  const rightReceipt = right.receipt;
  if (!leftReceipt.orderNumber || !rightReceipt.orderNumber) return false;
  return normalizeText(leftReceipt.orderNumber) === normalizeText(rightReceipt.orderNumber) &&
    normalizeText(leftReceipt.merchantName) === normalizeText(rightReceipt.merchantName) &&
    leftReceipt.totalCents !== null && leftReceipt.totalCents === rightReceipt.totalCents &&
    sameCalendarDay(leftReceipt.purchasedAt, rightReceipt.purchasedAt);
}

function normalizeText(value: string | null | undefined): string {
  return value?.trim().toLocaleLowerCase().replace(/[^a-z0-9]/g, '') ?? '';
}

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function sameCalendarDay(left: string | null, right: string | null): boolean {
  return Boolean(left && right && left.slice(0, 10) === right.slice(0, 10));
}
