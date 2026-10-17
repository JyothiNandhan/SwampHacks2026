import { Hono } from 'hono';
import {
  authenticatedRoomRequest,
  authWorkerFetch,
  RecordRoom,
  verifyJwt,
  workerErrorHandler
} from 'deepspace/worker';
import type { DOBindings, DOManifest, JwtVerifierConfig } from 'deepspace/worker';
import { schemas } from './src/schema.js';

export const __DO_MANIFEST__ = [
  { binding: 'RECORD_ROOMS', className: 'MoneyBackRecordRoom', sqlite: true }
] as const satisfies DOManifest;

export interface Env extends DOBindings<typeof __DO_MANIFEST__> {
  ASSETS: Fetcher;
  RECORD_ROOMS: DurableObjectNamespace;
  AUTH_JWT_PUBLIC_KEY: string;
  AUTH_JWT_ISSUER: string;
  AUTH_WORKER_URL: string;
  DEEPSPACE_APP_ID: string;
  OWNER_USER_ID: string;
}

export class MoneyBackRecordRoom extends RecordRoom<Env> {
  constructor(state: DurableObjectState, env: Env) {
    super(state, env, schemas, { ownerUserId: env.OWNER_USER_ID });
  }
}

const app = new Hono<{ Bindings: Env }>();
const jwtConfig = (env: Env): JwtVerifierConfig => ({ publicKey: env.AUTH_JWT_PUBLIC_KEY, issuer: env.AUTH_JWT_ISSUER });

app.get('/api/health', c => c.json({ status: 'ok', service: 'moneyback-deepspace', realtime: true }));

app.all('/api/auth/*', async c => {
  const url = new URL(c.req.url);
  const response = await authWorkerFetch(c.env, url.pathname + url.search, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.method === 'GET' || c.req.method === 'HEAD' ? undefined : c.req.raw.body
  });
  return new Response(response.body, { status: response.status, headers: response.headers });
});

app.get('/ws/:roomId', async c => {
  const token = new URL(c.req.url).searchParams.get('token');
  const auth = token ? (await verifyJwt(jwtConfig(c.env), token)).result : null;
  if (token && !auth) return c.text('Unauthorized', 401);
  const request = authenticatedRoomRequest(c.req.raw, auth);
  const namespace = c.env.RECORD_ROOMS;
  return namespace.get(namespace.idFromName(c.req.param('roomId'))).fetch(request);
});

app.all('*', c => c.env.ASSETS.fetch(c.req.raw));
app.onError(workerErrorHandler('error'));

export default app;
