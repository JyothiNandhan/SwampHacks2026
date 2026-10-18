import { afterEach, expect, test, vi } from 'vitest';
import { jsonRequest } from './client-request';

afterEach(() => vi.unstubAllGlobals());

test('returns valid JSON and applies the JSON content type only when a body exists', async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(jsonRequest('/api/example')).resolves.toEqual({ data: [] });
    await jsonRequest('/api/example', { method: 'POST', body: '{}' });
    expect(fetch.mock.calls[0]![1].headers).toEqual({});
    expect(fetch.mock.calls[1]![1].headers).toEqual({ 'content-type': 'application/json' });
});

test('preserves bounded first-party errors and sanitizes malformed or oversized responses', async () => {
    const fetch = vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Reconnect your account.' } }), { status: 401 }))
        .mockResolvedValueOnce(new Response('<html>gateway failure</html>', { status: 502 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'x'.repeat(241) } }), { status: 500 }));
    vi.stubGlobal('fetch', fetch);
    await expect(jsonRequest('/api/example')).rejects.toThrow('Reconnect your account.');
    await expect(jsonRequest('/api/example')).rejects.toThrow('The service could not be reached.');
    await expect(jsonRequest('/api/example')).rejects.toThrow('The service could not be reached.');
});

test('sanitizes network failures and non-JSON success responses', async () => {
    const fetch = vi.fn()
        .mockRejectedValueOnce(new Error('private network details'))
        .mockResolvedValueOnce(new Response('not json', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await expect(jsonRequest('/api/example')).rejects.toThrow('The service could not be reached.');
    await expect(jsonRequest('/api/example')).rejects.toThrow('The service could not be reached.');
});
