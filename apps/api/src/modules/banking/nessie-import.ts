import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { z } from 'zod';

const ProviderId = z.string().regex(/^[A-Za-z0-9_-]+$/);
const NessieCustomerSchema = z.object({
  _id: ProviderId, first_name: z.string().min(1), last_name: z.string().min(1)
});
const NessieAccountSchema = z.object({
  _id: ProviderId, type: z.string().min(1), nickname: z.string().nullish()
});
const NessiePurchaseSchema = z.object({
  _id: ProviderId, merchant_id: ProviderId.nullish(), amount: z.number().finite().nonnegative(),
  purchase_date: z.string().min(1), description: z.string().nullish(), status: z.string().nullish()
});
const NessieMerchantSchema = z.object({ _id: ProviderId, name: z.string().min(1) });
const NessieBillSchema = z.object({
  _id: ProviderId, payee: z.string().nullish(), nickname: z.string().nullish(),
  payment_amount: z.number().finite().nonnegative(), payment_date: z.string().min(1),
  recurring_date: z.number().int().min(1).max(31).nullish()
});
const NessieDepositSchema = z.object({
  _id: ProviderId, amount: z.number().finite().nonnegative(), transaction_date: z.string().min(1),
  description: z.string().nullish(), status: z.string().nullish()
});

type ProviderCustomer = z.output<typeof NessieCustomerSchema>;
type ProviderAccount = z.output<typeof NessieAccountSchema>;
type ProviderPurchase = z.output<typeof NessiePurchaseSchema>;
type ProviderBill = z.output<typeof NessieBillSchema>;
type ProviderDeposit = z.output<typeof NessieDepositSchema>;

export interface NessieReader {
  get<T extends z.ZodType>(path: string, schema: T): Promise<z.output<T>>;
}

export interface NessieImportBatch {
  customer: { externalCustomerId: string; firstName: string; lastName: string };
  accounts: Array<{ externalAccountId: string; accountType: 'CHECKING' | 'SAVINGS' | 'CREDIT' | 'LOAN' | 'CARD'; nickname: string | null }>;
  purchases: Array<{ accountExternalId: string; externalPurchaseId: string; merchantId: string | null;
    merchantName: string | null; amountCents: number; occurredAt: string }>;
  bills: Array<{ accountExternalId: string; externalBillId: string; merchantName: string;
    planName: string | null; amountCents: number; billingCycle: 'MONTHLY' | 'ONE_TIME'; startedAt: string }>;
  deposits: Array<{ accountExternalId: string; externalDepositId: string; amountCents: number;
    occurredAt: string; reference: string | null }>;
}

export interface NessieImportCounts {
  accounts: number;
  purchases: number;
  bills: number;
  deposits: number;
}

export interface NessieImportStore {
  saveImport(userId: string, batch: NessieImportBatch): Promise<NessieImportCounts>;
}

/** Reads only the requested customer's account tree and commits it through one store boundary. */
export function createNessieImporter(options: { client: NessieReader; store: NessieImportStore }) {
  return async (userId: string, customerId: string): Promise<NessieImportCounts> => {
    if (!userId.trim() || !ProviderId.safeParse(customerId).success) throw new Error('INVALID_NESSIE_IMPORT_REQUEST');
    const customer = await options.client.get(`/customers/${customerId}`, NessieCustomerSchema);
    if (customer._id !== customerId) throw new Error('NESSIE_CUSTOMER_MISMATCH');
    const accounts = await options.client.get(`/customers/${customerId}/accounts`, z.array(NessieAccountSchema));
    const details = await Promise.all(accounts.map(async account => {
      const [purchases, bills, deposits] = await Promise.all([
        options.client.get(`/accounts/${account._id}/purchases`, z.array(NessiePurchaseSchema)),
        options.client.get(`/accounts/${account._id}/bills`, z.array(NessieBillSchema)),
        options.client.get(`/accounts/${account._id}/deposits`, z.array(NessieDepositSchema))
      ]);
      return { account, purchases, bills, deposits };
    }));

    const merchantIds = [...new Set(details.flatMap(detail => detail.purchases)
      .map(purchase => purchase.merchant_id).filter((id): id is string => Boolean(id)))];
    const merchants = new Map<string, string>();
    await Promise.all(merchantIds.map(async merchantId => {
      const merchant = await options.client.get(`/merchants/${merchantId}`, NessieMerchantSchema);
      if (merchant._id !== merchantId) throw new Error('NESSIE_MERCHANT_MISMATCH');
      merchants.set(merchantId, merchant.name);
    }));

    const batch: NessieImportBatch = {
      customer: { externalCustomerId: customer._id, firstName: customer.first_name, lastName: customer.last_name },
      accounts: details.map(({ account }) => ({
        externalAccountId: account._id,
        accountType: normalizeAccountType(account.type),
        nickname: clean(account.nickname)
      })),
      purchases: details.flatMap(({ account, purchases }) => purchases.map(purchase => normalizePurchase(account, purchase, merchants))),
      bills: details.flatMap(({ account, bills }) => bills.map(bill => normalizeBill(account, bill))),
      deposits: details.flatMap(({ account, deposits }) => deposits.filter(deposit => deposit.status === 'completed').map(deposit => normalizeDeposit(account, deposit)))
    };
    return options.store.saveImport(userId, batch);
  };
}

