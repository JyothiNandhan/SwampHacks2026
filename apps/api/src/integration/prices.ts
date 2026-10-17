import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { PurchaseSchema, ReceiptItemSchema, ProductOfferSchema, type ProductOffer, type Purchase } from '@moneyback/contracts';
import { buildPriceDropOpportunity } from '../modules/retail/price-monitor.js';
import { BestBuyAdapter } from '../modules/retail/best-buy-adapter.js';
import { BrightDataAdapter } from '../modules/retail/bright-data-adapter.js';
import { transaction, owned } from './database.js';
import { ApiError } from './security.js';
import type { IntegrationConfig } from './config.js';

export async function loadPurchase(pool: Pick<pg.Pool, 'query'>, userId: string, id: string): Promise<Purchase> {
  const row = await owned(pool, 'purchases', userId, id);
  const items = (await pool.query(`SELECT name,brand,model,sku,gtin,quantity,unit_price_cents AS "unitPriceCents" FROM purchase_items WHERE user_id=$1 AND purchase_id=$2 ORDER BY id`, [userId,id])).rows;
  const receipts = (await pool.query('SELECT receipt_id FROM purchase_receipts WHERE user_id=$1 AND purchase_id=$2', [userId,id])).rows;
  return PurchaseSchema.parse({ id:row.id,transactionId:row.transaction_id,receiptIds:receipts.map(r => r.receipt_id),merchantName:row.merchant_name,
    orderNumber:row.order_number,purchasedAt:new Date(String(row.purchased_at)).toISOString(),amountCents:row.amount_cents,currency:row.currency,matchStatus:row.match_status,items:items.map(item => ReceiptItemSchema.parse(item)) });
}
export type OfferProvider = (purchase: Purchase) => Promise<ProductOffer[]>;
export function createOfferProvider(config: IntegrationConfig, pool: pg.Pool, fetchImpl?: typeof fetch): OfferProvider {
  const bestBuy = config.BESTBUY_API_KEY ? new BestBuyAdapter({ apiKey:config.BESTBUY_API_KEY,fetchImpl }) : null;
  const bright = config.BRIGHTDATA_API_KEY ? new BrightDataAdapter({ apiKey:config.BRIGHTDATA_API_KEY,
    datasetIds:{ amazon:config.BRIGHTDATA_AMAZON_DATASET_ID,walmart:config.BRIGHTDATA_WALMART_DATASET_ID },fetchImpl, maxPollAttempts:5,pollIntervalMs:1000,timeoutMs:5000 }) : null;
  return async purchase => {
    if (config.PRICE_MONITOR_MODE === 'REPLAY') throw new ApiError('REPLAY_REQUIRES_EXPLICIT_PROVIDER', 503);
    if (!bestBuy && !bright) throw new ApiError('RETAIL_NOT_CONFIGURED', 503);
    const offers: ProductOffer[] = [];
    if (bestBuy) for (const item of purchase.items) {
      const query = [item.brand,item.model].filter(Boolean).join(' ');
      if (query) offers.push(...await bestBuy.searchOffers(query, 5));
    }
    if (bright) {
      const rows = (await pool.query("SELECT DISTINCT product_url FROM product_offers WHERE user_id=(SELECT user_id FROM purchases WHERE id=$1) AND purchase_id=$1 AND source='BRIGHT_DATA' LIMIT 10", [purchase.id])).rows;
      for (const retailer of ['amazon', 'walmart'] as const) {
        const urls = rows.map(row => String(row.product_url)).filter(value => {
          const host = new URL(value).hostname; return host === `www.${retailer}.com` || host === `${retailer}.com`;
        });
        if (urls.length) offers.push(...await bright.collectOffers(retailer,urls));
      }
    }
    return offers;
  };
}

