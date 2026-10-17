import { randomUUID, createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type pg from 'pg';
import { DocumentUploadRequestSchema, DocumentMetadataSchema } from '@moneyback/contracts';
import { PrivateDocumentStore } from './documents.js';
import { transaction, uuid } from './database.js';
import { ApiError } from './security.js';

function validateContent(bytes:Buffer,mime:string) {
  if(!bytes.length||bytes.length>4194304)throw new ApiError('INVALID_DOCUMENT_SIZE',413);
  const signature=mime==='image/jpeg'?bytes.subarray(0,3).equals(Buffer.from([255,216,255])):
    mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
    mime==='image/webp'?bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP':
    mime==='application/pdf'?bytes.subarray(0,5).toString()==='%PDF-':true;
  if(!signature)throw new ApiError('CONTENT_TYPE_MISMATCH',415);
  if(mime.startsWith('text/')||mime==='application/json'){
    try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!text.trim())throw new Error();if(mime==='application/json')JSON.parse(text);}
    catch{throw new ApiError('INVALID_TEXT_DOCUMENT',400);}
  }
}
export async function uploadDocument(pool:pg.Pool,directory:string,userId:string,input:unknown){
  const parsed=DocumentUploadRequestSchema.safeParse(input);if(!parsed.success)throw new ApiError('INVALID_DOCUMENT',400);
  const {mimeType,contentBase64}=parsed.data;const bytes=Buffer.from(contentBase64,'base64');
  if(bytes.toString('base64')!==contentBase64)throw new ApiError('INVALID_BASE64',400);
  validateContent(bytes,mimeType);uuid(userId);
  const originalFileId=randomUUID();const evidenceId=randomUUID();
  const checksum=createHash('sha256').update(bytes).digest('hex');
  try{
    return await transaction(pool,async client=>{
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`document-upload:${userId}`]);
      const user=await client.query('SELECT id FROM users WHERE id=$1',[userId]);if(!user.rows.length)throw new ApiError('USER_NOT_PROVISIONED',409);
      const count=(await client.query("SELECT COUNT(*)::int count FROM evidence WHERE user_id=$1 AND source_type='USER' AND acquisition_method='PRIVATE_UPLOAD'",[userId])).rows[0].count;
      if(count>=100)throw new ApiError('DOCUMENT_QUOTA_REACHED',409);
      const path=join(resolve(directory),userId);await mkdir(path,{recursive:true,mode:0o700});
      await writeFile(join(path,`${originalFileId}.json`),JSON.stringify({mimeType,data:contentBase64}),{mode:0o600,flag:'wx'});
      await client.query(`INSERT INTO evidence(id,user_id,source_type,source_id,category,acquisition_method,checksum) VALUES($1,$2,'USER',$3,'ORIGINAL_DOCUMENT','PRIVATE_UPLOAD',$4)`,[evidenceId,userId,originalFileId,checksum]);
      return {data:DocumentMetadataSchema.parse({originalFileId,evidenceId,mimeType,byteLength:bytes.length,checksum})};
    });
  }catch(error){if(error&&typeof error==='object'&&'code'in error&&['EACCES','EROFS','EPERM','ENOSPC'].includes(String(error.code)))throw new ApiError('EVIDENCE_STORAGE_UNWRITABLE',503);throw error;}
}
export async function documentMetadata(pool:pg.Pool,directory:string,userId:string,originalFileId:string){
  uuid(userId);uuid(originalFileId);
  const evidence=(await pool.query("SELECT id,checksum FROM evidence WHERE user_id=$1 AND source_type='USER' AND source_id=$2",[userId,originalFileId])).rows[0];
  if(!evidence)throw new ApiError('NOT_FOUND',404);
  const original=await new PrivateDocumentStore(pool,directory).readOriginal(userId,originalFileId);if(!original)throw new ApiError('EVIDENCE_FILE_MISSING',409);
  const checksum=createHash('sha256').update(original.bytes).digest('hex');
  if(checksum!==evidence.checksum)throw new ApiError('EVIDENCE_CHECKSUM_MISMATCH',409);
  return {data:DocumentMetadataSchema.parse({originalFileId,evidenceId:evidence.id,mimeType:original.mimeType,byteLength:original.bytes.length,checksum})};
}
