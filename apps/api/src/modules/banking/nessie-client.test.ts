import { afterEach, expect, test, vi } from 'vitest';
import { z } from 'zod';
import { NessieClient, NessieError } from './nessie-client.js';

const rows = z.array(z.object({ _id: z.string(), amount: z.number() }).strict());
const fixture = [{ _id: 'purchase-1', amount: 300 }]; // Provider dollars; T08 normalizes cents.
function setup(response: Response = Response.json(fixture)) {
  const request = vi.fn<typeof fetch>().mockResolvedValue(response);
  return { request, client: new NessieClient({ baseUrl: 'https://nessie.example/v1/', apiKey: 'fixture-secret' }, request) };
}
afterEach(() => { vi.useRealTimers(); });

test('GET preserves base prefix, encodes the key, validates JSON and returns provider data', async () => {
  const { client, request } = setup();
  expect(await client.get('/accounts/account-1/purchases', rows)).toEqual(fixture);
  const [url, options] = request.mock.calls[0];
  expect((url as URL).pathname).toBe('/v1/accounts/account-1/purchases');
  expect((url as URL).searchParams.get('key')).toBe('fixture-secret');
  expect(options).toMatchObject({ method: 'GET', redirect: 'error', headers: { accept: 'application/json' } });
  expect(options?.signal).toBeInstanceOf(AbortSignal);
});
test.each(['/customers', '/accounts', '/merchants', '/accounts/a/bills', '/accounts/a/deposits'])('supports read resource %s', async path => {
  const { client } = setup(Response.json([]));
  expect(await client.get(path, rows)).toEqual([]);
});
test.each([
  [401, 'NESSIE_UNAUTHORIZED', false], [403, 'NESSIE_UNAUTHORIZED', false], [404, 'NESSIE_NOT_FOUND', false],
  [429, 'NESSIE_RATE_LIMITED', true], [400, 'NESSIE_UPSTREAM_ERROR', false], [503, 'NESSIE_UPSTREAM_ERROR', true],
  [302, 'NESSIE_UPSTREAM_ERROR', false]
])('maps HTTP %i to a sanitized error', async (status, code, retryable) => {
  const { client } = setup(new Response('fixture-secret and personal data', { status: Number(status) }));
  await expect(client.get('/accounts', rows)).rejects.toMatchObject({ code, upstreamStatus: status, retryable });
});
test('network errors drop the original URL, body, stack and key', async () => {
  const { client, request } = setup();
  request.mockRejectedValue(new Error('GET https://nessie.example/accounts?key=fixture-secret personal receipt'));
  try { await client.get('/accounts', rows); throw new Error('Expected failure'); }
  catch (error) {
    expect(error).toBeInstanceOf(NessieError);
    expect(error).toMatchObject({ code: 'NESSIE_NETWORK_ERROR', retryable: true });
    expect(String(error)).not.toMatch(/fixture-secret|personal|https:/);
    expect((error as Error).cause).toBeUndefined();
  }
});
test.each(['not JSON', '{}', '[{"_id":"x","amount":"300"}]'])('rejects malformed or incompatible provider data: %s', async body => {
  const { client } = setup(new Response(body));
  await expect(client.get('/purchases', rows)).rejects.toMatchObject({ code: 'NESSIE_INVALID_RESPONSE' });
});
test.each(['https://evil.example/accounts', '//evil.example/accounts', '/accounts/../merchants',
  '/accounts?key=override', '/accounts/a%2Fb', '/accounts/a#x', '/accounts/a\\b', '/accounts/a/purchases/../../x'])('rejects unsafe path %s before fetching', async path => {
  const { client, request } = setup();
  await expect(client.get(path, rows)).rejects.toThrow('Invalid Nessie resource path');
  expect(request).not.toHaveBeenCalled();
});
test('timeout aborts an outstanding fetch and sanitizes the error', async () => {
  const request = vi.fn<typeof fetch>().mockImplementation((_url, options) => new Promise((_resolve, reject) => {
    options?.signal?.addEventListener('abort', () => reject(new Error('fixture-secret')), { once: true });
  }));
  const client = new NessieClient({ baseUrl: 'https://nessie.example', apiKey: 'fixture-secret', timeoutMs: 5 }, request);
  await expect(client.get('/accounts', rows)).rejects.toMatchObject({ code: 'NESSIE_TIMEOUT', retryable: true });
});
test('deadline covers body reading as well as connection establishment', async () => {
  const request = vi.fn<typeof fetch>().mockImplementation(async (_url, options) => {
    const stream = new ReadableStream({
      start(controller) { options?.signal?.addEventListener('abort', () => controller.error(new Error('secret')), { once: true }); }
    });
    return new Response(stream);
  });
  const client = new NessieClient({ baseUrl: 'https://nessie.example', apiKey: 'fixture-secret', timeoutMs: 5 }, request);
  await expect(client.get('/accounts', rows)).rejects.toMatchObject({ code: 'NESSIE_TIMEOUT' });
});
test('constructor rejects unsafe URLs, missing keys and invalid deadlines', () => {
  for (const baseUrl of ['bad-url', 'file:///x', 'http://example.com', 'https://user:secret@example.com', 'https://example.com/?key=secret']) {
    expect(() => new NessieClient({ baseUrl, apiKey: 'test' })).toThrow('Invalid Nessie base URL');
  }
  expect(() => new NessieClient({ baseUrl: 'https://example.com', apiKey: ' ' })).toThrow('NESSIE_API_KEY');
  expect(() => new NessieClient({ baseUrl: 'https://example.com', apiKey: 'test', timeoutMs: 0 })).toThrow('Invalid Nessie timeout');
});
