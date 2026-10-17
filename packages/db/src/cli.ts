import pg from 'pg';
import { migrate } from './migrate.js';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
try {
  await client.connect();
  console.log('Applied migrations:', await migrate(client));
} catch {
  // Database errors may contain connection details or row values.
  console.error('Migration failed. Check database connectivity, permissions and migration checksums.');
  process.exitCode = 1;
} finally { await client.end(); }
