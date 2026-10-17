import { test, expect } from 'vitest';
import { buildApp } from './app.js';

test('health responds without external credentials and financial routes remain absent', async () => {
  const app = buildApp();
  try {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', service: 'moneyback-api' });
    expect((await app.inject('/api/v1/purchases')).statusCode).toBe(404);
  } finally { await app.close(); }
});
