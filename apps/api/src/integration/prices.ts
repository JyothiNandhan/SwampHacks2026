import { createHash, randomUUID } from 'node:crypto';
import type pg from 'pg';
import { PurchaseSchema, ReceiptItemSchema, ProductOfferSchema, type ProductOffer, type Purchase } from '@moneyback/contracts';
import { buildPriceDropOpportunity } from '../modules/retail/price-monitor.js';
import { SerpApiAdapter, type StoreQuote } from '../modules/retail/serp-api-adapter.js';
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
export type ProviderOffer = ProductOffer & {shippingEvidence?: StoreQuote};
export type OfferProvider = (purchase: Purchase) => Promise<ProviderOffer[]>;
export function createOfferProvider(config: IntegrationConfig, pool: pg.Pool, fetchImpl?: typeof fetch): OfferProvider {
  const serp = config.SERPAPI_API_KEY ? new SerpApiAdapter({ apiKey:config.SERPAPI_API_KEY,fetchImpl }) : null;
  const bright = config.BRIGHTDATA_API_KEY ? new BrightDataAdapter({ apiKey:config.BRIGHTDATA_API_KEY,
    datasetIds:{ amazon:config.BRIGHTDATA_AMAZON_DATASET_ID,walmart:config.BRIGHTDATA_WALMART_DATASET_ID },fetchImpl, maxPollAttempts:30,pollIntervalMs:2000,timeoutMs:10000 }) : null;
  return async purchase => {
    if (config.PRICE_MONITOR_MODE === 'REPLAY') throw new ApiError('REPLAY_REQUIRES_EXPLICIT_PROVIDER', 503);
    if (!serp && !bright) throw new ApiError('RETAIL_NOT_CONFIGURED', 503);
    const offers: ProviderOffer[] = [];
    const quotes: StoreQuote[] = [];
    if (serp) for (const item of purchase.items) {
      const query = [item.brand,item.model].filter(Boolean).join(' ');
      if (query) {offers.push(...await serp.searchOffers(query, 5));if(bright&&item.model)quotes.push(...await serp.getStoreQuotes(`${query} ${item.name} new`.slice(0,300),item.model));}
    }
    if (bright) {
      const rows = (await pool.query("SELECT DISTINCT product_url FROM product_offers WHERE user_id=(SELECT user_id FROM purchases WHERE id=$1) AND purchase_id=$1 AND source='BRIGHT_DATA' LIMIT 10", [purchase.id])).rows;
      for (const retailer of ['amazon', 'walmart'] as const) {
        if(!config[retailer==='amazon'?'BRIGHTDATA_AMAZON_DATASET_ID':'BRIGHTDATA_WALMART_DATASET_ID'])continue;
        const urls = [...new Set([...rows.map(row => String(row.product_url)),...quotes.map(q=>q.productUrl)].filter(value => {
          try{const host = new URL(value).hostname; return host === `www.${retailer}.com` || host === `${retailer}.com`;}catch{return false;}
        }))].slice(0,3);
        if (!urls.length)continue;
        for(const offer of await bright.collectOffers(retailer,urls)){
          const quote=quotes.find(q=>productIdentity(q.productUrl)===productIdentity(offer.productUrl)&&q.priceCents===offer.priceCents);
          // Only exact URL + identical USD price joins facts from these two providers.
          // Model, condition and availability still come from the product-level snapshot.
          if(quote&&offer.shippingCents===null&&offer.model&&offer.condition==='NEW'&&offer.inStock===true){
            offers.push({...offer,shippingCents:quote.shippingCents,shippingEvidence:quote});
          }else offers.push(offer);
        }
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
    let observations = 0; let opportunities = 0; let skippedPurchases = 0;
    for (const purchase of purchases) {
      if (!purchase.items.length) { skippedPurchases++; continue; }
      const offers = await provider(purchase);
      if (config.PRICE_MONITOR_MODE === 'LIVE' && offers.some(o => o.source === 'FIXTURE')) throw new ApiError('REPLAY_IN_LIVE_MODE', 409);
      const now = new Date();
      for (const rawOffer of offers) {
        const {shippingEvidence,...offerFields}=rawOffer;
        const offer = ProductOfferSchema.parse(offerFields);
        await transaction(pool, async client => {
          await owned(client,'purchases',userId,purchase.id,true);
          const saved = await client.query(`INSERT INTO product_offers(user_id,purchase_id,source,retailer_name,product_name,sku,model,gtin,condition,price_cents,shipping_cents,currency,in_stock,product_url,observed_at)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'USD',$12,$13,$14) ON CONFLICT DO NOTHING RETURNING id`,
            [userId,purchase.id,offer.source,offer.retailerName,offer.productName,offer.sku,offer.model,offer.gtin,offer.condition,offer.priceCents,offer.shippingCents,offer.inStock,offer.productUrl,offer.observedAt]);
          if (!saved.rows.length) return;
          observations++;
          const productKey = offer.gtin ? `gtin:${offer.gtin}` : offer.model ? `model:${offer.model}` :
            offer.sku ? `${offer.source}:${offer.retailerName}:sku:${offer.sku}` :
              `${offer.source}:url:${createHash('sha256').update(offer.productUrl).digest('hex')}`;
          await client.query(`INSERT INTO price_time_series(user_id,product_key,retailer_name,price_cents,observed_at,source) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`, [userId,productKey,offer.retailerName,offer.priceCents+(offer.shippingCents??0),offer.observedAt,offer.source]);
          const evidence = (await client.query(`INSERT INTO evidence(user_id,source_type,source_id,category,acquisition_method,raw_url) VALUES($1,'OFFER',$2,$3,$4,$5) RETURNING id`, [userId,saved.rows[0].id,'PRICE_OBSERVATION',offer.source === 'FIXTURE' ? 'LABELED_REPLAY' : 'PROVIDER_API',offer.productUrl])).rows[0].id;
          const evidenceIds=[evidence];
          if(shippingEvidence){
            if(productIdentity(shippingEvidence.productUrl)!==productIdentity(offer.productUrl)||shippingEvidence.priceCents!==offer.priceCents||shippingEvidence.shippingCents!==offer.shippingCents)throw new ApiError('RETAIL_EVIDENCE_MISMATCH',409);
            const shippingId=(await client.query(`INSERT INTO evidence(user_id,source_type,source_id,category,acquisition_method,raw_url,checksum) VALUES($1,'OFFER',$2,'SHIPPING_QUOTE','SERPAPI_GOOGLE_PRODUCT',$3,$4) RETURNING id`,[userId,`${saved.rows[0].id}:shipping`,shippingEvidence.productUrl,createHash('sha256').update(JSON.stringify(shippingEvidence)).digest('hex')])).rows[0].id;
            evidenceIds.push(shippingId);
            await client.query(`INSERT INTO events(user_id,idempotency_key,entity_type,entity_id,event_type,event_payload) VALUES($1,$2,'PURCHASE',$3,'RETAIL_OFFER_VERIFIED',$4)`,[userId,`retail-verification:${saved.rows[0].id}`,purchase.id,JSON.stringify({offerId:saved.rows[0].id,productSource:offer.source,shippingEvidenceId:shippingId,shippingQuote:shippingEvidence})]);
          }
          const policy = (await client.query(`SELECT id,parsed_end_at FROM policies WHERE user_id=$1 AND purchase_id=$2 AND policy_type='RETURN' AND parsed_end_at>$3 ORDER BY parsed_end_at LIMIT 1`, [userId,purchase.id,now])).rows[0];
          if (offer.condition !== 'NEW' || offer.shippingCents === null || offer.inStock !== true) return;
          const item = purchase.items.find(item => item.quantity === 1 && item.unitPriceCents !== null && item.model && offer.model && item.model.trim().toLowerCase() === offer.model.trim().toLowerCase());
          if (!item) return; // Cross-retailer SKUs alone are not product identity.
          const candidate = buildPriceDropOpportunity({ id:randomUUID(),purchase,item,offer,evidenceIds,maximumAgeMs:3_600_000,now:now.toISOString(),deadlineAt:policy ? new Date(policy.parsed_end_at).toISOString() : null });
          if (!candidate) return;
          const existing = await client.query(`SELECT id FROM opportunities WHERE user_id=$1 AND purchase_id=$2 AND type='PRICE_DROP' AND status IN ('DETECTED','REVIEW','APPROVED','SUBMITTED','PENDING')`, [userId,purchase.id]);
          if (existing.rows.length) return;
          await client.query(`INSERT INTO opportunities(id,user_id,purchase_id,type,estimated_savings_cents,status,eligibility,deadline_at) VALUES($1,$2,$3,'PRICE_DROP',$4,'DETECTED','REVIEW_REQUIRED',$5)`, [candidate.id,userId,purchase.id,candidate.estimatedSavingsCents,candidate.deadlineAt]);
          for(const evidenceId of evidenceIds)await client.query('INSERT INTO opportunity_evidence(user_id,opportunity_id,evidence_id) VALUES($1,$2,$3)', [userId,candidate.id,evidenceId]);
          if (policy) await client.query(`INSERT INTO opportunity_evidence(user_id,opportunity_id,evidence_id) SELECT user_id,$2,evidence_id FROM policy_evidence WHERE user_id=$1 AND policy_id=$3 ON CONFLICT DO NOTHING`, [userId,candidate.id,policy.id]);
          await client.query(`INSERT INTO events(user_id,idempotency_key,entity_type,entity_id,event_type,event_payload) VALUES($1,$2,'PURCHASE',$3,'PRICE_DROP_DETECTED',$4)`, [userId,`price:${candidate.id}`,purchase.id,JSON.stringify({ opportunityId:candidate.id,replay:offer.source==='FIXTURE' })]);
          opportunities++;
        });
      }
    }
    return { observations, opportunities, skippedPurchases, replay:config.PRICE_MONITOR_MODE === 'REPLAY' };
  };
}

function productIdentity(value:string):string {
 const url=new URL(value);const host=url.hostname.replace(/^www\./,'');
 if(host==='walmart.com'){const id=/\/(\d+)\/?$/.exec(url.pathname)?.[1];if(id)return `walmart:${id}`;}
 if(host==='amazon.com'){const asin=/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:\/|$)/i.exec(url.pathname)?.[1];if(asin)return `amazon:${asin.toUpperCase()}`;}
 return host+url.pathname.replace(/\/$/,'');
}