export function createPriceExecutor(pool: pg.Pool, config: IntegrationConfig, provider: OfferProvider = createOfferProvider(config,pool)) {
  return async (userId: string, purchaseIds: string[]) => {
    if (!purchaseIds.length || purchaseIds.length > 100) throw new ApiError('INVALID_PURCHASE_IDS', 400);
    const purchases: Purchase[] = [];
    // Authorize the complete batch before any provider calls.
    for (const id of [...new Set(purchaseIds)]) purchases.push(await loadPurchase(pool,userId,id));
    let observations = 0; let opportunities = 0;
    for (const purchase of purchases) {
      const offers = await provider(purchase);
      if (config.PRICE_MONITOR_MODE === 'LIVE' && offers.some(o => o.source === 'FIXTURE')) throw new ApiError('REPLAY_IN_LIVE_MODE', 409);
      const now = new Date();
      for (const rawOffer of offers) {
        const offer = ProductOfferSchema.parse(rawOffer);
        await transaction(pool, async client => {
          await owned(client,'purchases',userId,purchase.id,true);
          const saved = await client.query(`INSERT INTO product_offers(user_id,purchase_id,source,retailer_name,product_name,sku,model,gtin,condition,price_cents,shipping_cents,currency,in_stock,product_url,observed_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'USD',$12,$13,$14) ON CONFLICT DO NOTHING RETURNING id`,
            [userId,purchase.id,offer.source,offer.retailerName,offer.productName,offer.sku,offer.model,offer.gtin,offer.condition,offer.priceCents,offer.shippingCents,offer.inStock,offer.productUrl,offer.observedAt]);
          if (!saved.rows.length) return;
          observations++;
          const productKey = offer.gtin ? `gtin:${offer.gtin}` : `model:${offer.model ?? offer.sku}`;
          await client.query(`INSERT INTO price_time_series(user_id,product_key,retailer_name,price_cents,observed_at,source) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [userId,productKey,offer.retailerName,offer.priceCents+(offer.shippingCents??0),offer.observedAt,offer.source]);
          const evidence = (await client.query(`INSERT INTO evidence(user_id,source_type,source_id,category,acquisition_method,raw_url) VALUES($1,'OFFER',$2,$3,$4,$5) RETURNING id`, [userId,saved.rows[0].id,'PRICE_OBSERVATION',offer.source === 'FIXTURE' ? 'LABELED_REPLAY' : 'PROVIDER_API',offer.productUrl])).rows[0].id;
          const policy = (await client.query(`SELECT id,parsed_end_at FROM policies WHERE user_id=$1 AND purchase_id=$2 AND policy_type='RETURN' AND parsed_end_at>$3 ORDER BY parsed_end_at LIMIT 1`, [userId,purchase.id,now])).rows[0];
          if (offer.condition !== 'NEW' || offer.shippingCents === null || offer.inStock !== true) return;
          const item = purchase.items.find(item => item.quantity === 1 && item.unitPriceCents !== null && item.model && offer.model && item.model.trim().toLowerCase() === offer.model.trim().toLowerCase());
          if (!item) return; // Cross-retailer SKUs alone are not product identity.
          const candidate = buildPriceDropOpportunity({ id:randomUUID(),purchase,item,offer,evidenceIds:[evidence],maximumAgeMs:3_600_000,now:now.toISOString(),deadlineAt:policy ? new Date(policy.parsed_end_at).toISOString() : null });
          if (!candidate) return;
          const existing = await client.query(`SELECT id FROM opportunities WHERE user_id=$1 AND purchase_id=$2 AND type='PRICE_DROP' AND status IN ('DETECTED','REVIEW','APPROVED','SUBMITTED','PENDING')`, [userId,purchase.id]);
          if (existing.rows.length) return;
          await client.query(`INSERT INTO opportunities(id,user_id,purchase_id,type,estimated_savings_cents,status,eligibility,deadline_at) VALUES($1,$2,$3,'PRICE_DROP',$4,'DETECTED','REVIEW_REQUIRED',$5)`, [candidate.id,userId,purchase.id,candidate.estimatedSavingsCents,candidate.deadlineAt]);
          await client.query('INSERT INTO opportunity_evidence(user_id,opportunity_id,evidence_id) VALUES($1,$2,$3)', [userId,candidate.id,evidence]);
          if (policy) await client.query(`INSERT INTO opportunity_evidence(user_id,opportunity_id,evidence_id) SELECT user_id,$2,evidence_id FROM policy_evidence WHERE user_id=$1 AND policy_id=$3 ON CONFLICT DO NOTHING`, [userId,candidate.id,policy.id]);
          await client.query(`INSERT INTO events(user_id,idempotency_key,entity_type,entity_id,event_type,event_payload) VALUES($1,$2,'PURCHASE',$3,'PRICE_DROP_DETECTED',$4)`, [userId,`price:${candidate.id}`,purchase.id,JSON.stringify({ opportunityId:candidate.id,replay:offer.source==='FIXTURE' })]);
          opportunities++;
        });
      }
    }
    return { observations, opportunities, replay:config.PRICE_MONITOR_MODE === 'REPLAY' };
  };
}
