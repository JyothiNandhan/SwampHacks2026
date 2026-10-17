import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import type pg from 'pg';
import { describe, expect, test, vi } from 'vitest';
import type { z } from 'zod';
import { createNessieImporter, TigerDataNessieStore, type NessieImportBatch, type NessieImportStore,
  type NessieReader } from './nessie-import.js';

function fixtureReader(): NessieReader {
  const fixtures: Record<string, unknown> = {
    '/customers/customer-1': { _id: 'customer-1', first_name: 'Demo', last_name: 'User' },
    '/customers/customer-1/accounts': [{ _id: 'account-1', type: 'Checking', nickname: 'Daily' }],
    '/accounts/account-1/purchases': [{ _id: 'purchase-1', merchant_id: 'merchant-1', amount: 123.45,
      purchase_date: '2026-10-16', description: 'Laptop' }],
    '/accounts/account-1/bills': [{ _id: 'bill-1', payee: 'Stream Co', nickname: 'Video', payment_amount: 12.99,
      payment_date: '2026-10-01', recurring_date: 1 }],
    '/accounts/account-1/deposits': [{ _id: 'deposit-1', amount: 25, transaction_date: '2026-10-17',
      description: 'Simulated refund', status: 'completed' }],
    '/merchants/merchant-1': { _id: 'merchant-1', name: 'Best Buy' }
  };
  return { async get<T extends z.ZodType>(path: string, schema: T): Promise<z.output<T>> {
    return schema.parse(fixtures[path]);
  } };
}

describe('T08 Nessie import', () => {
  test('normalizes the account tree and writes one atomic store batch', async () => {
    let captured: NessieImportBatch | undefined;
    const store: NessieImportStore = { saveImport: vi.fn(async (_userId, batch) => {
      captured = batch;
      return { accounts: batch.accounts.length, purchases: batch.purchases.length,
        bills: batch.bills.length, deposits: batch.deposits.length };
    }) };
    const result = await createNessieImporter({ client: fixtureReader(), store })('user-1', 'customer-1');
    expect(result).toEqual({ accounts: 1, purchases: 1, bills: 1, deposits: 1 });
    expect(captured?.purchases[0]).toMatchObject({ amountCents: 12345, merchantName: 'Best Buy' });
    expect(captured?.bills[0]).toMatchObject({ amountCents: 1299, billingCycle: 'MONTHLY' });
    expect(captured?.deposits[0]).toMatchObject({ amountCents: 2500, externalDepositId: 'deposit-1' });
  });

  test('rejects provider money with fractional cents before persistence', async () => {
    const reader = fixtureReader();
    const originalGet = reader.get.bind(reader);
    reader.get = async (path, schema) => path.endsWith('/purchases')
      ? schema.parse([{ _id: 'purchase-1', amount: 1.001, purchase_date: '2026-10-16' }])
      : originalGet(path, schema);
    const store: NessieImportStore = { saveImport: vi.fn() };
    await expect(createNessieImporter({ client: reader, store })('user-1', 'customer-1'))
      .rejects.toThrow('NESSIE_INVALID_MONEY');
    expect(store.saveImport).not.toHaveBeenCalled();
  });

  test('rejects unsafe customer identifiers before a provider call', async () => {
    const reader = fixtureReader();
    const get = vi.spyOn(reader, 'get');
    await expect(createNessieImporter({ client: reader, store: { saveImport: vi.fn() } })('user-1', '../all'))
      .rejects.toThrow('INVALID_NESSIE_IMPORT_REQUEST');
    expect(get).not.toHaveBeenCalled();
  });

  test('Tiger Data store replays accounts, purchases, bills and deposits without duplicates', async () => {
    const db = new PGlite();
    try {
      const migration = readFileSync(new URL('../../../../../packages/db/src/migrations/001_init_tiger_data.sql', import.meta.url), 'utf8');
      await db.exec(migration);
      const userId = (await db.query<{ id: string }>("INSERT INTO users(email) VALUES ('import@example.com') RETURNING id")).rows[0].id;
      const client = {
        async query<Row extends pg.QueryResultRow = pg.QueryResultRow>(sql: string, values?: unknown[]) {
          if (values) {
            const result = await db.query<Row>(sql, values);
            return { ...result, rowCount: result.affectedRows ?? result.rows.length };
          }
          const result = await db.exec(sql);
          const last = result.at(-1);
          return { rows: (last?.rows ?? []) as Row[], rowCount: last?.affectedRows ?? 0, command: '', oid: 0, fields: [] };
        },
        release() {}
      };
      const pool = { async connect() { return client; } } as unknown as pg.Pool;
      const importer = createNessieImporter({ client: fixtureReader(), store: new TigerDataNessieStore(pool) });
      await importer(userId, 'customer-1');
      await importer(userId, 'customer-1');
      for (const table of ['accounts', 'transactions', 'subscriptions', 'deposits']) {
        const count = await db.query<{ count: number }>(`SELECT COUNT(*)::int AS count FROM ${table}`);
        expect(count.rows[0].count).toBe(1);
      }
      expect((await db.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM events WHERE event_type='NESSIE_BILL_IMPORTED'"))
        .rows[0].count).toBe(1);
    } finally {
      await db.close();
    }
  }, 30_000);
});
