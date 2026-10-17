import { randomUUID } from 'node:crypto';
import { databaseFailureCode } from './database-errors.js';
import { BackendService } from './integration/service.js';
import { registerBackendRoutes } from './integration/routes.js';
import { loadIntegrationConfig } from './integration/config.js';
import { ApiError } from './integration/security.js';
import { ExtractionError } from './modules/documents/extractor.js';
import Fastify, { LogController } from 'fastify';
import type pg from 'pg';
import { ErrorSchema, HealthSchema } from '@moneyback/contracts';
import { loadConfig, type AppConfig } from './config.js';
import { createDatabasePool } from './database.js';
import { NessieClient, NessieError } from './modules/banking/nessie-client.js';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
    database: pg.Pool | null;
    nessie: NessieClient | null;
  }
}

export function buildApp(options: { config?: AppConfig; logger?: boolean; service?: BackendService; database?: pg.Pool } = {}) {
  const config = options.config ?? loadConfig();
  const instanceId = randomUUID();
  const app = Fastify({
    // Omit URL, headers and bodies entirely: Nessie keys and document data can occur in them.
    logger: options.logger === false ? false : {
      serializers: { req: request => ({ method: request.method }), err: () => ({ type: 'Error', message: 'Request failed', stack: '' }) }
    },
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
    requestTimeout: 30000,
    bodyLimit: 1024 * 1024
  });
  const database = options.database ?? (config.databaseUrl ? createDatabasePool(config.databaseUrl) : null);
  const nessie = config.nessie.apiKey ? new NessieClient({ baseUrl: config.nessie.baseUrl, apiKey: config.nessie.apiKey }) : null;
  app.decorate('config', config);
  app.decorate('database', database);
  app.decorate('nessie', nessie);
  database?.on('error', () => { app.log.error({ code: 'DATABASE_POOL_ERROR' }, 'Database pool error'); });
  app.addHook('onClose', async () => { await database?.end(); });

  app.setErrorHandler((error, request, reply) => {
    if(error instanceof ApiError || error instanceof ExtractionError) return reply.code(error.statusCode).send(ErrorSchema.parse({error:{code:error.code,message:error.code,requestId:request.id}}));
    const databaseCode = databaseFailureCode(error);
    if (databaseCode) {
      app.log.error({ code: databaseCode, requestId: request.id }, 'Database request failed');
      return reply.code(503).send(ErrorSchema.parse({ error: { code: databaseCode, message: 'Database unavailable; check deployment configuration', requestId: request.id } }));
    }
    const upstream = error instanceof NessieError;
    const reportedStatus = error instanceof Error && 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
    const status = upstream ? (error.code === 'NESSIE_TIMEOUT' ? 504 : 502) :
      (Number.isInteger(reportedStatus) && reportedStatus >= 400 && reportedStatus < 500 ? reportedStatus : 500);
    const code = upstream ? error.code : status === 500 ? 'INTERNAL_ERROR' :
      status === 413 ? 'PAYLOAD_TOO_LARGE' : 'INVALID_REQUEST';
    if (status >= 500) app.log.error({ code, requestId: request.id }, 'Request failed');
    return reply.code(status).send(ErrorSchema.parse({ error: {
      code, message: upstream ? 'Banking provider request failed' : status === 500 ? 'Internal server error' : 'Invalid request',
      requestId: request.id
    } }));
  });
  app.setNotFoundHandler((request, reply) => reply.code(404).send(ErrorSchema.parse({ error: {
    code: 'NOT_FOUND', message: 'Route not found', requestId: request.id
  } })));
  // Liveness only: no credentials, database query, or Nessie call required.
  app.get('/health', async (_request, reply) => {
    reply.header('x-api-revision', 'document-upload-v1');
    reply.header('x-api-instance', instanceId);
    const commit = process.env.RAILWAY_GIT_COMMIT_SHA;
    if (commit && /^[a-f0-9]{40}$/.test(commit)) reply.header('x-deployment-commit', commit);
    return HealthSchema.parse({ status: 'ok', service: 'moneyback-api' });
  });
  const integration = config.integration ?? loadIntegrationConfig({ NODE_ENV: config.nodeEnv });
  registerBackendRoutes(app,integration,options.service ?? (database ? new BackendService(database,integration,nessie) : null));
  return app;
}