/** PostgreSQL/Tiger Data implementation. Every import is atomic and replay-safe. */
export class TigerDataNessieStore implements NessieImportStore {
  constructor(private readonly pool: pg.Pool) {}

  async saveImport(userId: string, batch: NessieImportBatch): Promise<NessieImportCounts> {
    const importId = randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`nessie-import:${userId}`]);
      const updated = await client.query(
        'UPDATE users SET first_name=$2,last_name=$3,updated_at=NOW() WHERE id=$1 RETURNING id',
        [userId, batch.customer.firstName, batch.customer.lastName]
      );
      if (!updated.rowCount) throw new Error('USER_NOT_FOUND');
      await client.query(`INSERT INTO events
        (user_id,idempotency_key,entity_type,entity_id,event_type,event_payload)
        VALUES ($1,$2,'USER',$1,'NESSIE_CUSTOMER_IMPORTED',$3::jsonb)
        ON CONFLICT (user_id,idempotency_key) DO UPDATE SET event_payload=EXCLUDED.event_payload`,
      [userId, `nessie:customer:${batch.customer.externalCustomerId}`, JSON.stringify({
        externalCustomerId: batch.customer.externalCustomerId, importId
      })]);

      const accountIds = new Map<string, string>();
      for (const account of batch.accounts) {
        const result = await client.query<{ id: string }>(`INSERT INTO accounts
          (user_id,external_account_id,institution_name,account_type,nickname)
          VALUES ($1,$2,'Capital One Nessie',$3,$4)
          ON CONFLICT (user_id,external_account_id) DO UPDATE SET
            institution_name=EXCLUDED.institution_name,account_type=EXCLUDED.account_type,nickname=EXCLUDED.nickname
          RETURNING id`, [userId, account.externalAccountId, account.accountType, account.nickname]);
        accountIds.set(account.externalAccountId, requireRowId(result.rows[0]));
      }

      for (const purchase of batch.purchases) {
        await client.query(`INSERT INTO transactions
          (user_id,account_id,nessie_purchase_id,merchant_name,merchant_id,amount_cents,currency,occurred_at)
          VALUES ($1,$2,$3,$4,$5,$6,'USD',$7)
          ON CONFLICT (user_id,nessie_purchase_id) DO UPDATE SET
            account_id=EXCLUDED.account_id,merchant_name=EXCLUDED.merchant_name,merchant_id=EXCLUDED.merchant_id,
            amount_cents=EXCLUDED.amount_cents,occurred_at=EXCLUDED.occurred_at,updated_at=NOW()`,
        [userId, requireAccount(accountIds, purchase.accountExternalId), purchase.externalPurchaseId,
          purchase.merchantName, purchase.merchantId, purchase.amountCents, purchase.occurredAt]);
      }

      // Immutable import evidence plus the current customer marker distinguishes completed
      // deposits from stale/pending legacy rows without deleting audit history.
      await client.query(`INSERT INTO events(user_id,idempotency_key,entity_type,entity_id,event_type,event_payload)
        VALUES($1,$2,'USER',$1,'NESSIE_IMPORT_COMPLETED',$3)`,
        [userId,`nessie:import:${importId}`,JSON.stringify({importId,customerId:batch.customer.externalCustomerId})]);
      for (const deposit of batch.deposits) {
        await client.query(`INSERT INTO deposits
          (user_id,account_id,nessie_deposit_id,amount_cents,currency,occurred_at,reference,simulated)
          VALUES ($1,$2,$3,$4,'USD',$5,$6,TRUE)
          ON CONFLICT (user_id,nessie_deposit_id) DO UPDATE SET
            account_id=EXCLUDED.account_id,amount_cents=EXCLUDED.amount_cents,occurred_at=EXCLUDED.occurred_at,
            reference=EXCLUDED.reference`,
        [userId, requireAccount(accountIds, deposit.accountExternalId), deposit.externalDepositId,
          deposit.amountCents, deposit.occurredAt, deposit.reference]);
      }

      for (const deposit of batch.deposits) {
        await client.query(`INSERT INTO events(user_id,idempotency_key,entity_type,entity_id,event_type,event_payload)
          VALUES($1,$2,'ACCOUNT',$3,'NESSIE_DEPOSIT_IMPORTED_COMPLETED',$4)`,
          [userId,`nessie:completed-deposit:${importId}:${deposit.externalDepositId}`,requireAccount(accountIds,deposit.accountExternalId),
            JSON.stringify({depositId:deposit.externalDepositId,amountCents:deposit.amountCents,simulated:true,importId,customerId:batch.customer.externalCustomerId})]);
      }
      for (const bill of batch.bills) {
        await upsertBill(client, userId, requireAccount(accountIds, bill.accountExternalId), bill);
      }
      await client.query('COMMIT');
      return { accounts: batch.accounts.length, purchases: batch.purchases.length,
        bills: batch.bills.length, deposits: batch.deposits.length };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

