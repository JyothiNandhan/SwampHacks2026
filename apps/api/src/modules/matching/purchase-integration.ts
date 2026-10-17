import type pg from 'pg';
import { EvidenceSchema, PurchaseSchema, ReceiptSchema, TransactionSchema,
  type Evidence, type Purchase, type Receipt, type ReceiptItem, type Transaction } from '@moneyback/contracts';
import { matchReceiptToTransactions } from './receipt-matcher.js';

export interface PurchaseIntegrationStore {
  save(input: { userId: string; receipt: Receipt; transaction: Transaction; items: ReceiptItem[];
    evidence: Evidence[]; matchStatus: Purchase['matchStatus'] }): Promise<Purchase>;
}

/** Wires the matcher to persistence. Low-confidence candidates remain REVIEW and are never silently confirmed. */
export function createPurchaseIntegrator(store: PurchaseIntegrationStore) {
  return async (input: { userId: string; receipt: Receipt; transactions: Transaction[]; items: ReceiptItem[];
    evidence: Evidence[]; transactionReferences?: Record<string,string|null> }): Promise<Purchase | null> => {
    const receipt = ReceiptSchema.parse(input.receipt);
    const transactions = input.transactions.map(value => TransactionSchema.parse(value));
    const evidence = input.evidence.map(value => EvidenceSchema.parse(value));
    const candidate = matchReceiptToTransactions(receipt,transactions,{transactionReferences:input.transactionReferences})[0];
    if (!candidate || candidate.score < 55) return null;
    const transaction = transactions.find(value => value.id === candidate.transactionId)!;
    return store.save({userId:input.userId,receipt,transaction,items:input.items,evidence,
      matchStatus:candidate.status === 'CONFIRMED' ? 'MATCHED' : 'REVIEW'});
  };
}

export class TigerDataPurchaseIntegrationStore implements PurchaseIntegrationStore {
  constructor(private readonly pool: pg.Pool) {}
  async save(input: {userId:string;receipt:Receipt;transaction:Transaction;items:ReceiptItem[];evidence:Evidence[];matchStatus:Purchase['matchStatus']}): Promise<Purchase> {
    const client=await this.pool.connect();
    try {
      await client.query('BEGIN');
      for(const item of input.evidence) await client.query(`INSERT INTO evidence(user_id,source_type,source_id,category,acquisition_method,raw_url,checksum,created_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(user_id,source_type,source_id) DO UPDATE SET category=EXCLUDED.category`,
        [input.userId,item.sourceType,item.sourceId,item.category,item.acquisitionMethod,item.rawUrl,item.checksum,item.createdAt]);
      const purchaseResult=await client.query<{id:string}>(`INSERT INTO purchases(user_id,transaction_id,merchant_name,order_number,purchased_at,amount_cents,currency,match_status)
        VALUES($1,$2,$3,$4,$5,$6,'USD',$7) ON CONFLICT(user_id,transaction_id) DO UPDATE SET match_status=EXCLUDED.match_status,updated_at=NOW() RETURNING id`,
        [input.userId,input.transaction.id,input.receipt.merchantName ?? input.transaction.merchantName ?? 'Unknown merchant',input.receipt.orderNumber,
          input.receipt.purchasedAt ?? input.transaction.occurredAt,input.receipt.totalCents ?? input.transaction.amountCents,input.matchStatus]);
      const purchaseId=purchaseResult.rows[0].id;
      await client.query(`INSERT INTO purchase_receipts(user_id,purchase_id,receipt_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,[input.userId,purchaseId,input.receipt.id]);
      await client.query('DELETE FROM purchase_items WHERE user_id=$1 AND purchase_id=$2',[input.userId,purchaseId]);
      for(const item of input.items) await client.query(`INSERT INTO purchase_items(user_id,purchase_id,name,brand,model,sku,gtin,quantity,unit_price_cents)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[input.userId,purchaseId,item.name,item.brand,item.model,item.sku,item.gtin,item.quantity,item.unitPriceCents]);
      await client.query('UPDATE transactions SET receipt_status=$3,updated_at=NOW() WHERE user_id=$1 AND id=$2',[input.userId,input.transaction.id,input.matchStatus]);
      await client.query('COMMIT');
      return PurchaseSchema.parse({id:purchaseId,transactionId:input.transaction.id,receiptIds:[input.receipt.id],
        merchantName:input.receipt.merchantName ?? input.transaction.merchantName ?? 'Unknown merchant',orderNumber:input.receipt.orderNumber,
        purchasedAt:input.receipt.purchasedAt ?? input.transaction.occurredAt,amountCents:input.receipt.totalCents ?? input.transaction.amountCents,
        currency:'USD',matchStatus:input.matchStatus,items:input.items});
    } catch(error){await client.query('ROLLBACK');throw error;} finally{client.release();}
  }
}
