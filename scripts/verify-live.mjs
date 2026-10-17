/** Run with Node --env-file=.env.verify. Prints only bounded, non-secret results. */
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const pg=createRequire(new URL('../apps/api/package.json',import.meta.url))('pg');
const base=new URL(process.env.API_BASE_URL||'https://swamphacks2026-production.up.railway.app');
if(base.protocol!=='https:'||base.username||base.password)throw new Error('INVALID_API_ORIGIN');
const token=process.env.DEPLOY_VERIFY_ACCESS_TOKEN;
const statePath=new URL('../.release-verification-state.json',import.meta.url);
const state=existsSync(statePath)?JSON.parse(readFileSync(statePath,'utf8')):{};
const save=()=>writeFileSync(statePath,JSON.stringify(state,null,2)+'\n',{mode:0o600});
const report={};let client;
const safeCode=value=>typeof value==='string'&&/^[A-Z0-9_]{2,80}$/.test(value)?value:'CHECK_FAILED';
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
async function api(path,method='GET',body){
  const response=await fetch(new URL(path,base.origin),{method,redirect:'error',signal:AbortSignal.timeout(60000),headers:{authorization:`Bearer ${token}`,...(body?{'content-type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw Object.assign(new Error(safeCode(data?.error?.code)),{status:response.status});
  return {data:data?.data??data,instance:response.headers.get('x-api-instance'),revision:response.headers.get('x-api-revision')};
}
try{
 if(!token||!process.env.DATABASE_URL)throw new Error('LOCAL_CREDENTIALS_MISSING');
 const health=await api('/health');report.health='PASS';report.revision=health.revision;
 if((process.argv.includes('--worker')||process.argv.includes('--documents'))&&health.revision!=='document-upload-v1')throw new Error('DEPLOY_LATEST_RELEASE_CHECKS_FIRST');
 const databaseUrl=new URL(process.env.DATABASE_URL);databaseUrl.searchParams.set('sslmode','verify-full');databaseUrl.searchParams.set('sslrootcert',fileURLToPath(new URL('../config/tigerdata-ca.pem',import.meta.url)));
 client=new pg.Client({connectionString:databaseUrl.toString(),connectionTimeoutMillis:10000,statement_timeout:15000});await client.connect();await client.query('SELECT 1');report.database='PASS';
 for (const id of ['001_init_tiger_data','002_serpapi_source']) {
  const migration=(await client.query('SELECT checksum FROM schema_migrations WHERE id=$1',[id])).rows[0];
  const expected=createHash('sha256').update(readFileSync(new URL(`../packages/db/src/migrations/${id}.sql`,import.meta.url),'utf8')).digest('hex');
  if(migration?.checksum!==expected)throw new Error('MIGRATION_CHECKSUM_MISMATCH');
 }
 report.migration='PASS';
 report.authenticatedPurchases=(await api('/api/v1/purchases')).data.length>=0?'PASS':'FAIL';
 if(process.argv.includes('--worker')){
  const hash=createHash('sha256').update(token).digest('hex');
  const identities=JSON.parse(process.env.API_TOKENS_JSON||'[]');const identity=identities.find(entry=>entry.tokenHash===hash);
  if(!identity||!uuid(identity.userId))throw new Error('TOKEN_MAPPING_MISSING');
  await client.query('BEGIN');
  try{
   await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`release-worker-probe:${identity.userId}`]);
   const eventKey='release-worker-connectivity-probe:v1';
   let purchaseId=(await client.query('SELECT entity_id FROM events WHERE user_id=$1 AND idempotency_key=$2',[identity.userId,eventKey])).rows[0]?.entity_id;
   if(!purchaseId){purchaseId=(await client.query("INSERT INTO purchases(user_id,merchant_name,purchased_at,amount_cents,match_status) VALUES($1,'SYNTHETIC WORKER PROBE — not a bank purchase',NOW(),0,'REVIEW') RETURNING id",[identity.userId])).rows[0].id;
    await client.query("INSERT INTO events(user_id,idempotency_key,entity_type,entity_id,event_type,event_payload) VALUES($1,$2,'PURCHASE',$3,'RELEASE_PROBE_CREATED',$4)",[identity.userId,eventKey,purchaseId,JSON.stringify({synthetic:true,amountCents:0,purpose:'Connectivity only; no items, offers or savings'})]);}
   await client.query('COMMIT');state.workerProbePurchaseId=purchaseId;save();
  }catch(error){await client.query('ROLLBACK');throw error;}
  const job=(await api('/api/v1/monitoring/prices/run','POST',{purchaseIds:[state.workerProbePurchaseId]})).data;
  if(!uuid(job.id))throw new Error('INVALID_JOB_RESPONSE');state.workerProbeJobId=job.id;save();
  const deadline=Date.now()+45000;let row;
  do{row=(await client.query('SELECT status,result_json FROM jobs WHERE id=$1',[job.id])).rows[0];if(['SUCCEEDED','FAILED'].includes(row?.status))break;await new Promise(resolve=>setTimeout(resolve,2000));}while(Date.now()<deadline);
  report.worker={status:row?.status??'UNKNOWN',connectivityPassed:row?.status==='SUCCEEDED'&&row.result_json?.skippedPurchases===1,retailTested:false};
  if(row?.result_json?.error)report.worker.errorCode=safeCode(row.result_json.error);
 }
 if(process.argv.includes('--documents')){
  if(!state.document){
   const text=['SYNTHETIC RECEIPT — BACKEND VERIFICATION ONLY','Merchant: MoneyBack Demo Retailer','Order: RELEASE-DEMO-1','Purchased at: 2026-10-17T12:00:00Z','Demo Watch; brand Demo; model DW-1; SKU DEMO-DW1','Quantity: 1','Unit price: USD 300.00','Total: USD 300.00'].join('\n');
   const metadata=(await api('/api/v1/documents','POST',{mimeType:'text/plain',contentBase64:Buffer.from(text).toString('base64')})).data;
   if(!uuid(metadata.originalFileId)||metadata.checksum!==createHash('sha256').update(text).digest('hex'))throw new Error('DOCUMENT_CHECKSUM_MISMATCH');
   state.document={...metadata,instance:health.instance};save();
  }
  const metadata=(await api(`/api/v1/documents/${state.document.originalFileId}`)).data;
  if(metadata.checksum!==state.document.checksum)throw new Error('PERSISTED_CHECKSUM_MISMATCH');
  report.documentWriteAndRead='PASS';
  report.documentPersistence=health.instance&&state.document.instance&&health.instance!==state.document.instance?'PASS_ACROSS_INSTANCE_CHANGE':'REDEPLOY_AND_REPEAT_REQUIRED';
  if(!state.receiptId){const receipt=(await api('/api/v1/receipts/ingest','POST',{source:'EMAIL',originalFileId:state.document.originalFileId})).data;
   if(!uuid(receipt.id))throw new Error('INVALID_RECEIPT_RESPONSE');state.receiptId=receipt.id;save();}
  const receipt=(await client.query('SELECT extraction_status,total_cents FROM receipts WHERE id=$1',[state.receiptId])).rows[0];
  report.gemini={status:receipt?.extraction_status??'MISSING',totalMatches:receipt?.total_cents===30000};
 }
}catch(error){report.error={code:safeCode(error.code??error.message),...(Number.isInteger(error.status)?{httpStatus:error.status}:{})};process.exitCode=1;}
finally{await client?.end().catch(()=>{});}
console.log(JSON.stringify(report,null,2));