async function upsertBill(client: pg.PoolClient, userId: string, accountId: string,
  bill: NessieImportBatch['bills'][number]): Promise<void> {
  const key = `nessie:bill:${bill.externalBillId}`;
  const prior = await client.query<{ entity_id: string | null }>(
    'SELECT entity_id FROM events WHERE user_id=$1 AND idempotency_key=$2', [userId, key]);
  if (prior.rows[0]?.entity_id) {
    await client.query(`UPDATE subscriptions SET merchant_name=$3,plan_name=$4,amount_cents=$5,
      billing_cycle=$6,started_at=$7,updated_at=NOW() WHERE user_id=$1 AND id=$2`,
    [userId, prior.rows[0].entity_id, bill.merchantName, bill.planName, bill.amountCents, bill.billingCycle, bill.startedAt]);
    return;
  }
  const inserted = await client.query<{ id: string }>(`INSERT INTO subscriptions
    (user_id,merchant_name,account_id,plan_name,amount_cents,currency,billing_cycle,started_at)
    VALUES ($1,$2,$3,$4,$5,'USD',$6,$7) RETURNING id`,
  [userId, bill.merchantName, accountId, bill.planName, bill.amountCents, bill.billingCycle, bill.startedAt]);
  const subscriptionId = requireRowId(inserted.rows[0]);
  await client.query(`INSERT INTO events
    (user_id,idempotency_key,entity_type,entity_id,event_type,event_payload)
    VALUES ($1,$2,'SUBSCRIPTION',$3,'NESSIE_BILL_IMPORTED',$4::jsonb)`,
  [userId, key, subscriptionId, JSON.stringify({ externalBillId: bill.externalBillId })]);
}

function normalizePurchase(account: ProviderAccount, purchase: ProviderPurchase,
  merchants: ReadonlyMap<string, string>): NessieImportBatch['purchases'][number] {
  return {
    accountExternalId: account._id,
    externalPurchaseId: purchase._id,
    merchantId: clean(purchase.merchant_id),
    merchantName: purchase.merchant_id ? merchants.get(purchase.merchant_id) ?? clean(purchase.description) : clean(purchase.description),
    amountCents: dollarsToCents(purchase.amount),
    occurredAt: toIsoDateTime(purchase.purchase_date)
  };
}

function normalizeBill(account: ProviderAccount, bill: ProviderBill): NessieImportBatch['bills'][number] {
  const merchantName = clean(bill.payee) ?? clean(bill.nickname);
  if (!merchantName) throw new Error('NESSIE_BILL_MERCHANT_REQUIRED');
  return {
    accountExternalId: account._id, externalBillId: bill._id, merchantName,
    planName: clean(bill.nickname), amountCents: dollarsToCents(bill.payment_amount),
    billingCycle: bill.recurring_date ? 'MONTHLY' : 'ONE_TIME', startedAt: toIsoDateTime(bill.payment_date)
  };
}

function normalizeDeposit(account: ProviderAccount, deposit: ProviderDeposit): NessieImportBatch['deposits'][number] {
  return {
    accountExternalId: account._id, externalDepositId: deposit._id,
    amountCents: dollarsToCents(deposit.amount), occurredAt: toIsoDateTime(deposit.transaction_date),
    reference: clean(deposit.description)
  };
}

function normalizeAccountType(value: string): NessieImportBatch['accounts'][number]['accountType'] {
  const normalized = value.toUpperCase().replace(/[^A-Z]/g, '');
  if (normalized === 'CHECKING') return 'CHECKING';
  if (normalized === 'SAVINGS') return 'SAVINGS';
  if (normalized === 'CREDIT' || normalized === 'CREDITCARD') return 'CREDIT';
  if (normalized === 'LOAN') return 'LOAN';
  if (normalized === 'CARD') return 'CARD';
  throw new Error('NESSIE_ACCOUNT_TYPE_UNSUPPORTED');
}

function dollarsToCents(value: number): number {
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents < 0 || cents > 2_147_483_647 || Math.abs(value - cents / 100) > 1e-9) {
    throw new Error('NESSIE_INVALID_MONEY');
  }
  return cents;
}

function toIsoDateTime(value: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value;
  const date = new Date(normalized);
  if (Number.isNaN(date.valueOf())) throw new Error('NESSIE_INVALID_DATE');
  return date.toISOString();
}

function clean(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function requireRowId(row: { id: string } | undefined): string {
  if (!row?.id) throw new Error('TIGER_DATA_INVALID_RESPONSE');
  return row.id;
}

function requireAccount(ids: ReadonlyMap<string, string>, externalId: string): string {
  const id = ids.get(externalId);
  if (!id) throw new Error('TIGER_DATA_ACCOUNT_NOT_FOUND');
  return id;
}
