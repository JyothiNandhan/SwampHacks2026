# T04 — Nessie read transport and API foundation

The server exposes `GET /health` as a liveness check with the frozen response:

```json
{"status":"ok","service":"moneyback-api"}
```

Typed configuration is loaded before creating resources or listening. `PORT` defaults to 3001 and must be an integer from 1–65535. `NODE_ENV` accepts development, test or production. Development/test allow missing `DATABASE_URL` and `NESSIE_API_KEY`; the corresponding dependencies are null. Production requires both, matching `config/env-contract.json`. Optional `NESSIE_ACCOUNT_ID` remains available to future imports. No environment names or shared API schemas changed.

Export environment variables before starting (the server does not automatically read `.env`):

```sh
pnpm dev:api
curl http://localhost:3001/health
# Compiled launch after pnpm build:
pnpm --filter @moneyback/api start
```

`NESSIE_BASE_URL` defaults to the existing project pin, `https://api.reimaginebanking.com`. Set it explicitly to the endpoint associated with your Nessie sandbox/key. Remote URLs must use HTTPS, with no embedded credentials, query or fragment. Loopback HTTP is allowed for local test servers. No live Nessie request or managed Tiger Data connection was made for T04; tests use synthetic fixtures and injected fetch responses.

`app.database` is a lazy pg Pool (maximum 10 connections, 5-second connection deadline, 10-second statement deadline, 12-second query deadline, 30-second idle expiry). Provider TLS settings are preserved from `DATABASE_URL`; certificate verification is not disabled. Idle pool errors are handled without logging connection strings, and Fastify close drains the pool. Health checks do not acquire a database connection, run migrations or call Nessie. Application services must still use parameterized SQL and authenticated user scope.

`app.nessie` is a GET-only `NessieClient`; the client can also be constructed independently. Pass a Zod validator for the expected provider response at each call:

```ts
import { z } from 'zod';
import { NessieClient } from './nessie-client.js';

// Synthetic, minimal example. T08 must define the complete import response schema.
const purchaseIds = z.array(z.object({ _id: z.string().min(1) }));
const client = new NessieClient({ baseUrl: configuredBaseUrl, apiKey: serverSideKey });
const purchases = await client.get(`/accounts/${validatedAccountId}/purchases`, purchaseIds);
```

Only relative customer/account/purchase/merchant/bill/deposit resource paths with safe identifier segments are accepted. The transport appends `key` via URLSearchParams, sends GET with JSON accept headers, preserves a configured base-path prefix, rejects redirects and applies a 10-second deadline through response-body reading. It does not retry automatically; `NessieError.retryable` lets a future job scheduler decide. It does not accept arbitrary external URLs, request methods or query overrides.

Error codes distinguish authorization (401/403), not found (404), rate limits (429), other HTTP failures, timeout, network failure and invalid JSON/schema. Errors carry only safe code/status metadata. Never log request URLs: Nessie authentication uses a query key. The official [Nessie purchase SDK](https://github.com/nessieisreal/nessie-javascript-sdk/blob/master/lib/purchase.js) documents GET `/accounts/{id}/purchases` with the `key` query parameter; see the [Nessie documentation](https://prod.nessieisreal.com/docs) for the active sandbox's provider contract.

This transport returns only the caller-validated provider shape. T08 owns full provider adapters, dollar-to-cent conversion, canonical shared-schema validation and idempotent imports. No provider response should be sent directly to clients. Nessie deposits represent simulated inflows, not real merchant refunds.

Unhandled HTTP failures and unknown routes use the shared `{ error: { code, message, requestId } }` contract. Upstream failure maps to 502, timeout to 504; unknown server errors expose no raw exception. Request IDs are server-generated. Default request logging is disabled, and log serializers omit headers, URLs, bodies and raw exceptions. Future authenticated module registration remains separate: T04 exposes no public financial routes and does not wire T05 before its auth/storage dependencies are available.

Verification: `pnpm check` checks versions/contracts/types, all existing T05 tests, configuration validation, HTTP errors, lazy pool lifecycle and mocked Nessie success/failure/timeout/path validation, then builds the backend. CI also verifies PostgreSQL migration execution/replay. No schema migration is needed for T04.

The real pool integration test reads **only** `TEST_DATABASE_URL` and is skipped without it. CI runs it against the disposable PostgreSQL service after migrations, verifying connection acquisition, client release, SQL-error recovery and cleanup. It never falls back to a developer's `DATABASE_URL`.

## T08 import service

`createNessieImporter` reads one validated customer account tree (accounts, purchases, merchants, bills and deposits), converts provider dollars to exact integer cents and hands one normalized batch to the store. `TigerDataNessieStore` saves that batch in a transaction with a per-user advisory lock. Accounts, purchases and deposits use provider-ID conflict keys; bills use the existing event idempotency ledger to associate and update their subscription rows. Replaying a provider record updates it instead of duplicating it.

The importer is read-only toward Nessie. Deposits are stored as simulated sandbox deposits, never proof that a merchant issued a real refund. Route registration and authenticated user/customer binding remain T20 work.
