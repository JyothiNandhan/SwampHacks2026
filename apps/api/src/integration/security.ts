import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

export class ApiError extends Error {
  constructor(readonly code: string, readonly statusCode: number) { super(code); }
}
export const credentialSchema = z.object({
  tokenHash: z.string().regex(/^[a-f0-9]{64}$/), userId: z.uuid(),
  roles: z.array(z.enum(['user', 'admin', 'demo'])).default(['user'])
}).strict();
export type Identity = { userId: string; roles: string[] };
export type Credential = z.output<typeof credentialSchema>;
export function tokenHash(token: string): string { return createHash('sha256').update(token).digest('hex'); }
export function equalSecret(left: string, right: string): boolean {
  return timingSafeEqual(Buffer.from(tokenHash(left), 'hex'), Buffer.from(tokenHash(right), 'hex'));
}
export function bearer(request: FastifyRequest): string {
  const match = /^Bearer ([A-Za-z0-9._~-]{32,512})$/.exec(request.headers.authorization ?? '');
  if (!match) throw new ApiError('UNAUTHORIZED', 401);
  return match[1];
}
export function authenticate(request: FastifyRequest, credentials: readonly Credential[]): Identity {
  const hash = tokenHash(bearer(request));
  const credential = credentials.find(entry => timingSafeEqual(Buffer.from(entry.tokenHash, 'hex'), Buffer.from(hash, 'hex')));
  if (!credential) throw new ApiError('UNAUTHORIZED', 401);
  return { userId: credential.userId, roles: credential.roles };
}
/** Bounded, per-process protection; replicas require a shared rate-limit gateway. */
export class RequestLimiter {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  consume(key: string, now = Date.now()): void {
    for (const [id, bucket] of this.buckets) if (bucket.resetAt <= now) this.buckets.delete(id);
    let bucket = this.buckets.get(key);
    if (!bucket) {
      if (this.buckets.size >= 10000) throw new ApiError('RATE_LIMITED', 429);
      bucket = { count: 0, resetAt: now + 60_000 }; this.buckets.set(key, bucket);
    }
    if (++bucket.count > 60) throw new ApiError('RATE_LIMITED', 429);
  }
}
