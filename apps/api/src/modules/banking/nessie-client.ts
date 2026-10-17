import { z } from 'zod';

export type NessieErrorCode = 'NESSIE_UNAUTHORIZED' | 'NESSIE_NOT_FOUND' | 'NESSIE_RATE_LIMITED' |
  'NESSIE_UPSTREAM_ERROR' | 'NESSIE_TIMEOUT' | 'NESSIE_NETWORK_ERROR' | 'NESSIE_INVALID_RESPONSE';

/** Contains only safe metadata, never a credentialed URL, provider body or original error. */
export class NessieError extends Error {
  constructor(public readonly code: NessieErrorCode, public readonly upstreamStatus?: number) {
    super(code);
    this.name = 'NessieError';
  }
  get retryable(): boolean {
    return ['NESSIE_RATE_LIMITED', 'NESSIE_TIMEOUT', 'NESSIE_NETWORK_ERROR'].includes(this.code) ||
      (this.code === 'NESSIE_UPSTREAM_ERROR' && (this.upstreamStatus ?? 0) >= 500);
  }
}

export interface NessieClientOptions { baseUrl: string; apiKey: string; timeoutMs?: number }

/** GET transport only. T08 adapters supply provider schemas, then normalize to shared contracts. */
export class NessieClient {
  readonly #baseUrl: URL;
  readonly #apiKey: string;
  readonly #timeoutMs: number;
  readonly #fetch: typeof fetch;

  constructor(options: NessieClientOptions, fetchImpl: typeof fetch = fetch) {
    let url: URL;
    try { url = new URL(options.baseUrl); } catch { throw new Error('Invalid Nessie base URL'); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash ||
        (url.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
      throw new Error('Invalid Nessie base URL');
    }
    if (!options.apiKey.trim()) throw new Error('NESSIE_API_KEY is required');
    const timeout = options.timeoutMs ?? 10000;
    if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120000) throw new Error('Invalid Nessie timeout');
    this.#baseUrl = url;
    this.#apiKey = options.apiKey;
    this.#timeoutMs = timeout;
    this.#fetch = fetchImpl;
  }

  async get<T extends z.ZodType>(path: string, schema: T): Promise<z.output<T>> {
    // Prevent absolute URLs, queries, traversal and redirects from receiving the key.
    if (!/^\/(customers|accounts|purchases|merchants|bills|deposits)(\/[A-Za-z0-9_-]+)*$/.test(path)) {
      throw new Error('Invalid Nessie resource path');
    }
    const url = new URL(this.#baseUrl);
    url.pathname = this.#baseUrl.pathname.replace(/\/$/, '') + path;
    url.searchParams.set('key', this.#apiKey);
    const signal = AbortSignal.timeout(this.#timeoutMs);
    try {
      const response = await this.#fetch(url, { method: 'GET', headers: { accept: 'application/json' }, redirect: 'error', signal });
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        const code = response.status === 401 || response.status === 403 ? 'NESSIE_UNAUTHORIZED' :
          response.status === 404 ? 'NESSIE_NOT_FOUND' : response.status === 429 ? 'NESSIE_RATE_LIMITED' : 'NESSIE_UPSTREAM_ERROR';
        throw new NessieError(code, response.status);
      }
      let body: unknown;
      try { body = await response.json(); }
      catch { throw new NessieError(signal.aborted ? 'NESSIE_TIMEOUT' : 'NESSIE_INVALID_RESPONSE'); }
      const result = schema.safeParse(body);
      if (!result.success) throw new NessieError('NESSIE_INVALID_RESPONSE');
      return result.data;
    } catch (error) {
      if (error instanceof NessieError) throw error;
      throw new NessieError(signal.aborted ? 'NESSIE_TIMEOUT' : 'NESSIE_NETWORK_ERROR');
    }
  }
}
