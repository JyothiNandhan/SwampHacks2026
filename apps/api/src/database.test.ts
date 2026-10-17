import { expect, test } from 'vitest';
import { createDatabasePool } from './database.js';

// Never use a developer's DATABASE_URL; CI supplies a disposable PostgreSQL service.
test.skipIf(!process.env.TEST_DATABASE_URL)('pool connects, releases clients and recovers from a SQL error', async () => {
  const pool = createDatabasePool(process.env.TEST_DATABASE_URL!);
  try {
    const client = await pool.connect();
    try {
      expect((await client.query<{ value: number }>('SELECT 1::int AS value')).rows[0].value).toBe(1);
    } finally { client.release(); }
    expect(pool.idleCount).toBe(1);
    await expect(pool.query('SELECT * FROM nonexistent_t04_test_table')).rejects.toThrow();
    expect((await pool.query<{ value: number }>('SELECT 2::int AS value')).rows[0].value).toBe(2);
  } finally { await pool.end(); }
  expect(pool.totalCount).toBe(0);
});
