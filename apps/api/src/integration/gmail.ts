import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { IntegrationConfig } from './config.js';
import type { BackendService } from './service.js';
import { ApiError } from './security.js';

const scope = 'https://www.googleapis.com/auth/gmail.readonly';
const providerId = /^[A-Za-z0-9_-]{1,2048}$/;
const maxBytes = 4 * 1024 * 1024;
export function encryptMailboxSecret(value: string, key: string, userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
  cipher.setAAD(Buffer.from(`gmail:${userId}`));
  const ciphertext = Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),ciphertext].map(v=>v.toString('base64url')).join('.');
}
export function decryptMailboxSecret(value: string, key: string, userId: string) {
  try {
    const parts = value.split('.');
    if (parts.length !== 3) throw new Error();
    if (parts.some(part=>!/^[A-Za-z0-9_-]+$/.test(part)||Buffer.from(part,'base64url').toString('base64url')!==part)) throw new Error();
    const [iv,tag,ciphertext] = parts.map(v=>Buffer.from(v,'base64url'));
    if(iv.length!==12||tag.length!==16)throw new Error();
    const cipher = createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv);
    cipher.setAAD(Buffer.from(`gmail:${userId}`));cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(ciphertext),cipher.final()]).toString('utf8');
  } catch { throw new ApiError('GMAIL_RECONNECT_REQUIRED',409); }
}

export async function googleRequest(url: string, init: RequestInit = {}, send: typeof fetch = fetch): Promise<any> {
  let response: Response;
  try { response = await send(url,{...init,redirect:'error',signal:AbortSignal.timeout(15000)}); }
  catch { throw new ApiError('GMAIL_PROVIDER_UNAVAILABLE',502); }
  if (!response.ok) {
    await response.body?.cancel();
    throw new ApiError(response.status === 401 || response.status === 400 ? 'GMAIL_RECONNECT_REQUIRED' : 'GMAIL_PROVIDER_UNAVAILABLE',response.status === 401 || response.status === 400 ? 409 : 502);
  }
  const reader=response.body?.getReader();if(!reader)throw new ApiError('GMAIL_PROVIDER_UNAVAILABLE',502);
  const chunks:Uint8Array[]=[];let size=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>7*1024*1024){await reader.cancel();throw new ApiError('EMAIL_TOO_LARGE',413);}chunks.push(value);}
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch(error) {if(error instanceof ApiError)throw error;throw new ApiError('GMAIL_PROVIDER_UNAVAILABLE',502);}
  finally{reader.releaseLock();}
}

type GmailPart = { mimeType?:string;body?:{data?:string;attachmentId?:string;size?:number};parts?:GmailPart[] };
export function receiptPart(payload: GmailPart): {mimeType:string;source:'PDF'|'PHOTO'|'EMAIL';data?:string;attachmentId?:string} | null {
  const parts:GmailPart[]=[];
  function visit(part:GmailPart,depth:number){if(depth>12||parts.length>=100)return;parts.push(part);for(const child of part.parts??[])visit(child,depth+1);}
  visit(payload,0);
  // Prefer a receipt attachment over the email's surrounding promotional text.
  for(const mimeType of ['application/pdf','text/plain','text/html','image/jpeg','image/png','image/webp']){
    const part=parts.find(p=>p.mimeType===mimeType&&p.body&&((p.body.size??0)<=maxBytes)&&(p.body.data||p.body.attachmentId));
    if(part)return {mimeType,source:mimeType==='application/pdf'?'PDF':mimeType.startsWith('image/')?'PHOTO':'EMAIL',data:part.body?.data,attachmentId:part.body?.attachmentId};
  }
  return null;
}

