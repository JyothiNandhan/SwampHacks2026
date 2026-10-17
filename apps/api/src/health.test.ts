import { test, expect, vi } from 'vitest';
import { ErrorSchema } from '@moneyback/contracts';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { NessieError } from './modules/banking/nessie-client.js';

const config = loadConfig({ NODE_ENV: 'test' });
test('health works without credentials; financial routes remain absent with canonical 404s', async () => {
  const app = buildApp({ config, logger: false });
  try {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'moneyback-api' });
    const missing = await app.inject('/api/v1/purchases?key=secret');
    expect(missing.statusCode).toBe(404);
    expect(ErrorSchema.parse(missing.json()).error.code).toBe('NOT_FOUND');
    expect(missing.body).not.toContain('secret');
    expect(app.database).toBeNull();
    expect(app.nessie).toBeNull();
  } finally { await app.close(); }
});
test('lazy database pool and banking client are available to future services and close cleanly', async () => {
  const app = buildApp({ config: loadConfig({ NODE_ENV: 'test', DATABASE_URL: 'postgres://unused:secret@127.0.0.1:1/test', NESSIE_API_KEY: 'fixture-key' }), logger: false });
  expect(app.database).not.toBeNull();
  expect(app.database?.totalCount).toBe(0);
  expect(app.nessie).not.toBeNull();
  const log = vi.spyOn(app.log, 'error');
  app.database?.emit('error', new Error('postgres://secret@host/private'));
  expect(JSON.stringify(log.mock.calls)).not.toContain('secret');
  const end = vi.spyOn(app.database!, 'end');
  await app.inject('/health');
  expect(app.database?.totalCount).toBe(0);
  await app.close();
  expect(end).toHaveBeenCalledTimes(1);
});
test('unexpected errors return safe canonical bodies and logs with server-owned request IDs', async () => {
  const app = buildApp({ config, logger: false });
  const log = vi.spyOn(app.log, 'error');
  app.get('/test-failure', () => { throw new Error('postgres://user:password@host/private-receipt'); });
  try {
    const response = await app.inject({ url: '/test-failure', headers: { 'x-request-id': 'attacker-id', authorization: 'Bearer secret' } });
    expect(response.statusCode).toBe(500);
    const body = ErrorSchema.parse(response.json());
    expect(body.error.code).toBe('INTERNAL_ERROR');
    expect(body.error.requestId).not.toBe('attacker-id');
    expect(response.body).not.toMatch(/password|receipt|Bearer|secret/);
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/password|receipt|Bearer|secret/);
  } finally { await app.close(); }
});
test.each([['NESSIE_TIMEOUT', 504], ['NESSIE_UNAUTHORIZED', 502]] as const)('upstream %s is mapped without exposing provider details', async (code, status) => {
  const app = buildApp({ config, logger: false });
  app.get('/test-provider', () => { throw new NessieError(code); });
  try {
    const response = await app.inject('/test-provider');
    expect(response.statusCode).toBe(status);
    expect(ErrorSchema.parse(response.json()).error.code).toBe(code);
  } finally { await app.close(); }
});
test('invalid JSON gets a canonical client error', async () => {
  const app = buildApp({ config, logger: false });
  app.post('/test-json', async request => request.body);
  try {
    const response = await app.inject({ method: 'POST', url: '/test-json', headers: { 'content-type': 'application/json' }, payload: '{secret' });
    expect(response.statusCode).toBe(400);
    expect(ErrorSchema.parse(response.json()).error.code).toBe('INVALID_REQUEST');
    expect(response.body).not.toContain('secret');
  } finally { await app.close(); }
});
