/** Disposable CI database only. This does not read the production DATABASE_URL. */
import pg from 'pg';
import assert from 'node:assert/strict';
import { migrate } from './migrate.js';

if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL is required');
const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL });
try {
  await client.connect();
  assert.deepEqual(await migrate(client), ['001_init_tiger_data']);
  assert.deepEqual(await migrate(client), []);
  const { rows } = await client.query('SELECT COUNT(*)::int AS count FROM schema_migrations');
  assert.equal(rows[0].count, 1);
  console.log('PostgreSQL driver migration and replay check passed');
} finally { await client.end(); }
