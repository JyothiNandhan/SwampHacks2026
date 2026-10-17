import type pg from 'pg';
import { OpportunitySchema, ProductOfferSchema, type Opportunity, type ProductOffer, type Purchase, type ReceiptItem } from '@moneyback/contracts';

export interface PriceComparison {
  exactMatch: boolean;
  reason: string;
  netOfferCents: number;
  savingsCents: number;
  fresh: boolean;
}

export function compareExactProduct(input: {
  purchase: Purchase; item: ReceiptItem; offer: ProductOffer; maximumAgeMs: number; now: string;
}): PriceComparison {
  const offer = ProductOfferSchema.parse(input.offer);
  if (!Number.isInteger(input.maximumAgeMs) || input.maximumAgeMs < 0) throw new Error('INVALID_OFFER_MAXIMUM_AGE');
  const now = Date.parse(input.now);
  const observed = Date.parse(offer.observedAt);
  if (!Number.isFinite(now) || !Number.isFinite(observed) || observed > now + 60_000) throw new Error('INVALID_OFFER_TIMESTAMP');
  const fresh = now - observed <= input.maximumAgeMs;
  const exact = exactIdentity(input.item, offer);
  const netOfferCents = offer.priceCents + (offer.shippingCents ?? 0);
  const purchasedUnitCents = input.item.unitPriceCents ?? Math.floor(input.purchase.amountCents / Math.max(1, input.item.quantity));
  return { exactMatch: exact.matched, reason: exact.reason, netOfferCents,
    savingsCents: exact.matched && fresh && offer.inStock !== false ? Math.max(0, purchasedUnitCents - netOfferCents) : 0, fresh };
}

export function buildPriceDropOpportunity(input: {
  id: string; purchase: Purchase; item: ReceiptItem; offer: ProductOffer; evidenceIds: string[];
  maximumAgeMs: number; now: string; deadlineAt?: string | null;
}): Opportunity | null {
  const result = compareExactProduct(input);
  if (!result.exactMatch || !result.fresh || result.savingsCents <= 0 || !input.evidenceIds.length) return null;
  return OpportunitySchema.parse({ id: input.id, purchaseId: input.purchase.id, type: 'PRICE_DROP',
    estimatedSavingsCents: result.savingsCents, currency: 'USD', status: 'DETECTED', eligibility: 'REVIEW_REQUIRED',
    evidenceIds: [...new Set(input.evidenceIds)], deadlineAt: input.deadlineAt ?? null, createdAt: new Date(input.now).toISOString() });
}

export interface PriceMonitorStore {
  record(userId: string, purchaseId: string, productKey: string, offer: ProductOffer, opportunity: Opportunity | null): Promise<{ insertedOffer: boolean; insertedOpportunity: boolean }>;
}

/** Persists history and deduplicates both observations and one open opportunity per purchase. */
export class TigerDataPriceMonitorStore implements PriceMonitorStore {
  constructor(private readonly pool: pg.Pool) {}
  async record(userId: string, purchaseId: string, productKey: string, offer: ProductOffer, opportunity: Opportunity | null) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const inserted = await client.query(`INSERT INTO product_offers
        (user_id,purchase_id,source,retailer_name,product_name,sku,model,gtin,condition,price_cents,shipping_cents,currency,in_stock,product_url,observed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'USD',$12,$13,$14) ON CONFLICT DO NOTHING RETURNING id`,
        [userId,purchaseId,offer.source,offer.retailerName,offer.productName,offer.sku,offer.model,offer.gtin,offer.condition,
          offer.priceCents,offer.shippingCents,offer.inStock,offer.productUrl,offer.observedAt]);
      await client.query(`INSERT INTO price_time_series(user_id,product_key,retailer_name,price_cents,currency,observed_at,source)
        VALUES ($1,$2,$3,$4,'USD',$5,$6) ON CONFLICT DO NOTHING`,
        [userId,productKey,offer.retailerName,offer.priceCents + (offer.shippingCents ?? 0),offer.observedAt,offer.source]);
      let insertedOpportunity = false;
      if (opportunity) {
        const result = await client.query(`INSERT INTO opportunities(user_id,purchase_id,type,estimated_savings_cents,currency,status,eligibility,deadline_at,created_at)
          SELECT $1,$2,'PRICE_DROP',$3,'USD','DETECTED',$4,$5,$6::timestamptz WHERE NOT EXISTS
          (SELECT 1 FROM opportunities WHERE user_id=$1 AND purchase_id=$2 AND type='PRICE_DROP' AND status IN ('DETECTED','REVIEW','APPROVED','SUBMITTED','PENDING')) RETURNING id`,
          [userId,purchaseId,opportunity.estimatedSavingsCents,opportunity.eligibility,opportunity.deadlineAt,opportunity.createdAt]);
        insertedOpportunity = (result.rowCount ?? 0) > 0;
      }
      await client.query('COMMIT');
      return { insertedOffer: (inserted.rowCount ?? 0) > 0, insertedOpportunity };
    } catch (error) { await client.query('ROLLBACK'); throw error; }
    finally { client.release(); }
  }
}

function exactIdentity(item: ReceiptItem, offer: ProductOffer): { matched: boolean; reason: string } {
  const pairs: Array<[string, string | null, string | null]> = [['SKU', item.sku, offer.sku], ['GTIN', item.gtin, offer.gtin], ['MODEL', item.model, offer.model]];
  for (const [name, left, right] of pairs) if (left && right && normalize(left) === normalize(right)) return { matched: true, reason: name };
  return { matched: false, reason: 'NO_EXACT_IDENTIFIER' };
}
function normalize(value: string): string { return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''); }
