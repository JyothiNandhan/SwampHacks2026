import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type pg from 'pg';
import type { FastifyRequest } from 'fastify';
import { ApiError, type Identity } from './security.js';
import { transaction } from './database.js';

export function createAuth0Verifier(issuer: string, audience: string, keys?: JWTVerifyGetKey) {
  const normalized = new URL(issuer).origin + '/';
  const jwks = keys ?? createRemoteJWKSet(new URL('.well-known/jwks.json',normalized), {timeoutDuration:5000,cooldownDuration:30000});
  return async (token: string) => {
    try {
      const {payload} = await jwtVerify(token,jwks,{issuer:normalized,audience,algorithms:['RS256'],requiredClaims:['sub','iat','exp']});
      if (typeof payload.sub !== 'string' || !payload.sub.length || payload.sub.length > 512) throw new Error();
      return {issuer:normalized,subject:payload.sub};
    } catch { throw new ApiError('UNAUTHORIZED',401); }
  };
}

export async function auth0Identity(pool: pg.Pool, claims: {issuer:string;subject:string}): Promise<Identity> {
  return transaction(pool,async client => {
    const key = createHash('sha256').update(JSON.stringify([claims.issuer,claims.subject])).digest('hex');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`auth0:${key}`]);
    const existing = (await client.query('SELECT user_id FROM user_identities WHERE issuer=$1 AND subject=$2',[claims.issuer,claims.subject])).rows[0];
    if (existing) return {userId:existing.user_id,roles:['user']};
    // Never link accounts by an untrusted/matching email claim or accept token role claims.
    const user = (await client.query('INSERT INTO users(email) VALUES($1) RETURNING id',[`${key}@auth0.invalid`])).rows[0];
    await client.query('INSERT INTO user_identities(issuer,subject,user_id) VALUES($1,$2,$3)',[claims.issuer,claims.subject,user.id]);
    return {userId:user.id,roles:['user']};
  });
}

export function auth0Bearer(request: FastifyRequest) {
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(request.headers.authorization ?? '');
  if (!match || match[1].length > 8192) throw new ApiError('UNAUTHORIZED',401);
  return match[1];
}
