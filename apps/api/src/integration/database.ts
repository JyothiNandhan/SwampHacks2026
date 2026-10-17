import type pg from 'pg';
import { z } from 'zod';
import { ApiError } from './security.js';
export const uuid = (value: unknown): string => {
  const parsed = z.uuid().safeParse(value); if (!parsed.success) throw new ApiError('INVALID_ID', 400); return parsed.data;
};
export function wire(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase()), value instanceof Date ? value.toISOString() : value]));
}
export async function transaction<T>(pool: pg.Pool, run: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try { await client.query('BEGIN'); const value = await run(client); await client.query('COMMIT'); return value; }
  catch (error) { await client.query('ROLLBACK'); throw error; } finally { client.release(); }
}
export async function owned(client: Pick<pg.Pool, 'query'> | pg.PoolClient, table: string, userId: string, id: string, lock = false) {
  if (!['accounts', 'receipts', 'purchases', 'opportunities', 'cases', 'evidence', 'jobs'].includes(table)) throw new Error('INVALID_TABLE');
  const row = (await client.query(`SELECT * FROM ${table} WHERE user_id=$1 AND id=$2 ${lock ? 'FOR UPDATE' : ''}`, [uuid(userId), uuid(id)])).rows[0];
  if (!row) throw new ApiError('NOT_FOUND', 404); return row as Record<string, unknown>;
}
