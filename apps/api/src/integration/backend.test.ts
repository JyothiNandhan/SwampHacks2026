import { JobRunner } from '../../../worker/src/job-runner.js';
import { PostgresJobRepository } from '../../../worker/src/postgres-job-repository.js';
import { createInternalPriceHandler } from '../../../worker/src/service.js';
import { enqueueScheduledPrices } from '../../../worker/src/scheduler.js';
import { operate } from './operator.js';
import { readFileSync } from 'node:fs';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';
import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { BackendService } from './service.js';
import { tokenHash } from './security.js';
import { createOfferProvider } from './prices.js';
import { loadIntegrationConfig } from './config.js';
import type { NessieReader } from '../modules/banking/nessie-import.js';

const userId='11111111-1111-4111-8111-111111111111';
const otherId='22222222-2222-4222-8222-222222222222';
const userToken='test-user-token-'.padEnd(48,'u'); const otherToken='test-other-token-'.padEnd(48,'o'); const workerToken='test-worker-token-'.padEnd(48,'w');
async function fixture(){
  const sql=readFileSync(new URL('../../../../packages/db/src/migrations/001_init_tiger_data.sql',import.meta.url),'utf8');
  let pool:pg.Pool; let cleanup:()=>Promise<void>;
  if(process.env.TEST_DATABASE_URL){
    const schema=`release_test_${randomUUID().replaceAll('-','')}`;
    const admin=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL});await admin.query(`CREATE SCHEMA ${schema}`);
    pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${schema},public`});await pool.query(sql);
    cleanup=async()=>{await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.end();};
  }else{
    const db=new PGlite();await db.exec(sql);
    const query=async(sql:string,values?:unknown[])=>{
      if(values){const result=await db.query(sql,values);return {...result,rowCount:result.affectedRows??result.rows.length};}
      const result=(await db.exec(sql)).at(-1);return {rows:result?.rows??[],rowCount:result?.affectedRows??0};
    };
    const client={query,release(){}};
    pool={query,async connect(){return client;},on(){},async end(){}} as unknown as pg.Pool;
    cleanup=()=>db.close();
  }
  await pool.query('INSERT INTO users(id,email) VALUES($1,$2),($3,$4)',[userId,'release@example.com',otherId,'other@example.com']);
  const directory=await mkdtemp(join(tmpdir(),'moneyback-release-'));await mkdir(join(directory,userId));
  const env={NODE_ENV:'test',EVIDENCE_DIRECTORY:directory,GEMINI_MODEL:'fixture-model',PRICE_MONITOR_MODE:'REPLAY',INTERNAL_WORKER_TOKEN:workerToken,
    API_TOKENS_JSON:JSON.stringify([{tokenHash:tokenHash(userToken),userId,roles:['user','demo']},{tokenHash:tokenHash(otherToken),userId:otherId,roles:['user']}])};
  const config=loadConfig(env); const integration=config.integration!;
  const purchasedAt=new Date(Date.now()-86400000).toISOString();
  let deposits:unknown[]=[];
  const payloads:Record<string,unknown>={
    '/customers/customer1':{_id:'customer1',first_name:'Synthetic',last_name:'User'},
    '/customers/customer1/accounts':[{_id:'account1',type:'Checking'}],
    '/accounts/account1/purchases':[{_id:'purchase1',amount:300,purchase_date:purchasedAt,description:'Demo Retailer',status:'completed'}],
    '/accounts/account1/bills':[]
  };
  const nessie:NessieReader={async get<T extends z.ZodType>(path:string,schema:T):Promise<z.output<T>>{return schema.parse(path==='/accounts/account1/deposits'?deposits:payloads[path]);}};
  const extraction={receipt:{source:'PHOTO',merchantName:'Demo Retailer',orderNumber:'order1',purchasedAt,totalCents:30000,currency:'USD'},items:[{name:'Demo Watch',brand:'Demo',model:'DW-1',sku:'123',gtin:null,quantity:1,unitPriceCents:30000}],warningCodes:[]};
  const generate=vi.fn().mockResolvedValue({text:JSON.stringify(extraction),candidates:[{finishReason:'STOP'}]});
  const offers=vi.fn().mockResolvedValue([{id:'replay',source:'FIXTURE',retailerName:'Demo Retailer',productName:'Demo Watch',sku:'123',model:'DW-1',gtin:null,condition:'NEW',priceCents:25000,shippingCents:0,currency:'USD',inStock:true,productUrl:'https://example.com/replay',observedAt:new Date().toISOString()}]);
  const service=new BackendService(pool,integration,nessie,{generate,offers});
  const app=buildApp({config,logger:false,database:pool,service});
  const call=async(method:'GET'|'POST',url:string,payload?:unknown,token=userToken,extra:Record<string,string>={})=>{
    return app.inject({method,url,headers:{authorization:`Bearer ${token}`,...extra},...(payload===undefined?{}:{payload})});
  };
  return {pool,app,call,config,service,directory,generate,offers,purchasedAt,setDeposits:(value:unknown[])=>{deposits=value;},
    async close(){await app.close();await cleanup();await rm(directory,{recursive:true,force:true});}};
}

test('T24 API smoke: Nessie import → receipt → matching → priced opportunity → explicit approval → correlated simulated deposits',async()=>{
  const s=await fixture();
  try{
    expect((await s.app.inject('/health')).statusCode).toBe(200);
    expect((await s.app.inject('/api/v1/purchases')).statusCode).toBe(401);
    expect((await s.call('GET','/openapi.json')).json().paths['/api/v1/receipts/ingest']).toBeDefined();
    expect((await s.call('GET','/docs')).statusCode).toBe(200);
    const binding=await operate(s.pool,{operation:'BIND_NESSIE_ACCOUNT',userId,customerId:'customer1',externalAccountId:'account1'});
    const accountId=binding.accountId!;
    const sync=await s.call('POST','/api/v1/sync/nessie',{accountId});expect(sync.statusCode,sync.body).toBe(200);
    const transactionId=(await s.pool.query('SELECT id FROM transactions WHERE user_id=$1',[userId])).rows[0].id;
    await writeFile(join(s.directory,userId,'original1.json'),JSON.stringify({mimeType:'image/jpeg',data:Buffer.from('mock photo transport').toString('base64')}));
    const extracted=await s.call('POST','/api/v1/receipts/ingest',{source:'PHOTO',originalFileId:'original1'});expect(extracted.statusCode,extracted.body).toBe(200);
    const receiptId=extracted.json().data.id;
    const matched=await s.call('POST','/api/v1/receipts/match',{receiptId,transactionIds:[transactionId]});expect(matched.statusCode,matched.body).toBe(200);
    expect(matched.json().data[0].status).toBe('CONFIRMED');
    const purchases=await s.call('GET','/api/v1/purchases');expect(purchases.statusCode,purchases.body).toBe(200);
    const purchaseId=purchases.json().data[0].id;
    await writeFile(join(s.directory,userId,'terms1.json'),JSON.stringify({mimeType:'text/plain',data:Buffer.from('Returns accepted within 30 days. Final sale items excluded.').toString('base64')}));
    const evidenceId=(await s.pool.query(`INSERT INTO evidence(user_id,source_type,source_id,category,acquisition_method) VALUES($1,'USER','terms1','Return terms','MANUAL_UPLOAD') RETURNING id`,[userId])).rows[0].id;
    const policy=await s.call('POST','/api/v1/policies/extract',{purchaseId,evidenceIds:[evidenceId]});expect(policy.statusCode,policy.body).toBe(200);expect(policy.json().data.eligibility).toBe('REVIEW_REQUIRED');
    const queued=await s.call('POST','/api/v1/monitoring/prices/run',{purchaseIds:[purchaseId]});expect(queued.statusCode,queued.body).toBe(200);
    const jobId=queued.json().data.id;
    const job=(await s.pool.query('SELECT idempotency_key FROM jobs WHERE id=$1',[jobId])).rows[0];
    const headers={'x-idempotency-key':job.idempotency_key};
    expect((await s.call('POST','/api/v1/internal/monitoring/prices/execute',{jobId},userToken,headers)).statusCode).toBe(401);
    const transport=vi.fn<typeof fetch>().mockImplementation(async (_url,init)=>{
      const response=await s.app.inject({method:'POST',url:'/api/v1/internal/monitoring/prices/execute',headers:init?.headers as Record<string,string>,payload:String(init?.body)});
      return new Response(response.body,{status:response.statusCode,headers:{'content-type':'application/json'}});
    });
    const runner=new JobRunner(new PostgresJobRepository(s.pool),{PRICE_MONITOR:createInternalPriceHandler({url:'https://api.example.com',token:workerToken,fetchImpl:transport})});
    expect(await runner.runOnce()).toBe('SUCCEEDED');
    const executed=await s.call('POST','/api/v1/internal/monitoring/prices/execute',{jobId},workerToken,headers);expect(executed.statusCode,executed.body).toBe(200);expect(executed.json()).toMatchObject({opportunities:1,replay:true});
    const replay=await s.call('POST','/api/v1/internal/monitoring/prices/execute',{jobId},workerToken,headers);expect(replay.json()).toEqual(executed.json());expect(s.offers).toHaveBeenCalledTimes(1);
    const opportunities=await s.call('GET','/api/v1/opportunities');expect(opportunities.statusCode,opportunities.body).toBe(200);
    expect(opportunities.json().data[0]).toMatchObject({estimatedSavingsCents:5000,eligibility:'REVIEW_REQUIRED'});
    expect(opportunities.json().data[0].evidenceIds).not.toHaveLength(0);
    const opportunityId=opportunities.json().data[0].id;
    const created=await s.call('POST','/api/v1/recovery/cases',{opportunityId});expect(created.statusCode,created.body).toBe(200);const caseId=created.json().data.id;
    expect((await s.call('POST',`/api/v1/recovery/cases/${caseId}/approve`,{approved:false})).statusCode).toBe(400);
    const approved=await s.call('POST',`/api/v1/recovery/cases/${caseId}/approve`,{approved:true});expect(approved.statusCode,approved.body).toBe(200);expect(approved.json().data.status).toBe('APPROVED');
    expect((await s.call('POST','/api/v1/refunds/reconcile',{caseId,depositIds:[]})).statusCode).toBe(409);
    // Trusted staff records a simulated submission/reference; approval never submits automatically.
    await operate(s.pool,{operation:'RECORD_SIMULATED_SUBMISSION',userId,caseId,accountId,reference:'RMA-TEST-4242',simulated:true});
    s.setDeposits([{_id:'pending',amount:50,transaction_date:new Date().toISOString(),description:'Refund RMA-TEST-4242',status:'pending'},{_id:'future',amount:50,transaction_date:new Date(Date.now()+86400000).toISOString(),description:'Refund RMA-TEST-4242',status:'completed'},{_id:'unrelated',amount:50,transaction_date:new Date().toISOString(),description:'Payroll',status:'completed'},{_id:'partial',amount:20,transaction_date:new Date().toISOString(),description:'Demo Retailer refund RMA-TEST-4242',status:'completed'}]);
    expect((await s.call('POST','/api/v1/sync/nessie',{accountId})).statusCode).toBe(200);
    expect((await s.pool.query("SELECT COUNT(*)::int count FROM deposits WHERE nessie_deposit_id='pending'")).rows[0].count).toBe(0);
    expect((await s.call('POST','/api/v1/refunds/reconcile',{caseId,depositIds:['future']})).json().data).toEqual([]);
    const unrelated=await s.call('POST','/api/v1/refunds/reconcile',{caseId,depositIds:['unrelated']});expect(unrelated.statusCode,unrelated.body).toBe(200);expect(unrelated.json().data).toHaveLength(0);
    const partial=await s.call('POST','/api/v1/refunds/reconcile',{caseId,depositIds:['partial']});expect(partial.statusCode,partial.body).toBe(200);expect(partial.json().data[0]).toMatchObject({status:'MATCHED',confirmedAmountCents:2000,simulated:true});
    s.setDeposits([{_id:'partial',amount:20,transaction_date:new Date().toISOString(),description:'Demo Retailer refund RMA-TEST-4242',status:'completed'},{_id:'remaining',amount:30,transaction_date:new Date().toISOString(),description:'Demo Retailer refund RMA-TEST-4242',status:'completed'}]);
    await s.call('POST','/api/v1/sync/nessie',{accountId});
    const complete=await s.call('POST','/api/v1/refunds/reconcile',{caseId,depositIds:['partial','remaining']});expect(complete.statusCode,complete.body).toBe(200);expect(complete.json().data.every((r:{status:string})=>r.status==='CONFIRMED')).toBe(true);
    const again=await s.call('POST','/api/v1/refunds/reconcile',{caseId,depositIds:['partial','remaining']});expect(again.json().data).toHaveLength(2);
    expect(await enqueueScheduledPrices(s.pool)).toBe(0);
    await operate(s.pool,{operation:'ENABLE_PRICE_MONITORING',userId,purchaseId,consentConfirmed:true});
    expect(await enqueueScheduledPrices(s.pool)).toBe(1);
    expect(await enqueueScheduledPrices(s.pool)).toBe(1);
    expect((await s.pool.query("SELECT COUNT(*)::int count FROM jobs WHERE job_type='PRICE_MONITOR'")).rows[0].count).toBe(2);
    const state=(await s.pool.query('SELECT status,confirmed_refund_cents FROM cases WHERE id=$1',[caseId])).rows[0];expect(state).toMatchObject({status:'CONFIRMED',confirmed_refund_cents:5000});
    expect((await s.call('GET',`/api/v1/offers/${purchaseId}`,undefined,otherToken)).statusCode).toBe(404);
    expect((await s.call('POST',`/api/v1/recovery/cases/${caseId}/approve`,{approved:true},otherToken)).statusCode).toBe(404);
    expect((await s.call('POST','/api/v1/monitoring/prices/run',{purchaseIds:[purchaseId]},otherToken)).statusCode).toBe(403);
    expect((await s.call('GET','/api/v1/purchases',undefined,otherToken)).json().data).toEqual([]);
    for(const path of ['/api/v1/subscriptions','/api/v1/notifications','/api/v1/deadlines',`/api/v1/purchases/${purchaseId}/timeline`])expect((await s.call('GET',path)).statusCode).toBe(200);
  }finally{await s.close();}
},60000);

test('T21 Best Buy and Bright Data orchestrator uses actual adapters with mocked provider HTTP',async()=>{
  const s=await fixture();try{
    const purchaseId=(await s.pool.query(`INSERT INTO purchases(user_id,merchant_name,purchased_at,amount_cents) VALUES($1,'Demo',NOW(),30000) RETURNING id`,[userId])).rows[0].id;
    const purchase={id:purchaseId,transactionId:null,receiptIds:[],merchantName:'Demo',orderNumber:null,purchasedAt:new Date().toISOString(),amountCents:30000,currency:'USD' as const,matchStatus:'MATCHED' as const,items:[{name:'Watch',brand:'Demo',model:'DW-1',sku:null,gtin:null,quantity:1,unitPriceCents:30000}]};
    await s.pool.query(`INSERT INTO product_offers(user_id,purchase_id,source,retailer_name,product_name,condition,price_cents,product_url,observed_at) VALUES($1,$2,'BRIGHT_DATA','Amazon','Watch','NEW',30000,'https://www.amazon.com/dp/B000000001',NOW())`,[userId,purchaseId]);
    const fetchImpl=vi.fn<typeof fetch>().mockImplementation(async(url)=>{
      const value=String(url);
      if(value.includes('bestbuy.com'))return Response.json({products:[{sku:123,name:'Demo Watch',salePrice:250,url:'https://www.bestbuy.com/site/watch/123.p',onlineAvailability:true,modelNumber:'DW-1'}]});
      if(value.includes('/trigger'))return Response.json({snapshot_id:'s_test123'});
      if(value.includes('/progress'))return Response.json({snapshot_id:'s_test123',status:'ready'});
      return Response.json([{url:'https://www.amazon.com/dp/B000000001',title:'Demo Watch',final_price:250,currency:'USD',availability:'In Stock',model:'DW-1',condition:'New',timestamp:new Date().toISOString()}]);
    });
    const config=loadIntegrationConfig({BESTBUY_API_KEY:'fixture',BRIGHTDATA_API_KEY:'fixture',BRIGHTDATA_AMAZON_DATASET_ID:'gd_test'});
    const offers=await createOfferProvider(config,s.pool,fetchImpl)(purchase);
    expect(offers.some(o=>o.source==='BEST_BUY')).toBe(true);expect(offers.some(o=>o.source==='BRIGHT_DATA')).toBe(true);
    expect(fetchImpl.mock.calls.some(([url])=>String(url).includes('/progress'))).toBe(true);
  }finally{await s.close();}
},60000);

test('private upload preserves bytes/checksum, rejects invalid media and isolates users',async()=>{
  const s=await fixture();try{
    const bytes=Buffer.from('Synthetic receipt evidence — USD 300.00');
    const uploaded=await s.call('POST','/api/v1/documents',{mimeType:'text/plain',contentBase64:bytes.toString('base64')});
    expect(uploaded.statusCode,uploaded.body).toBe(200);
    const metadata=uploaded.json().data;expect(metadata.byteLength).toBe(bytes.length);expect(metadata.checksum).toHaveLength(64);
    expect((await s.call('GET',`/api/v1/documents/${metadata.originalFileId}`)).json().data).toEqual(metadata);
    expect((await s.call('GET',`/api/v1/documents/${metadata.originalFileId}`,undefined,otherToken)).statusCode).toBe(404);
    const reopened=new BackendService(s.pool,s.config.integration!,null);
    expect((await reopened.document(userId,metadata.originalFileId)).data).toEqual(metadata);
    const invalid=await s.call('POST','/api/v1/documents',{mimeType:'image/jpeg',contentBase64:bytes.toString('base64')});expect(invalid.statusCode).toBe(415);
    expect((await s.call('POST','/api/v1/documents',{mimeType:'application/json',contentBase64:bytes.toString('base64')})).statusCode).toBe(400);
    await writeFile(join(s.directory,userId,`${metadata.originalFileId}.json`),JSON.stringify({mimeType:'text/plain',data:Buffer.from('tampered').toString('base64')}));
    expect((await s.call('GET',`/api/v1/documents/${metadata.originalFileId}`)).statusCode).toBe(409);
  }finally{await s.close();}
},60000);

test('worker executor skips purchases without extracted items without contacting retailers',async()=>{
  const s=await fixture();try{
    const purchaseId=(await s.pool.query(`INSERT INTO purchases(user_id,merchant_name,purchased_at,amount_cents,match_status) VALUES($1,'Synthetic connectivity probe',NOW(),0,'REVIEW') RETURNING id`,[userId])).rows[0].id;
    expect(await s.service.executePrices(userId,[purchaseId])).toMatchObject({observations:0,opportunities:0,skippedPurchases:1});
    expect(s.offers).not.toHaveBeenCalled();
  }finally{await s.close();}
},60000);
