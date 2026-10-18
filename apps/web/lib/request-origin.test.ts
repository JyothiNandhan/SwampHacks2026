import { afterEach, expect, test, vi } from 'vitest';
import { sameOrigin } from './request-origin';

afterEach(() => vi.unstubAllEnvs());

test('accepts the public HTTPS origin behind Railway HTTP forwarding', () => {
  vi.stubEnv('NODE_ENV', 'production');
  const request = new Request('http://127.0.0.1:3000/api/session', {
    headers: { host: 'moneyback.example', origin: 'https://moneyback.example' }
  });
  expect(sameOrigin(request)).toBe(true);
});

test('rejects foreign, missing and insecure production origins', () => {
  vi.stubEnv('NODE_ENV', 'production');
  for (const origin of ['https://attacker.example', 'http://moneyback.example', null]) {
    const headers = new Headers({ host: 'moneyback.example' });
    if (origin) headers.set('origin', origin);
    expect(sameOrigin(new Request('http://127.0.0.1:3000/api/session', { headers }))).toBe(false);
  }
});

test('preserves same-origin HTTP access during local development', () => {
  vi.stubEnv('NODE_ENV', 'development');
  const request = new Request('http://127.0.0.1:3000/api/session', {
    headers: { host: '127.0.0.1:3000', origin: 'http://127.0.0.1:3000' }
  });
  expect(sameOrigin(request)).toBe(true);
});

test('uses the public host port and rejects malformed host values', () => {
  vi.stubEnv('NODE_ENV', 'production');
  expect(sameOrigin(new Request('http://127.0.0.1:3000/api/session', {
    headers: { host: 'moneyback.example:8443', origin: 'https://moneyback.example:8443' }
  }))).toBe(true);
  expect(sameOrigin(new Request('http://127.0.0.1:3000/api/session', {
    headers: { host: 'moneyback.example/other', origin: 'https://moneyback.example' }
  }))).toBe(false);
});
