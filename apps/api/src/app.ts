import Fastify from 'fastify';

/** Foundation only: financial routes are added behind authentication in later tasks. */
export function buildApp() {
  const app = Fastify({ logger: { redact: ['req.headers.authorization', 'req.headers.cookie'] } });
  app.get('/health', async () => ({ status: 'ok', service: 'moneyback-api' }));
  return app;
}
