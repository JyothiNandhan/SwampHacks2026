import { afterEach, expect, test, vi } from 'vitest';
import Fastify from 'fastify';
import { PGlite } from '@electric-sql/pglite';
import type pg from 'pg';
import { tigerDataMigrations } from '../../../../packages/db/src/index.js';
import { auth0Identity } from './auth0.js';
import { loadIntegrationConfig } from './config.js';
import { ApiError } from './security.js';
import { encryptMailboxSecret, decryptMailboxSecret, receiptPart, registerGmailRoutes } from './gmail.js';
import type { BackendService } from './service.js';

afterEach(()=>vi.unstubAllGlobals());
test('mailbox encryption detects tampering and cross-user token reuse',()=>{
  const key='ab'.repeat(32),secret='private-refresh-token';
  const value=encryptMailboxSecret(secret,key,'user-a');
  expect(value).not.toContain(secret);expect(decryptMailboxSecret(value,key,'user-a')).toBe(secret);
  expect(()=>decryptMailboxSecret(value,key,'user-b')).toThrow();
  expect(()=>decryptMailboxSecret(value+'x',key,'user-a')).toThrow();
});
test('receipt selection prefers PDF or readable email body over inline logos and bounds nesting',()=>{
  const plain={mimeType:'text/plain',body:{data:'cmVjZWlwdA',size:7}};
  const pdf={mimeType:'application/pdf',body:{attachmentId:'pdf',size:100}};
  const logo={mimeType:'image/png',body:{data:'aW1hZ2U',size:5}};
  expect(receiptPart({parts:[logo,plain]})?.source).toBe('EMAIL');
  expect(receiptPart({parts:[plain,pdf]})?.source).toBe('PDF');
  expect(receiptPart({mimeType:'application/pdf',body:{attachmentId:'large',size:4194305}})).toBeNull();
});
test('Auth0 provisioning isolates issuer/subject identities and never grants token admin roles',async()=>{
  const db=new PGlite();
  try{
    for(const migration of tigerDataMigrations)await db.exec(migration.sql);
    const query=async(sql:string,values?:unknown[])=>{if(!values){const rows=await db.exec(sql);return {rows:rows.at(-1)?.rows??[]};}return db.query(sql,values);};
    const client={query,release(){}};const pool={connect:async()=>client} as unknown as pg.Pool;
    const first=await auth0Identity(pool,{issuer:'https://a.auth0.com/',subject:'auth0|same'});
    expect(first.roles).toEqual(['user']);
    expect(await auth0Identity(pool,{issuer:'https://a.auth0.com/',subject:'auth0|same'})).toEqual(first);
    expect((await auth0Identity(pool,{issuer:'https://b.auth0.com/',subject:'auth0|same'})).userId).not.toBe(first.userId);
    expect((await db.query('SELECT * FROM users')).rows).toHaveLength(2);
  }finally{await db.close();}
},30000);

test('Gmail consent is user-bound, single-use, encrypted and imports the same message only once',async()=>{
  const db=new PGlite();const app=Fastify();
  try{
    for(const migration of tigerDataMigrations)await db.exec(migration.sql);
    const users=(await db.query<{id:string}>("INSERT INTO users(email) VALUES('one@test.invalid'),('two@test.invalid') RETURNING id")).rows;
    const config=loadIntegrationConfig({NODE_ENV:'test',GOOGLE_CLIENT_ID:'client',GOOGLE_CLIENT_SECRET:'secret',GMAIL_REDIRECT_URI:'https://moneyback.example/api/email/callback',EMAIL_TOKEN_ENCRYPTION_KEY:'ab'.repeat(32)});
    const upload=vi.fn().mockResolvedValue({data:{originalFileId:'c2425caa-d864-4196-bbb3-01d7c88b9cf3'}});
    const extract=vi.fn().mockResolvedValue({id:'249005e5-a22b-4995-a8bc-7f7e1e5ba7fd'});
    const service={pool:{query:(sql:string,values:unknown[])=>db.query(sql,values)},documents:{},upload,extract} as unknown as BackendService;
    app.decorateRequest('identity',null);
    app.addHook('onRequest',async request=>{request.identity={userId:request.headers['x-test-user']==='two'?users[1].id:users[0].id,roles:['user']};});
    app.setErrorHandler((error,_request,reply)=>reply.code(error instanceof ApiError?error.statusCode:500).send({error:{code:error instanceof ApiError?error.code:'INTERNAL'}}));
    registerGmailRoutes(app,config,service);
    const consent=(await app.inject({method:'POST',url:'/api/v1/email/gmail/connect'})).json();
    const auth=new URL(consent.data.authorizationUrl),state=auth.searchParams.get('state');
    expect(auth.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/gmail.readonly');
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
    const provider=vi.fn(async(url:string)=>{
      if(url.includes('oauth2.googleapis.com/token'))return Response.json({refresh_token:'private-refresh-token',access_token:'private-access-token',scope:'https://www.googleapis.com/auth/gmail.readonly'});
      if(url.includes('/messages?'))return Response.json({messages:[{id:'message1'}]});
      return Response.json({payload:{mimeType:'text/plain',body:{data:Buffer.from('Test receipt USD $1.00').toString('base64url'),size:22}}});
    });vi.stubGlobal('fetch',provider);
    const callback={method:'POST' as const,url:'/api/v1/email/gmail/callback',payload:{code:'code',state}};
    expect((await app.inject({...callback,headers:{'x-test-user':'two'}})).statusCode).toBe(400);
    expect((await app.inject(callback)).statusCode).toBe(200);
    expect((await app.inject(callback)).statusCode).toBe(400);
    const stored=JSON.stringify((await db.query('SELECT * FROM gmail_connections')).rows);expect(stored).not.toContain('private-refresh-token');
    expect((await app.inject({url:'/api/v1/email/gmail',headers:{'x-test-user':'two'}})).json().data.connected).toBe(false);
    expect((await app.inject({method:'POST',url:'/api/v1/email/gmail/import'})).json().data.imported).toBe(1);
    expect((await app.inject({method:'POST',url:'/api/v1/email/gmail/import'})).json().data.imported).toBe(0);
    expect(upload).toHaveBeenCalledTimes(1);expect(extract).toHaveBeenCalledTimes(1);
    expect((await app.inject({method:'DELETE',url:'/api/v1/email/gmail'})).statusCode).toBe(200);
    expect((await app.inject({url:'/api/v1/email/gmail'})).json().data.connected).toBe(false);
    expect((await db.query('SELECT * FROM gmail_receipt_imports')).rows).toHaveLength(1);
  }finally{await app.close();await db.close();}
},30000);
