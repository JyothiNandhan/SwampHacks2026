import { expect, test } from 'vitest';
import { loadConfig } from './config.js';
import { ConfigurationError, startupFailureMessage } from './configuration-error.js';

test('startup identifies invalid setting names without leaking their secret values', () => {
  try { loadConfig({ NODE_ENV: 'production', DATABASE_URL: 'secret-invalid-url' }); }
  catch (error) {
    const message = startupFailureMessage(error);
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('NESSIE_API_KEY');
    expect(message).not.toContain('secret-invalid-url');
    return;
  }
  throw new Error('Expected invalid configuration');
});
test('arbitrary exceptions and untrusted field text remain private', () => {
  expect(startupFailureMessage(new Error('private connection string'))).not.toContain('private');
  expect(startupFailureMessage(new ConfigurationError('integration', ['API_TOKENS_JSON.0.tokenHash', 'secret-value']))).toBe('API startup failed. Invalid integration configuration: API_TOKENS_JSON');
});
