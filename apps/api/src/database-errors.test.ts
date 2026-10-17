import { expect, test, vi } from 'vitest';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { databaseFailureCode } from './database-errors.js';

test.each([
  ['SELF_SIGNED_CERT_IN_CHAIN','DATABASE_TLS_ERROR'], ['28P01','DATABASE_AUTHENTICATION_FAILED'],
  ['42P01','DATABASE_SCHEMA_UNAVAILABLE'], ['42501','DATABASE_PERMISSION_DENIED'], ['ECONNREFUSED','DATABASE_UNAVAILABLE']
])('driver error %s returns safe diagnostics', async (code, expected) => {
  const app=buildApp({config:loadConfig({NODE_ENV:'test'}),logger:false});
  const log=vi.spyOn(app.log,'error');
  app.get('/diagnostic-test',()=>{throw Object.assign(new Error('private-password receipt-value'),{code});});
  try{
    const result=await app.inject('/diagnostic-test');
    expect(result.statusCode).toBe(503);expect(result.json().error.code).toBe(expected);
    expect(result.body).not.toMatch(/private-password|receipt-value/);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-password|receipt-value/);
    expect((await app.inject('/health')).headers['x-api-revision']).toBe('database-diagnostics-v1');
  }finally{await app.close();}
});
test('unknown error content is not exposed as a database diagnostic',()=>{
  expect(databaseFailureCode({code:'secret-password'})).toBeNull();
  expect(databaseFailureCode(null)).toBeNull();
});