export function registerGmailRoutes(app:FastifyInstance,config:IntegrationConfig,service:BackendService|null){
  const enabled=!!(config.GOOGLE_CLIENT_ID&&config.GOOGLE_CLIENT_SECRET&&config.GMAIL_REDIRECT_URI&&config.EMAIL_TOKEN_ENCRYPTION_KEY&&service?.documents);
  function ready(){if(!enabled||!service)throw new ApiError('GMAIL_NOT_CONFIGURED',503);return service;}
  function form(body:Record<string,string>){return {method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(body)};}
  async function token(body:Record<string,string>){
    return googleRequest('https://oauth2.googleapis.com/token',form({...body,client_id:config.GOOGLE_CLIENT_ID!,client_secret:config.GOOGLE_CLIENT_SECRET!}));
  }
  app.get('/api/v1/email/gmail',async request=>{
    const userId=request.identity!.userId;
    if(!enabled)return {data:{configured:false,connected:false,lastSyncAt:null}};
    const row=(await service!.pool.query('SELECT last_sync_at FROM gmail_connections WHERE user_id=$1',[userId])).rows[0];
    return {data:{configured:true,connected:!!row,lastSyncAt:row?.last_sync_at??null}};
  });
  app.post('/api/v1/email/gmail/connect',async request=>{
    const backend=ready(),userId=request.identity!.userId;
    const state=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');
    await backend.pool.query('DELETE FROM gmail_oauth_states WHERE expires_at<NOW() OR user_id=$1',[userId]);
    await backend.pool.query("INSERT INTO gmail_oauth_states(state_hash,user_id,verifier_ciphertext,expires_at) VALUES($1,$2,$3,NOW()+INTERVAL '10 minutes')",[createHash('sha256').update(state).digest('hex'),userId,encryptMailboxSecret(verifier,config.EMAIL_TOKEN_ENCRYPTION_KEY!,userId)]);
    const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.search=new URLSearchParams({client_id:config.GOOGLE_CLIENT_ID!,redirect_uri:config.GMAIL_REDIRECT_URI!,response_type:'code',scope,access_type:'offline',prompt:'consent',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
    return {data:{authorizationUrl:url.toString()}};
  });
  app.post('/api/v1/email/gmail/callback',async request=>{
    const backend=ready(),userId=request.identity!.userId;
    const parsed=z.object({code:z.string().min(1).max(4096),state:z.string().regex(/^[A-Za-z0-9_-]{43}$/)}).strict().safeParse(request.body);
    if(!parsed.success)throw new ApiError('INVALID_REQUEST',400);
    const {code,state}=parsed.data;
    const row=(await backend.pool.query('DELETE FROM gmail_oauth_states WHERE state_hash=$1 AND user_id=$2 AND expires_at>NOW() RETURNING verifier_ciphertext',[createHash('sha256').update(state).digest('hex'),userId])).rows[0];
    if(!row)throw new ApiError('INVALID_OAUTH_STATE',400);
    const result=await token({grant_type:'authorization_code',code,redirect_uri:config.GMAIL_REDIRECT_URI!,code_verifier:decryptMailboxSecret(row.verifier_ciphertext,config.EMAIL_TOKEN_ENCRYPTION_KEY!,userId)});
    if(typeof result.refresh_token!=='string'||!result.refresh_token.length||result.refresh_token.length>8192||typeof result.scope!=='string'||!result.scope.split(' ').includes(scope))throw new ApiError('GMAIL_CONSENT_REQUIRED',409);
    await backend.pool.query('INSERT INTO gmail_connections(user_id,refresh_token_ciphertext) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET refresh_token_ciphertext=EXCLUDED.refresh_token_ciphertext,connected_at=NOW()',[userId,encryptMailboxSecret(result.refresh_token,config.EMAIL_TOKEN_ENCRYPTION_KEY!,userId)]);
    return {data:{connected:true}};
  });
  app.delete('/api/v1/email/gmail',async request=>{
    const backend=ready(),userId=request.identity!.userId;
    const row=(await backend.pool.query('DELETE FROM gmail_connections WHERE user_id=$1 RETURNING refresh_token_ciphertext',[userId])).rows[0];
    await backend.pool.query('DELETE FROM gmail_oauth_states WHERE user_id=$1',[userId]);
    if(row){try{await fetch('https://oauth2.googleapis.com/revoke', {...form({token:decryptMailboxSecret(row.refresh_token_ciphertext,config.EMAIL_TOKEN_ENCRYPTION_KEY!,userId)}),redirect:'error',signal:AbortSignal.timeout(5000)});}catch{/* Local access is removed even when Google is unavailable. */}}
    return {data:{connected:false}};
  });
  app.post('/api/v1/email/gmail/import',async request=>{
    const backend=ready(),userId=request.identity!.userId;
    const connection=(await backend.pool.query('SELECT refresh_token_ciphertext FROM gmail_connections WHERE user_id=$1',[userId])).rows[0];
    if(!connection)throw new ApiError('GMAIL_NOT_CONNECTED',409);
    const result=await token({grant_type:'refresh_token',refresh_token:decryptMailboxSecret(connection.refresh_token_ciphertext,config.EMAIL_TOKEN_ENCRYPTION_KEY!,userId)});
    if(typeof result.access_token!=='string'||result.access_token.length>8192)throw new ApiError('GMAIL_RECONNECT_REQUIRED',409);
    const headers={authorization:`Bearer ${result.access_token}`};
    const base='https://gmail.googleapis.com/gmail/v1/users/me';
    const query=new URLSearchParams({maxResults:'20',q:'newer_than:30d (subject:receipt OR subject:invoice OR subject:"order confirmation")'});
    const listed=await googleRequest(`${base}/messages?${query}`,{headers});
    if(listed.messages!==undefined&&!Array.isArray(listed.messages))throw new ApiError('GMAIL_PROVIDER_UNAVAILABLE',502);
    for(const message of (listed.messages??[]).slice(0,20)){
      if(typeof message.id!=='string'||!providerId.test(message.id))continue;
      const claim=(await backend.pool.query(`INSERT INTO gmail_receipt_imports(user_id,message_id,status) VALUES($1,$2,'RUNNING') ON CONFLICT(user_id,message_id) DO UPDATE SET status='RUNNING',updated_at=NOW(),error_code=NULL WHERE (gmail_receipt_imports.status='FAILED' AND gmail_receipt_imports.error_code NOT IN ('EMAIL_HAS_NO_RECEIPT','INVALID_EMAIL_ATTACHMENT','EMAIL_TOO_LARGE') AND gmail_receipt_imports.updated_at<NOW()-INTERVAL '5 minutes') OR (gmail_receipt_imports.status='RUNNING' AND gmail_receipt_imports.updated_at<NOW()-INTERVAL '10 minutes') RETURNING original_file_id,receipt_id`,[userId,message.id])).rows[0];
      if(!claim)continue;
      try{
        const saved=(await backend.pool.query('SELECT id FROM receipts WHERE user_id=$1 AND id=$2',[userId,claim.receipt_id])).rows[0];
        if(saved){
          await backend.pool.query("UPDATE gmail_receipt_imports SET status='IMPORTED',updated_at=NOW() WHERE user_id=$1 AND message_id=$2",[userId,message.id]);
          return {data:{imported:0,failed:0,hasMore:true}};
        }
        let originalFileId=claim.original_file_id as string|null,source:'PDF'|'PHOTO'|'EMAIL';
        const full=await googleRequest(`${base}/messages/${encodeURIComponent(message.id)}?format=full`,{headers});
        const part=receiptPart(full.payload??{});if(!part)throw new ApiError('EMAIL_HAS_NO_RECEIPT',422);source=part.source;
        if(!originalFileId){
          let data=part.data;
          if(!data&&part.attachmentId&&providerId.test(part.attachmentId))data=(await googleRequest(`${base}/messages/${encodeURIComponent(message.id)}/attachments/${encodeURIComponent(part.attachmentId)}`,{headers})).data;
          if(typeof data!=='string'||data.length>5592408||!/^[A-Za-z0-9_-]*={0,2}$/.test(data))throw new ApiError('INVALID_EMAIL_ATTACHMENT',422);
          const bytes=Buffer.from(data,'base64url');if(!bytes.length||bytes.length>maxBytes)throw new ApiError('EMAIL_TOO_LARGE',413);
          const stillConnected=(await backend.pool.query('SELECT user_id FROM gmail_connections WHERE user_id=$1',[userId])).rows.length;
          if(!stillConnected)throw new ApiError('GMAIL_NOT_CONNECTED',409);
          const uploaded=await backend.upload(userId,{mimeType:part.mimeType,contentBase64:bytes.toString('base64')});
          originalFileId=uploaded.data.originalFileId;
          await backend.pool.query('UPDATE gmail_receipt_imports SET original_file_id=$3 WHERE user_id=$1 AND message_id=$2',[userId,message.id,originalFileId]);
        }
        const receipt=await backend.extract(userId,claim.receipt_id,{source,originalFileId});
        await backend.pool.query("UPDATE gmail_receipt_imports SET status='IMPORTED',receipt_id=$3,updated_at=NOW() WHERE user_id=$1 AND message_id=$2",[userId,message.id,receipt.id]);
        await backend.pool.query('UPDATE gmail_connections SET last_sync_at=NOW() WHERE user_id=$1',[userId]);
        return {data:{imported:1,failed:0,hasMore:true}};
      }catch(error){
        const code=error instanceof Error && 'code' in error && typeof error.code==='string' && /^[A-Z_]{1,80}$/.test(error.code)?error.code:'EMAIL_IMPORT_FAILED';
        await backend.pool.query("UPDATE gmail_receipt_imports SET status='FAILED',error_code=$3,updated_at=NOW() WHERE user_id=$1 AND message_id=$2",[userId,message.id,code]);
        return {data:{imported:0,failed:1,hasMore:false,errorCode:code}};
      }
    }
    await backend.pool.query('UPDATE gmail_connections SET last_sync_at=NOW() WHERE user_id=$1',[userId]);
    return {data:{imported:0,failed:0,hasMore:false}};
  });
}
