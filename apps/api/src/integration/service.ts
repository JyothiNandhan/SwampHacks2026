import { randomUUID, createHash } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';
import { ReceiptItemSchema, TransactionSchema, RecoveryCaseSchema, EvidenceSchema, type Receipt } from '@moneyback/contracts';
import { createReceiptExtractor, createGeminiGenerator, type GenerateReceipt } from '../modules/documents/extractor.js';
import { matchReceiptToTransactions, detectDuplicateReceipts } from '../modules/matching/receipt-matcher.js';
import { createPurchaseIntegrator, TigerDataPurchaseIntegrationStore } from '../modules/matching/purchase-integration.js';
import { parsePolicyDocument } from '../modules/documents/policy-parser.js';
import { compareRentalBill } from '../modules/documents/billing-comparison.js';
import { createPolicyTimeline } from '../modules/recovery/timeline.js';
import { transitionRecoveryCase } from '../modules/recovery/state-machine.js';
import { createNessieImporter, TigerDataNessieStore, type NessieReader } from '../modules/banking/nessie-import.js';
import { PrivateDocumentStore, receiptFromRow } from './documents.js';
import { transaction, owned, wire, uuid } from './database.js';
import { ApiError, type Identity } from './security.js';
import type { IntegrationConfig } from './config.js';
import { loadPurchase, createPriceExecutor, type OfferProvider } from './prices.js';
import { reconcileImportedDeposits } from './refunds.js';

