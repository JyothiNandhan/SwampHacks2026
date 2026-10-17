import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type pg from 'pg';
import { describe,expect,test } from 'vitest';
import { TigerDataPurchaseIntegrationStore } from './matching/purchase-integration.js';
import { TigerDataPriceMonitorStore } from './retail/price-monitor.js';

async function databaseFixture(){
  const db=new PGlite();
  await db.exec(readFileSync(new URL('../../../../packages/db/src/migrations/001_init_tiger_data.sql',import.meta.url),'utf8'));
  const client={async query<Row extends pg.QueryResultRow=pg.QueryResultRow>(sql:string,values?:unknown[]){
    if(values){const result=await db.query<Row>(sql,values);return{...result,rowCount:result.affectedRows??result.rows.length};}
    const result=await db.exec(sql);const last=result.at(-1);return{rows:(last?.rows??[]) as Row[],rowCount:last?.affectedRows??0,command:'',oid:0,fields:[]};},release(){}};
  return {db,pool:{async connect(){return client;}} as unknown as pg.Pool};
}

describe('Gate 2 Tiger Data persistence',()=>{
  test('T12 atomically persists and idempotently updates a matched purchase with items/evidence',async()=>{
    const {db,pool}=await databaseFixture();
    try{
      const userId=(await db.query<{id:string}>("INSERT INTO users(email) VALUES('gate2@example.com') RETURNING id")).rows[0].id;
      const accountId=(await db.query<{id:string}>("INSERT INTO accounts(user_id,external_account_id,institution_name,account_type) VALUES($1,'a','Nessie','CHECKING') RETURNING id",[userId])).rows[0].id;
      const transactionId=(await db.query<{id:string}>("INSERT INTO transactions(user_id,account_id,nessie_purchase_id,merchant_name,amount_cents,occurred_at) VALUES($1,$2,'n','Best Buy',10000,'2026-10-17T12:00:00Z') RETURNING id",[userId,accountId])).rows[0].id;
      const receiptId=(await db.query<{id:string}>("INSERT INTO receipts(user_id,source,merchant_name,purchased_at,total_cents,original_file_id,extraction_status) VALUES($1,'PHOTO','Best Buy','2026-10-17T12:00:00Z',10000,'file','EXTRACTED') RETURNING id",[userId])).rows[0].id;
      const store=new TigerDataPurchaseIntegrationStore(pool);
      const input={userId,receipt:{id:receiptId,source:'PHOTO' as const,merchantName:'Best Buy',orderNumber:null,purchasedAt:'2026-10-17T12:00:00Z',totalCents:10000,currency:'USD' as const,originalFileId:'file',extractionStatus:'EXTRACTED' as const},
        transaction:{id:transactionId,nessiePurchaseId:'n',accountId,merchantId:null,merchantName:'Best Buy',amountCents:10000,currency:'USD' as const,occurredAt:'2026-10-17T12:00:00Z',receiptStatus:'UNMATCHED' as const},
        items:[{name:'Laptop',brand:null,model:'A1',sku:'123',gtin:null,quantity:1,unitPriceCents:10000}],
        evidence:[{id:'external-e',sourceType:'RECEIPT' as const,sourceId:receiptId,category:'PURCHASE_PROOF',acquisitionMethod:'PHOTO',rawUrl:null,checksum:'sum',createdAt:'2026-10-17T12:00:00Z'}],matchStatus:'MATCHED' as const};
      await store.save(input);await store.save(input);
      expect((await db.query<{count:number}>('SELECT COUNT(*)::int count FROM purchases')).rows[0].count).toBe(1);
      expect((await db.query<{count:number}>('SELECT COUNT(*)::int count FROM purchase_items')).rows[0].count).toBe(1);
      expect((await db.query<{receipt_status:string}>('SELECT receipt_status FROM transactions')).rows[0].receipt_status).toBe('MATCHED');
    }finally{await db.close();}
  },30000);

  test('T14 deduplicates offer observations and open price-drop opportunities',async()=>{
    const {db,pool}=await databaseFixture();
    try{
      const userId=(await db.query<{id:string}>("INSERT INTO users(email) VALUES('price@example.com') RETURNING id")).rows[0].id;
      const purchaseId=(await db.query<{id:string}>("INSERT INTO purchases(user_id,merchant_name,purchased_at,amount_cents) VALUES($1,'Shop','2026-10-01T00:00:00Z',10000) RETURNING id",[userId])).rows[0].id;
      const offer={id:'o',source:'FIXTURE' as const,retailerName:'Shop',productName:'Item',sku:'1',model:null,gtin:null,condition:'NEW' as const,priceCents:8000,shippingCents:500,currency:'USD' as const,inStock:true,productUrl:'https://example.com/item',observedAt:'2026-10-17T12:00:00Z'};
      const opportunity={id:'op',purchaseId,type:'PRICE_DROP' as const,estimatedSavingsCents:1500,currency:'USD' as const,status:'DETECTED' as const,eligibility:'REVIEW_REQUIRED' as const,evidenceIds:['e'],deadlineAt:null,createdAt:'2026-10-17T12:00:00Z'};
      const store=new TigerDataPriceMonitorStore(pool);await store.record(userId,purchaseId,'sku:1',offer,opportunity);await store.record(userId,purchaseId,'sku:1',offer,opportunity);
      expect((await db.query<{count:number}>('SELECT COUNT(*)::int count FROM product_offers')).rows[0].count).toBe(1);
      expect((await db.query<{count:number}>('SELECT COUNT(*)::int count FROM price_time_series')).rows[0].count).toBe(1);
      expect((await db.query<{count:number}>('SELECT COUNT(*)::int count FROM opportunities')).rows[0].count).toBe(1);
    }finally{await db.close();}
  },30000);
});
