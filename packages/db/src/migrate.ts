import { createHash } from 'node:crypto';
import { tigerDataMigrations } from './index.js';

export interface MigrationClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

/** Serialize concurrent deploys; commit schema and ledger together or roll both back. */
export async function migrate(client: MigrationClient): Promise<string[]> {
  const applied: string[] = [];
  await client.query('BEGIN');
  try {
    await client.query('SELECT pg_advisory_xact_lock(73101, 3)');
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`);
    const { rows } = await client.query('SELECT id, checksum FROM schema_migrations ORDER BY id');
    for (const row of rows) {
      if (!tigerDataMigrations.some(m => m.id === row.id)) throw new Error(`Unknown migration: ${row.id}`);
    }
    for (const migration of tigerDataMigrations) {
      const checksum = createHash('sha256').update(migration.sql).digest('hex');
      const existing = rows.find(row => row.id === migration.id);
      if (existing) {
        if (existing.checksum !== checksum) throw new Error(`Migration checksum mismatch: ${migration.id}`);
        continue;
      }
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations(id, checksum) VALUES ($1, $2)', [migration.id, checksum]);
      applied.push(migration.id);
    }
    await client.query('COMMIT');
    return applied;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}