const evidenceColumns = 'id,source_type,source_id,category,acquisition_method,raw_url,checksum,created_at';
const caseColumns = 'id,opportunity_id,status,expected_refund_cents,confirmed_refund_cents,matching_nessie_deposit_id,approved_at,updated_at';
const receiptItemColumns = 'name,brand,model,sku,gtin,quantity,unit_price_cents';
const billingDocument = z.object({ kind:z.enum(['AGREEMENT','FINAL_BILL']),charges:z.array(z.object({ label:z.string().min(1),amountCents:z.number().int().nonnegative().max(2147483647) }).strict()).max(200) }).strict();
export class BackendService {
  readonly documents: PrivateDocumentStore | null;
  readonly executePrices: ReturnType<typeof createPriceExecutor>;
  constructor(readonly pool: pg.Pool, readonly config: IntegrationConfig, readonly nessie: NessieReader | null,
    readonly options: { generate?:GenerateReceipt; offers?:OfferProvider } = {}) {
    this.documents = config.EVIDENCE_DIRECTORY ? new PrivateDocumentStore(pool,config.EVIDENCE_DIRECTORY) : null;
    this.executePrices = createPriceExecutor(pool,config,options.offers);
  }
  async purchases(userId:string,cursor?:string) {
    const ids = (await this.pool.query('SELECT id FROM purchases WHERE user_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT 101',[userId,cursor??null])).rows;
    return {data:await Promise.all(ids.slice(0,100).map(row => loadPurchase(this.pool,userId,row.id))),nextCursor:ids.length>100?ids[99].id:null};
  }
  async list(userId:string, kind:'subscriptions'|'opportunities'|'notifications'|'deadlines', cursor?:string) {
    const columns = {
      subscriptions:'id,account_id,merchant_name,plan_name,amount_cents,currency,billing_cycle,started_at,next_billing_at',
      opportunities:`id,purchase_id,type,estimated_savings_cents,currency,status,eligibility,deadline_at,created_at,COALESCE((SELECT json_agg(evidence_id) FROM opportunity_evidence e WHERE e.user_id=t.user_id AND e.opportunity_id=t.id),'[]') evidence_ids`,
      notifications:'id,opportunity_id,type,title,message,created_at,read_at',
      deadlines:`id,purchase_id,policy_id,type,deadline_at,COALESCE((SELECT json_agg(evidence_id) FROM deadline_evidence e WHERE e.user_id=t.user_id AND e.deadline_id=t.id),'[]') evidence_ids`
    };
    const rows=(await this.pool.query(`SELECT ${columns[kind]} FROM ${kind} t WHERE user_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT 101`,[userId,cursor??null])).rows;
    return {data:rows.slice(0,100).map(wire),nextCursor:rows.length>100?rows[99].id:null};
  }
  async timeline(userId:string,purchaseId:string,cursor?:string) {
    await owned(this.pool,'purchases',userId,purchaseId);
    const rows=(await this.pool.query(`SELECT id,entity_type,entity_id,event_type,event_payload,created_at FROM events WHERE user_id=$1 AND entity_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT 101`,[userId,purchaseId,cursor??null])).rows;
    return {data:rows.slice(0,100).map(wire),nextCursor:rows.length>100?rows[99].id:null};
  }
  async extract(userId:string,receiptId:string,input:unknown):Promise<Receipt> {
    if (!this.documents || (!this.options.generate && !this.config.GEMINI_API_KEY) || !this.config.GEMINI_MODEL) throw new ApiError('DOCUMENTS_NOT_CONFIGURED',503);
    return createReceiptExtractor({store:this.documents,generate:this.options.generate ?? createGeminiGenerator(this.config.GEMINI_API_KEY!),model:this.config.GEMINI_MODEL})(userId,receiptId,input);
  }
  async match(userId:string,receiptId:string,transactionIds:string[]) {
    if (transactionIds.length > 100) throw new ApiError('INVALID_BATCH_SIZE',400);
    const receipt = receiptFromRow(await owned(this.pool,'receipts',userId,receiptId));
    const rows = (await this.pool.query('SELECT * FROM transactions WHERE user_id=$1 AND id=ANY($2::uuid[])',[userId,transactionIds.map(uuid)])).rows;
    if (rows.length !== new Set(transactionIds).size) throw new ApiError('NOT_FOUND',404);
    const transactions = rows.map(row => TransactionSchema.parse({id:row.id,nessiePurchaseId:row.nessie_purchase_id,accountId:row.account_id,merchantId:row.merchant_id,merchantName:row.merchant_name,amountCents:row.amount_cents,currency:row.currency,occurredAt:new Date(row.occurred_at).toISOString(),receiptStatus:row.receipt_status}));
    const candidates = matchReceiptToTransactions(receipt,transactions);
    // Equal-scoring candidates are ambiguous; never persist an arbitrary winner.
    if (candidates[0]?.status === 'CONFIRMED' && candidates[0].score > (candidates[1]?.score ?? -1)) {
      const items = (await this.pool.query(`SELECT ${receiptItemColumns} FROM receipt_items WHERE user_id=$1 AND receipt_id=$2`,[userId,receiptId])).rows.map(row => ReceiptItemSchema.parse(wire(row)));
      const evidence = (await this.pool.query(`SELECT ${evidenceColumns} FROM evidence WHERE user_id=$1 AND source_type='RECEIPT' AND source_id=$2`,[userId,receiptId])).rows.map(row => EvidenceSchema.parse(wire(row)));
      await createPurchaseIntegrator(new TigerDataPurchaseIntegrationStore(this.pool))({userId,receipt,transactions:[transactions.find(t => t.id===candidates[0].transactionId)!],items,evidence});
    } else if (candidates.length>1 && candidates[0].score===candidates[1].score) {
      for (const candidate of candidates) if (candidate.score===candidates[0].score) candidate.status='REVIEW';
    }
    return {data:candidates};
  }
  async consolidate(userId:string,pathId:string,receiptIds:string[]) {
    if (receiptIds.length>100 || !receiptIds.includes(pathId)) throw new ApiError('INVALID_RECEIPT_GROUP',400);
    const inputs = [];
    for (const id of [...new Set(receiptIds)]) {
      const receipt=receiptFromRow(await owned(this.pool,'receipts',userId,id));
      const evidence=(await this.pool.query("SELECT checksum FROM evidence WHERE user_id=$1 AND source_type='RECEIPT' AND source_id=$2",[userId,id])).rows[0];
      inputs.push({receipt,checksum:evidence?.checksum});
    }
    const result=detectDuplicateReceipts(inputs);
    const group=result.groups.find(group => group.receiptIds.length===inputs.length);
    if (!group) throw new ApiError('DUPLICATE_NOT_ESTABLISHED',409);
    await this.pool.query(`INSERT INTO events(user_id,idempotency_key,entity_type,entity_id,event_type,event_payload) VALUES($1,$2,'RECEIPT',$3,'DUPLICATES_REVIEWED',$4) ON CONFLICT DO NOTHING`,[userId,`duplicate:${group.receiptIds.join(':')}`,group.canonicalReceiptId,JSON.stringify({ ...group,warningCodes:result.warningCodes,retainedReceiptIds:result.retainedReceiptIds })]);
    return {data:group};
  }
  private async sourceText(userId:string,evidenceId:string) {
    const evidence=await owned(this.pool,'evidence',userId,evidenceId);
    if (!this.documents) throw new ApiError('DOCUMENTS_NOT_CONFIGURED',503);
    const original=await this.documents.readOriginal(userId,String(evidence.source_id));
    if (!original || !['text/plain','application/json'].includes(original.mimeType)) throw new ApiError('TEXT_EVIDENCE_REQUIRED',409);
    return {evidence,text:new TextDecoder().decode(original.bytes)};
  }
  async policy(userId:string,purchaseId:string,evidenceIds:string[]) {
    if (evidenceIds.length!==1) throw new ApiError('ONE_POLICY_DOCUMENT_REQUIRED',400);
    const purchase=await loadPurchase(this.pool,userId,purchaseId);
    const source=await this.sourceText(userId,evidenceIds[0]);
    const id=randomUUID(); const now=new Date().toISOString();
    const parsed=parsePolicyDocument({id,evidenceId:randomUUID(),purchaseId,purchasedAt:purchase.purchasedAt,
      document:{sourceName:String(source.evidence.category),sourceUrl:source.evidence.raw_url as string|null,text:source.text,acquiredAt:now}});
    const timeline=createPolicyTimeline({purchaseId,policy:parsed.policy,ids:{deadlineId:randomUUID(),eventId:randomUUID(),notificationId:randomUUID()},now});
    // Parsing a duration does not verify that terms apply to this exact item.
    parsed.policy.eligibility='REVIEW_REQUIRED';
    parsed.policy.evidenceIds=[String(source.evidence.id)];
    await transaction(this.pool,async client => {
      await owned(client,'purchases',userId,purchaseId,true);
      await client.query(`INSERT INTO policies(id,user_id,purchase_id,policy_type,source_name,source_url,raw_terms,exclusions,eligibility,parsed_start_at,parsed_end_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,[id,userId,purchaseId,parsed.policy.policyType,parsed.policy.sourceName,parsed.policy.sourceUrl,JSON.stringify(parsed.policy.rawTerms),parsed.policy.exclusions,parsed.policy.eligibility,parsed.policy.parsedStartAt,parsed.policy.parsedEndAt]);
      await client.query('INSERT INTO policy_evidence(user_id,policy_id,evidence_id) VALUES($1,$2,$3)',[userId,id,source.evidence.id]);
      if(timeline){
        await client.query(`INSERT INTO deadlines(id,user_id,purchase_id,policy_id,type,deadline_at) VALUES($1,$2,$3,$4,$5,$6)`,[timeline.deadline.id,userId,purchaseId,id,timeline.deadline.type,timeline.deadline.deadlineAt]);
        await client.query('INSERT INTO deadline_evidence(user_id,deadline_id,evidence_id) VALUES($1,$2,$3)',[userId,timeline.deadline.id,source.evidence.id]);
        await client.query(`INSERT INTO notifications(id,user_id,type,title,message) VALUES($1,$2,$3,$4,$5)`,[timeline.notification.id,userId,timeline.notification.type,`Review possible ${timeline.deadline.type.toLowerCase()} deadline`,`Unverified item eligibility. ${timeline.notification.message}`]);
      }
      await client.query(`INSERT INTO events(user_id,idempotency_key,entity_type,entity_id,event_type,event_payload) VALUES($1,$2,'PURCHASE',$3,'POLICY_EXTRACTED',$4)`,[userId,`policy:${id}`,purchaseId,JSON.stringify({policyId:id,warningCodes:[...parsed.warningCodes,'ITEM_ELIGIBILITY_REQUIRES_REVIEW']})]);
    });
    return {data:parsed.policy};
  }
  async billing(userId:string,purchaseId:string,evidenceIds:string[]) {
    await owned(this.pool,'purchases',userId,purchaseId);
    if (evidenceIds.length!==2) throw new ApiError('TWO_BILLING_DOCUMENTS_REQUIRED',400);
    const docs=[];
    for (const id of evidenceIds) {const source=await this.sourceText(userId,id); let raw:unknown;try{raw=JSON.parse(source.text);}catch{throw new ApiError('INVALID_BILLING_DOCUMENT',400);} const data=billingDocument.safeParse(raw); if(!data.success)throw new ApiError('INVALID_BILLING_DOCUMENT',400); docs.push({data:data.data,evidence:EvidenceSchema.parse(wire(Object.fromEntries(Object.entries(source.evidence).filter(([key])=>evidenceColumns.split(',').includes(key)))))});}
    const agreement=docs.find(d=>d.data.kind==='AGREEMENT'); const final=docs.find(d=>d.data.kind==='FINAL_BILL');
    if (!agreement || !final) throw new ApiError('BILLING_DOCUMENT_PAIR_REQUIRED',400);
    const result=compareRentalBill({purchaseId,agreement:agreement.data.charges.map(c=>({...c,evidenceId:agreement.evidence.id})),finalBill:final.data.charges.map(c=>({...c,evidenceId:final.evidence.id})),evidence:docs.map(d=>d.evidence)});
    if(result.unverifiedFees.length)result.comparison.eligibility='REVIEW_REQUIRED';
    return {data:result.comparison};
  }
  async createCase(userId:string,opportunityId:string) {
    return transaction(this.pool,async client=>{
      const opportunity=await owned(client,'opportunities',userId,opportunityId,true);
      const row=(await client.query(`INSERT INTO cases(user_id,opportunity_id,status,expected_refund_cents) VALUES($1,$2,'REVIEW',$3) ON CONFLICT(user_id,opportunity_id) DO UPDATE SET opportunity_id=EXCLUDED.opportunity_id RETURNING ${caseColumns}`,[userId,opportunityId,opportunity.estimated_savings_cents])).rows[0];
      return {data:RecoveryCaseSchema.parse(wire(row))};
    });
  }
  async approve(userId:string,caseId:string) {
    return transaction(this.pool,async client=>{
      const raw=await owned(client,'cases',userId,caseId,true);
      const current=RecoveryCaseSchema.parse(wire(Object.fromEntries(caseColumns.split(',').map(key=>[key,raw[key]]))));
      if(current.status==='APPROVED')return {data:current};
      const opportunity=await owned(client,'opportunities',userId,current.opportunityId);
      if(opportunity.eligibility==='INELIGIBLE' || (opportunity.deadline_at && Date.parse(String(opportunity.deadline_at))<Date.now()))throw new ApiError('OPPORTUNITY_INELIGIBLE',409);
      if(current.status!=='REVIEW')throw new ApiError('INVALID_TRANSITION',409);
      const next=transitionRecoveryCase(current,'APPROVED',{actor:'USER',explicitApproval:true,occurredAt:new Date().toISOString()});
      await client.query("UPDATE cases SET status='APPROVED',approved_at=$3,updated_at=$3 WHERE user_id=$1 AND id=$2",[userId,caseId,next.approvedAt]);
      await client.query(`INSERT INTO events(user_id,idempotency_key,entity_type,entity_id,event_type,event_payload) VALUES($1,$2,'CASE',$3,'USER_APPROVED',$4)`,[userId,`approval:${caseId}`,caseId,JSON.stringify({userId,explicitApproval:true,simulatedOnly:true})]);
      return {data:next};
    });
  }
  async reconcile(userId:string,caseId:string,depositIds:string[]) {
    if(depositIds.length>100)throw new ApiError('INVALID_BATCH_SIZE',400);
    return {data:await reconcileImportedDeposits(this.pool,userId,caseId,depositIds)};
  }
  async offers(userId:string,purchaseId:string,cursor?:string) {
    await owned(this.pool,'purchases',userId,purchaseId);
    const rows=(await this.pool.query(`SELECT id,source,retailer_name,product_name,sku,model,gtin,condition,price_cents,shipping_cents,currency,in_stock,product_url,observed_at FROM product_offers WHERE user_id=$1 AND purchase_id=$2 AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT 101`,[userId,purchaseId,cursor??null])).rows;
    return {data:rows.slice(0,100).map(wire),nextCursor:rows.length>100?rows[99].id:null};
  }
  async queuePrices(identity:Identity,purchaseIds:string[]) {
    if(!identity.roles.some(role=>['admin','demo'].includes(role)))throw new ApiError('FORBIDDEN',403);
    if(!purchaseIds.length||purchaseIds.length>100)throw new ApiError('INVALID_BATCH_SIZE',400);
    const ids=[...new Set(purchaseIds)].sort();
    for(const id of ids)await owned(this.pool,'purchases',identity.userId,id);
    const hash=createHash('sha256').update(ids.join(',')).digest('hex');
    const key=`price:${identity.userId}:${new Date().toISOString().slice(0,13)}:${hash}`;
    const row=(await this.pool.query(`INSERT INTO jobs(user_id,idempotency_key,job_type,payload) VALUES($1,$2,'PRICE_MONITOR',$3) ON CONFLICT(idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id,job_type,status,created_at,updated_at`,[identity.userId,key,JSON.stringify({purchaseIds:ids})])).rows[0];
    return {data:wire(row)};
  }
  async sync(userId:string,accountId:string) {
    if(!this.nessie)throw new ApiError('NESSIE_NOT_CONFIGURED',503);
    const account=await owned(this.pool,'accounts',userId,accountId);
    // The importer accepts a customer ID, while the HTTP contract accepts an account ID.
    // Only trusted provisioning can bind a customer to this user/account.
    const binding=(await this.pool.query(`SELECT event_payload FROM events WHERE user_id=$1 AND entity_id=$2 AND event_type='NESSIE_ACCOUNT_BOUND' ORDER BY created_at DESC LIMIT 1`,[userId,accountId])).rows[0];
    const customerId=binding?.event_payload?.customerId;
    if(typeof customerId!=='string'||binding.event_payload.externalAccountId!==account.external_account_id)throw new ApiError('NESSIE_ACCOUNT_BINDING_REQUIRED',409);
    const counts=await createNessieImporter({client:this.nessie,store:new TigerDataNessieStore(this.pool)})(userId,customerId);
    const row=(await this.pool.query(`INSERT INTO jobs(user_id,idempotency_key,job_type,status,payload,result_json) VALUES($1,$2,'NESSIE_IMPORT','SUCCEEDED',$3,$4) RETURNING id,job_type,status,created_at,updated_at`,[userId,`sync:${randomUUID()}`,JSON.stringify({accountId}),JSON.stringify(counts)])).rows[0];
    return {data:wire(row)};
  }
}
