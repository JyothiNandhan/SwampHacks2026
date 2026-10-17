import { expect, test } from 'vitest';
import { loadConfig } from './config.js';

test('development can start health-only without provider credentials', () => {
  expect(loadConfig({})).toMatchObject({ nodeEnv: 'development', port: 3001, databaseUrl: undefined,
    nessie: { baseUrl: 'https://prod-api.nessieisreal.com', apiKey: undefined, accountId: undefined } });
  expect(loadConfig({ DATABASE_URL: '', NESSIE_API_KEY: '' }).databaseUrl).toBeUndefined();
});
test('production requires database and Nessie credentials and returns typed values', () => {
  expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('DATABASE_URL, NESSIE_API_KEY');
  expect(loadConfig({ NODE_ENV: 'production', PORT: '8080', DATABASE_URL: 'postgresql://user:secret@localhost/db',
    NESSIE_API_KEY: 'test-key', NESSIE_ACCOUNT_ID: 'account-1', API_TOKENS_JSON: JSON.stringify([{tokenHash:'a'.repeat(64),userId:'11111111-1111-4111-8111-111111111111',roles:['user']}]), INTERNAL_WORKER_TOKEN:'w'.repeat(32) })).toMatchObject({ nodeEnv: 'production', port: 8080 });
});
test.each(['', '0', '-1', '65536', 'NaN', '3001.5', '1e3', ' 3001'])('rejects invalid port %s', PORT => {
  expect(() => loadConfig({ PORT })).toThrow('PORT');
});
test.each([
  { NODE_ENV: 'prod' }, { DATABASE_URL: 'https://example.com/db' },
  { NESSIE_BASE_URL: 'https://secret@example.com' }, { NESSIE_BASE_URL: 'https://example.com/?key=secret' },
  { NESSIE_BASE_URL: 'https://example.com/#secret' }, { NESSIE_BASE_URL: 'http://example.com' },
  { NESSIE_BASE_URL: 'file:///etc/passwd' }, { NESSIE_API_KEY: ' ' }
])('invalid configuration reports field names without values', env => {
  let message = '';
  try { loadConfig(env); } catch (error) { message = (error as Error).message; }
  expect(message).toContain('Invalid environment configuration');
  expect(message).not.toMatch(/secret|example\.com|passwd/);
});
