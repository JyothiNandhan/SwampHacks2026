import { createHash } from 'node:crypto';
import { tigerDataMigrations } from './index.js';
import { PGlite } from '@electric-sql/pglite';
import { afterEach, expect, test } from 'vitest';
import { migrate, type MigrationClient } from './migrate.js';

const databases: PGlite[] = [];
afterEach(async () => { await Promise.all(databases.splice(0).map(db => db.close())); });
function database() {
  const db = new PGlite();
  databases.push(db);
  const client: MigrationClient = {
    async query(sql, values) {
      if (values) return db.query<Record<string, unknown>>(sql, values);
      const results = await db.exec(sql);
      return { rows: (results.at(-1)?.rows ?? []) as Record<string, unknown>[] };
    }
  };
  return { db, client };
}
async function seed() {
  const { db, client } = database();
  await migrate(client);
  const user = (await db.query<{ id: string }>("INSERT INTO users(email) VALUES ('demo@example.com') RETURNING id")).rows[0].id;
  const other = (await db.query<{ id: string }>("INSERT INTO users(email) VALUES ('other@example.com') RETURNING id")).rows[0].id;
  const account = (await db.query<{ id: string }>("INSERT INTO accounts(user_id,external_account_id,institution_name,account_type) VALUES ($1,'nessie-account','Nessie','CHECKING') RETURNING id", [user])).rows[0].id;
  return { db, client, user, other, account };
}
test('migration executes on PostgreSQL, replays safely and detects edited migration history', async () => {
  const { db, client } = database();
  expect(await migrate(client)).toEqual(['001_init_tiger_data', '002_serpapi_source']);
  expect(await migrate(client)).toEqual([]);
  const { rows } = await db.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  expect(rows.map(row => row.tablename)).toEqual(expect.arrayContaining([
    'users', 'accounts', 'transactions', 'receipts', 'receipt_items', 'purchases', 'purchase_items',
    'purchase_receipts', 'evidence', 'policies', 'product_offers', 'price_time_series', 'cases',
    'refunds', 'deposits', 'subscriptions', 'jobs', 'events', 'notifications', 'deadlines'
  ]));
  await db.exec("UPDATE schema_migrations SET checksum='tampered'");
  await expect(migrate(client)).rejects.toThrow('checksum mismatch');
  expect((await db.query('SELECT * FROM schema_migrations')).rows).toHaveLength(2);
}, 30000);
test('failed schema creation rolls back both tables and migration ledger', async () => {
  const { db, client } = database();
  await db.exec('CREATE TABLE cases (existing BOOLEAN)');
  await expect(migrate(client)).rejects.toThrow();
  const result = await db.query("SELECT to_regclass('public.users') AS users, to_regclass('public.schema_migrations') AS ledger");
  expect(result.rows[0]).toEqual({ users: null, ledger: null });
}, 30000);
test('database rejects cross-user links, invalid money and duplicate imports', async () => {
  const { db, user, other, account } = await seed();
  const sql = `INSERT INTO transactions(user_id,account_id,nessie_purchase_id,amount_cents,occurred_at)
    VALUES ($1,$2,$3,$4,NOW())`;
  await db.query(sql, [user, account, 'purchase-1', 30000]);
  await expect(db.query(sql, [user, account, 'purchase-1', 30000])).rejects.toThrow();
  await expect(db.query(sql, [other, account, 'cross-user', 30000])).rejects.toThrow();
  await expect(db.query(sql, [user, account, 'negative', -1])).rejects.toThrow();
  await expect(db.query(sql, [user, account, 'fraction', 1.5])).rejects.toThrow();
  const evidence = 'INSERT INTO evidence(user_id,source_type,source_id,category,acquisition_method) VALUES ($1,\'RECEIPT\',\'same-provider-id\',\'PROOF\',\'UPLOAD\')';
  await db.query(evidence, [user]);
  await db.query(evidence, [other]);
  await expect(db.query(evidence, [user])).rejects.toThrow();
}, 30000);
test('offer replay, job keys and refund deposit uniqueness prevent double counting', async () => {
  const { db, user, account } = await seed();
  const offerSql = `INSERT INTO product_offers(user_id,source,retailer_name,product_name,condition,price_cents,product_url,observed_at)
    VALUES ($1,'FIXTURE','Demo','Watch','NEW',25000,'https://example.com/watch','2026-10-17T12:00:00Z')`;
  await db.query(offerSql, [user]);
  await expect(db.query(offerSql, [user])).rejects.toThrow();
  const job = "INSERT INTO jobs(user_id,idempotency_key,job_type) VALUES ($1,'monitor:purchase-1:hour-1','PRICE_MONITOR')";
  await db.query(job, [user]);
  await expect(db.query(job, [user])).rejects.toThrow();
  const opportunity = (await db.query<{ id: string }>("INSERT INTO opportunities(user_id,type) VALUES ($1,'MISSING_REFUND') RETURNING id", [user])).rows[0].id;
  const recoveryCase = (await db.query<{ id: string }>("INSERT INTO cases(user_id,opportunity_id) VALUES ($1,$2) RETURNING id", [user, opportunity])).rows[0].id;
  await expect(db.query("INSERT INTO refunds(user_id,case_id,expected_amount_cents,status) VALUES ($1,$2,5000,'CONFIRMED')", [user, recoveryCase])).rejects.toThrow();
  await db.query("INSERT INTO deposits(user_id,account_id,nessie_deposit_id,amount_cents,occurred_at) VALUES ($1,$2,'deposit-1',5000,NOW())", [user, account]);
  const refund = "INSERT INTO refunds(user_id,case_id,deposit_id,expected_amount_cents,confirmed_amount_cents,status) VALUES ($1,$2,'deposit-1',5000,5000,'CONFIRMED')";
  await db.query(refund, [user, recoveryCase]);
  await expect(db.query(refund, [user, recoveryCase])).rejects.toThrow();
  await expect(db.query("INSERT INTO deposits(user_id,account_id,nessie_deposit_id,amount_cents,occurred_at,simulated) VALUES ($1,$2,'real',5000,NOW(),FALSE)", [user, account])).rejects.toThrow();
}, 30000);

test('SerpApi migration upgrades an existing schema and preserves historical observations',async()=>{
 const {db,client}=database();const original=tigerDataMigrations[0];
 await db.exec(original.sql);
 await db.exec('CREATE TABLE schema_migrations(id TEXT PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 await db.query('INSERT INTO schema_migrations(id,checksum) VALUES($1,$2)',[original.id,createHash('sha256').update(original.sql).digest('hex')]);
 const user=(await db.query<{id:string}>("INSERT INTO users(email) VALUES('upgrade@example.com') RETURNING id")).rows[0].id;
 const insert="INSERT INTO product_offers(user_id,source,retailer_name,product_name,condition,price_cents,product_url,observed_at) VALUES($1,$2,'Store','Watch','UNKNOWN',1000,'https://example.com/watch',NOW())";
 await db.query(insert,[user,'BEST_BUY']);
 expect(await migrate(client)).toEqual(['002_serpapi_source']);
 await db.query(insert,[user,'SERPAPI']);
 expect((await db.query('SELECT source FROM product_offers ORDER BY source')).rows).toEqual([{source:'BEST_BUY'},{source:'SERPAPI'}]);
 await expect(db.query(insert,[user,'UNTRUSTED'])).rejects.toThrow();
 expect(await migrate(client)).toEqual([]);
},30000);
