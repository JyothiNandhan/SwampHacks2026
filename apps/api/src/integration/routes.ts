import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { HttpSchemas } from '@moneyback/contracts';
import { BackendService } from './service.js';
import { registry, openApiDocument } from './openapi.js';
import { ApiError, authenticate, bearer, equalSecret, RequestLimiter, type Identity } from './security.js';
import { transaction, uuid } from './database.js';
import type { IntegrationConfig } from './config.js';
import { auth0Bearer, auth0Identity, createAuth0Verifier } from './auth0.js';
import { registerGmailRoutes } from './gmail.js';

declare module 'fastify' { interface FastifyRequest { identity: Identity | null } }
export function registerBackendRoutes(app: FastifyInstance, config: IntegrationConfig, service: BackendService | null) {
  const limiter = new RequestLimiter();
  const verifyAuth0 = config.AUTH0_ISSUER && config.AUTH0_AUDIENCE ? createAuth0Verifier(config.AUTH0_ISSUER,config.AUTH0_AUDIENCE) : null;
  app.decorateRequest('identity', null);
  app.addHook('onRequest', async request => {
    const path = request.url.split('?')[0];
    if (path === '/health') return;
    if (!path.startsWith('/api/') && path !== '/docs' && path !== '/openapi.json') return;
    limiter.consume(`ip:${request.ip}`);
    if (path === '/api/v1/internal/monitoring/prices/execute') {
      const token = bearer(request);
      if (!config.INTERNAL_WORKER_TOKEN || !equalSecret(token,config.INTERNAL_WORKER_TOKEN)) throw new ApiError('UNAUTHORIZED',401);
      return;
    }
    try { request.identity = authenticate(request, config.API_TOKENS_JSON); }
    catch {
      if (!verifyAuth0 || !service) throw new ApiError('UNAUTHORIZED',401);
      request.identity = await auth0Identity(service.pool,await verifyAuth0(auth0Bearer(request)));
    }
    limiter.consume(`user:${request.identity.userId}`);
  });
  app.addHook('onSend', async (_request,reply,payload) => {
    reply.header('cache-control','no-store').header('x-content-type-options','nosniff').header('referrer-policy','no-referrer');
    return payload;
  });
  app.get('/openapi.json', async () => openApiDocument());
  registerGmailRoutes(app,config,service);
  app.get('/docs', async (_request,reply) => {
    reply.header('content-security-policy', "default-src 'none'; style-src 'unsafe-inline'");
    return reply.type('text/html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><title>MoneyBack API</title><style>body{font:16px system-ui;max-width:1000px;margin:3rem auto;padding:1rem}code{font-family:monospace}li{margin:1rem 0}</style><h1>MoneyBack OS API</h1><p>Use a provisioned Bearer token. Financial records are restricted to the token's user. Deposits represent simulated Nessie inflows.</p><p><a href="/openapi.json">OpenAPI 3.1 specification</a> — import this specification into Postman or Bruno with the same Authorization header.</p><ul>${registry.routes.map(route=>`<li><code>${route.method} ${route.prefix===false?'':'/api/v1'}${route.path}</code> — ${route.responseSchema}${route.requestSchema?` (body: ${route.requestSchema})`:''}</li>`).join('')}</ul></html>`);
  });
  type Handler = (identity:Identity,body:Record<string,unknown>,params:Record<string,string>,cursor?:string)=>Promise<unknown>;
  const requireService=()=>{if(!service)throw new ApiError('DATABASE_NOT_CONFIGURED',503);return service;};
  const handlers:Record<string,Handler>={
    'POST /documents':(i,b)=>requireService().upload(i.userId,b),
    'GET /documents/:originalFileId':(i,_b,p)=>requireService().document(i.userId,p.originalFileId),
    'GET /purchases':(i,_b,_p,c)=>requireService().purchases(i.userId,c),
    'GET /subscriptions':(i,_b,_p,c)=>requireService().list(i.userId,'subscriptions',c),
    'GET /opportunities':(i,_b,_p,c)=>requireService().list(i.userId,'opportunities',c),
    'GET /notifications':(i,_b,_p,c)=>requireService().list(i.userId,'notifications',c),
    'GET /deadlines':(i,_b,_p,c)=>requireService().list(i.userId,'deadlines',c),
    'GET /purchases/:purchaseId/timeline':(i,_b,p,c)=>requireService().timeline(i.userId,p.purchaseId,c),
    'GET /offers/:purchaseId':(i,_b,p,c)=>requireService().offers(i.userId,p.purchaseId,c),
    'POST /sync/nessie':(i,b)=>requireService().sync(i.userId,String(b.accountId)),
    'POST /receipts/ingest':async(i,b)=>({data:await requireService().extract(i.userId,randomUUID(),b)}),
    'POST /receipts/match':(i,b)=>requireService().match(i.userId,String(b.receiptId),b.transactionIds as string[]),
    'POST /receipts/:receiptId/consolidate':(i,b,p)=>requireService().consolidate(i.userId,p.receiptId,b.receiptIds as string[]),
    'POST /policies/extract':(i,b)=>requireService().policy(i.userId,String(b.purchaseId),b.evidenceIds as string[]),
    'POST /billing/compare':(i,b)=>requireService().billing(i.userId,String(b.purchaseId),b.evidenceIds as string[]),
    'POST /recovery/cases':(i,b)=>requireService().createCase(i.userId,String(b.opportunityId)),
    'POST /recovery/cases/:caseId/approve':(i,_b,p)=>requireService().approve(i.userId,p.caseId),
    'POST /refunds/reconcile':(i,b)=>requireService().reconcile(i.userId,String(b.caseId),b.depositIds as string[]),
    'POST /monitoring/prices/run':(i,b)=>requireService().queuePrices(i,b.purchaseIds as string[])
  };
  for(const route of registry.routes){
    if(route.prefix===false)continue;
    const handler=handlers[`${route.method} ${route.path}`];
    if(!handler)throw new Error(`Missing handler: ${route.path}`);
    app.route({...(route.path==='/documents'?{bodyLimit:6*1024*1024}:{}),method:route.method as 'GET'|'POST',url:`/api/v1${route.path}`,handler:async request=>{
      if(!request.identity)throw new ApiError('UNAUTHORIZED',401);
      const params=(request.params??{}) as Record<string,string>;
      for(const value of Object.values(params))uuid(value);
      let body:Record<string,unknown>={};
      if(route.requestSchema){const result=HttpSchemas[route.requestSchema].safeParse(request.body);if(!result.success)throw new ApiError('INVALID_REQUEST',400);body=result.data as Record<string,unknown>;}
      if(route.security==='admin/demo'&&!request.identity.roles.some(r=>['admin','demo'].includes(r)))throw new ApiError('FORBIDDEN',403);
      const query=z.object({cursor:z.uuid().optional()}).strict().safeParse(request.query);
      if(!query.success)throw new ApiError('INVALID_QUERY',400);
      return HttpSchemas[route.responseSchema].parse(await handler(request.identity,body,params,query.data.cursor));
    }});
  }
  app.post('/api/v1/internal/monitoring/prices/execute',async request=>{
    const parsed=z.object({jobId:z.uuid()}).strict().safeParse(request.body);
    if(!parsed.success)throw new ApiError('INVALID_REQUEST',400);
    const backend=requireService();
    return transaction(backend.pool,async client=>{
      const job=(await client.query('SELECT * FROM jobs WHERE id=$1 FOR UPDATE',[parsed.data.jobId])).rows[0];
      if(!job || job.job_type!=='PRICE_MONITOR' || !job.user_id)throw new ApiError('NOT_FOUND',404);
      if(request.headers['x-idempotency-key']!==job.idempotency_key)throw new ApiError('INVALID_JOB_KEY',409);
      const previous=(await client.query(`SELECT event_payload FROM events WHERE user_id=$1 AND idempotency_key=$2`,[job.user_id,`executed:${job.id}`])).rows[0];
      if(previous)return previous.event_payload;
      if(job.status!=='RUNNING')throw new ApiError('JOB_NOT_RUNNING',409);
      const input=z.object({purchaseIds:z.array(z.uuid()).min(1).max(100),trigger:z.enum(['MANUAL','SCHEDULED']).optional()}).strict().safeParse(job.payload);
      if(!input.success)throw new ApiError('INVALID_JOB_PAYLOAD',409);
      const result=await backend.executePrices(job.user_id,input.data.purchaseIds);
      await client.query(`INSERT INTO events(user_id,idempotency_key,entity_type,entity_id,event_type,event_payload) VALUES($1,$2,'JOB',$3,'PRICE_JOB_EXECUTED',$4)`,[job.user_id,`executed:${job.id}`,job.id,JSON.stringify(result)]);
      return result;
    });
  });
}
