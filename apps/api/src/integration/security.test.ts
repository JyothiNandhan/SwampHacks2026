import { expect, test } from 'vitest';
import { buildApp } from '../app.js';
import { loadConfig } from '../config.js';
import { loadIntegrationConfig } from './config.js';
import { tokenHash, RequestLimiter } from './security.js';
const userId='11111111-1111-4111-8111-111111111111';const token='u'.repeat(48);const worker='w'.repeat(48);
const env={NODE_ENV:'test',INTERNAL_WORKER_TOKEN:worker,API_TOKENS_JSON:JSON.stringify([{tokenHash:tokenHash(token),userId,roles:['user']}])};
test('financial routes and documentation fail closed; worker credentials cannot act as a user',async()=>{
  const app=buildApp({config:loadConfig(env),logger:false});try{
    expect((await app.inject('/health')).statusCode).toBe(200);
    for(const url of ['/api/v1/purchases','/api/v1/email/gmail','/docs','/openapi.json']){
      expect((await app.inject(url)).statusCode).toBe(401);
      expect((await app.inject({url,headers:{authorization:`Bearer ${worker}`}})).statusCode).toBe(401);
    }
    const headers={authorization:`Bearer ${token}`};
    expect((await app.inject({url:'/api/v1/purchases',headers})).statusCode).toBe(503);
    const spec=await app.inject({url:'/openapi.json',headers});expect(spec.statusCode).toBe(200);
    expect(Object.keys(spec.json().paths)).toHaveLength(24);
    expect(spec.json().paths['/api/v1/email/gmail/import'].post.security).toEqual([{bearerAuth:[]}]);
    expect((await app.inject({url:'/api/v1/email/gmail',headers})).json().data).toMatchObject({configured:false,connected:false});
    expect(spec.headers['cache-control']).toBe('no-store');
    expect((await app.inject({method:'POST',url:'/api/v1/monitoring/prices/run',headers,payload:{purchaseIds:[userId]}})).statusCode).toBe(403);
    expect((await app.inject({url:'/api/v1/offers/not-uuid',headers})).statusCode).toBe(400);
  }finally{await app.close();}
});
test('rejects missing/invalid integration settings without leaking credentials',()=>{
  for(const value of [{API_TOKENS_JSON:'private-secret'},{API_TOKENS_JSON:'[{"tokenHash":"secret"}]'},{INTERNAL_WORKER_TOKEN:'short'},{GEMINI_API_KEY:'secret'}]){
    expect(()=>loadIntegrationConfig(value)).toThrow();try{loadIntegrationConfig(value);}catch(error){expect(String(error)).not.toContain('private-secret');}
  }
  expect(()=>loadIntegrationConfig({NODE_ENV:'production'})).toThrow('API_TOKENS_JSON');
  expect(()=>loadIntegrationConfig({...env,NODE_ENV:'production',PRICE_MONITOR_MODE:'REPLAY'})).toThrow('PRICE_MONITOR_MODE');
});
test('rate limiter enforces a window and recovers after expiry',()=>{
  const limiter=new RequestLimiter();for(let n=0;n<60;n++)limiter.consume('user',0);
  expect(()=>limiter.consume('user',1)).toThrow('RATE_LIMITED');expect(()=>limiter.consume('user',60001)).not.toThrow();
});
