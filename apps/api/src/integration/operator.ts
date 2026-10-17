import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { z } from 'zod';
import { transaction, owned } from './database.js';
import { transitionRecoveryCase } from '../modules/recovery/state-machine.js';
import { RecoveryCaseSchema } from '@moneyback/contracts';
import { wire } from './database.js';

const id=z.uuid();
const input=z.discriminatedUnion('operation',[
  z.object({operation:z.literal('PROVISION_USER'),userId:id,email:z.email()}).strict(),
  z.object({operation:z.literal('BIND_NESSIE_ACCOUNT'),userId:id,customerId:z.string().regex(/^[A-Za-z0-9_-]+$/),externalAccountId:z.string().regex(/^[A-Za-z0-9_-]+$/)}).strict(),
  z.object({operation:z.literal('RECORD_SIMULATED_SUBMISSION'),userId:id,caseId:id,accountId:id,reference:z.string().regex(/^[A-Za-z0-9_-]{6,128}$/),simulated:z.literal(true)}).strict(),
  z.object({operation:z.literal('ENABLE_PRICE_MONITORING'),userId:id,purchaseId:id,consentConfirmed:z.literal(true)}).strict(),
  z.object({operation:z.literal('REGISTER_EVIDENCE'),userId:id,fileId:z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),category:z.string().min(1).max(100),mimeType:z.enum(['text/plain','application/json','image/jpeg','image/png','image/webp','application/pdf']),localPath:z.string().min(1)}).strict()
]);
/** Trusted operator only: input file is local, never an HTTP request. No implicit merchant action. */
export async function operate(pool:pg.Pool,value:unknown,directory?:string) {
  const data=input.parse(value);
  return transaction(pool,async client=>{
    if(data.operation==='PROVISION_USER'){
      await client.query('INSERT INTO users(id,email) VALUES($1,$2) ON CONFLICT(id) DO NOTHING',[data.userId,data.email]);return {userId:data.userId};
    }
    if(data.operation==='BIND_NESSIE_ACCOUNT'){
      const account=(await client.query(`INSERT INTO accounts(user_id,external_account_id,institution_name,account_type) VALUES($1,$2,'Capital One Nessie','CHECKING') ON CONFLICT(user_id,external_account_id) DO UPDATE SET external_account_id=EXCLUDED.external_account_id RETURNING id`,[data.userId,data.externalAccountId])).rows[0];
      await client.query(`INSERT INTO events(user_id,idempotency_key,entity_type,entity_id,event_type,event_payload) VALUES($1,$2,'ACCOUNT',$3,'NESSIE_ACCOUNT_BOUND',$4) ON CONFLICT(user_id,idempotency_key) DO NOTHING`,[data.userId,`binding:${account.id}`,account.id,JSON.stringify({customerId:data.customerId,externalAccountId:data.externalAccountId})]);return {accountId:account.id};
    }
    if(data.operation==='REGISTER_EVIDENCE'){
      if(!directory)throw new Error('EVIDENCE_DIRECTORY_REQUIRED');
      const bytes=await readFile(data.localPath);if(!bytes.length||bytes.length>10*1024*1024)throw new Error('INVALID_DOCUMENT_SIZE');
      const path=join(resolve(directory),data.userId);await mkdir(path,{recursive:true,mode:0o700});
      await writeFile(join(path,`${data.fileId}.json`),JSON.stringify({mimeType:data.mimeType,data:bytes.toString('base64')}),{flag:'wx',mode:0o600});
      const result=await client.query(`INSERT INTO evidence(user_id,source_type,source_id,category,acquisition_method,checksum) VALUES($1,'USER',$2,$3,'OPERATOR_APPROVED_UPLOAD',$4) RETURNING id`,[data.userId,data.fileId,data.category,createHash('sha256').update(bytes).digest('hex')]);return {evidenceId:result.rows[0].id,originalFileId:data.fileId};
    }
    if(data.operation==='ENABLE_PRICE_MONITORING'){
      await owned(client,'purchases',data.userId,data.purchaseId,true);
      await client.query(`INSERT INTO events(user_id,idempotency_key,entity_type,entity_id,event_type,event_payload) VALUES($1,$2,'PURCHASE',$3,'PRICE_MONITORING_ENABLED',$4)`,[data.userId,`consent:${randomUUID()}`,data.purchaseId,JSON.stringify({consentConfirmed:true})]);return {enabled:true};
    }
    await owned(client,'accounts',data.userId,data.accountId);
    const row=await owned(client,'cases',data.userId,data.caseId,true);
    const keys=['id','opportunity_id','status','expected_refund_cents','confirmed_refund_cents','matching_nessie_deposit_id','approved_at','updated_at'];
    const current=RecoveryCaseSchema.parse(wire(Object.fromEntries(keys.map(key=>[key,row[key]]))));
    const now=new Date().toISOString();
    const submitted=transitionRecoveryCase(current,'SUBMITTED',{actor:'STAFF',occurredAt:now});
    transitionRecoveryCase(submitted,'PENDING',{actor:'SYSTEM',occurredAt:now});
    await client.query("UPDATE cases SET status='PENDING',updated_at=$3 WHERE user_id=$1 AND id=$2",[data.userId,data.caseId,now]);
    await client.query(`INSERT INTO events(user_id,idempotency_key,entity_type,entity_id,event_type,event_payload) VALUES($1,$2,'CASE',$3,'REFUND_EXPECTATION_RECORDED',$4)`,[data.userId,`expectation:${data.caseId}`,data.caseId,JSON.stringify({reference:data.reference,accountId:data.accountId,simulated:true,actor:'STAFF'})]);
    return {status:'PENDING',simulated:true};
  });
}
if(process.argv[1]?.endsWith('/operator.ts')){
  (async()=>{
    if(!process.env.DATABASE_URL||!process.argv[2])throw new Error('CONFIG_REQUIRED');
    const value=JSON.parse(await readFile(process.argv[2],'utf8'));
    const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
    try{process.stdout.write(`${JSON.stringify(await operate(pool,value,process.env.EVIDENCE_DIRECTORY))}\n`);}finally{await pool.end();}
  })().catch(()=>{process.stderr.write('Operator command failed; verify input, ownership and case state.\n');process.exitCode=1;});
}
