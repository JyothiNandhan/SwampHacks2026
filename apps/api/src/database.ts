import pg from 'pg';

/** Lazy pool: connecting and migration execution are separate, explicit operations. */
export function createDatabasePool(connectionString: string): pg.Pool {
  return new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    query_timeout: 12000
  });
}
