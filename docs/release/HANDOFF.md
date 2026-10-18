# T20–T25 backend handoff

The API and worker are deployed to Railway. Code commit 0fe1f8b is active and its
CI passed. Verified TLS, migrations, authenticated routes, receipt extraction/matching
and document persistence passed. Live Nessie USD 10 simulated-refund reconciliation
also passed using an explicitly audited, operator-provisioned synthetic billing case.
The complete live retail-to-refund gate remains open because current product/seller/
shipping evidence has not established an eligible offer. Frontend work remains paused.

| Task | Delivered and verified | Remaining release evidence |
|---|---|---|
| T20 | Contract routes, auth/authz, env validation, OpenAPI, Railway API, private volume and verified database TLS | Current code 0fe1f8b verified |
| T21 | Real Railway worker connectivity; SerpApi live priced observations; Bright Data collection transport; conservative source persistence and replay tests | Verified exact-product live offers and a priced live worker job |
| T22 | Live Nessie USD 10 deposit imported and reconciled to CONFIRMED with an operator-provisioned synthetic billing case; replay kept one allocation; offline partial/refund guards pass | Retail-generated live case path is still part of T24 |
| T23 | 15/15 synthetic regression cases and 3/3 direct live Gemini synthetic email checks | Real photographed-receipt accuracy remains unmeasured |
| T24 | Green remote CI; current real-driver PostgreSQL migration and smoke checks; stable Railway API/worker | Complete live bank-to-simulated-refund flow |
| T25 | Postman collection, OpenAPI, backend demo commands and updated release handoff | Final backend demo and redacted Railway log screenshots |

## Local verification

Use Node 22.16.0 and pnpm 9.15.9 from the repository pins.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm --filter @moneyback/api test:release
pnpm --filter @moneyback/api evaluate:receipts
# Optional real PostgreSQL instead of embedded PostgreSQL:
TEST_DATABASE_URL=postgres://USER:PASSWORD@localhost/TEST_DB pnpm --filter @moneyback/api test:release
```

The release smoke imports mocked Nessie purchases, extracts a mocked photo, matches
it to the imported transaction, extracts policy evidence, queues and executes a
price job through the actual worker runner/internal API, creates a case, requires
explicit approval, records a staff-authorized simulated submission, imports completed
partial deposits and confirms exactly 5,000 simulated cents. It rejects unrelated
same-value deposits, pending/future deposits and cross-user access. Replay retries
reuse job results and deposit allocations. The smoke also checks scheduling consent
and hourly enqueue deduplication. Retail integration uses actual SerpApi/Bright Data
adapters with mocked HTTP including asynchronous snapshots. No live providers are
claimed by these tests.

`receipt-evaluation.json` records 15/15 synthetic regression expectations passing,
covering correct/wrong/missing receipt fields, paper/email duplicates, distinct orders,
ambiguous policies, exclusions and unsupported rental fees. This is a regression
pass rate, **not real-world OCR accuracy**. Generate it with:

```sh
pnpm build
node apps/api/dist/evaluation/run.js > docs/release/receipt-evaluation.json
node apps/api/dist/integration/export-openapi.js > docs/release/openapi.json
```

## Authentication and authorization

This release uses provisioned per-user opaque tokens. Auth0 login/JWT support is
still a future client milestone; Auth0 environment names are not treated as working
JWT configuration. Generate at least 32 random bytes (for example using
`openssl rand -hex 32`) and keep the resulting token in your secret manager. Calculate
its SHA-256 locally. Store **only its hash**, a pre-provisioned user UUID and roles
in the Railway secret `API_TOKENS_JSON`:

```json
[{"tokenHash":"<64 lowercase hex SHA-256 characters>","userId":"<user UUID>","roles":["user","demo"]}]
```

Send the original token in `Authorization: Bearer <token>`. Removing its hash and
redeploying revokes it. No caller-provided user ID or role is trusted. `demo`/`admin`
can trigger price monitoring for their own purchases; they cannot access another
user's records. Worker credentials are separate and only authorize the internal
job endpoint. Unknown credentials return 401; missing ownership returns 404. Body
validation and safe errors follow canonical contracts. Rate limits are 60 requests
per minute per IP/user per process, with a bounded store. Use one API replica until
a shared gateway limiter is configured. Tokens require HTTPS outside localhost.

`GET /health` is public liveness. `/docs`, `/openapi.json` and `/api/v1/*` require a
user token. Documentation includes all canonical routes and can be imported into
Postman. Collection list endpoints use stable UUID ordering, 100 records per page,
`nextCursor`, and optional `?cursor=<UUID>`; keep paging until null.

## Trusted operator setup

Operator commands require direct database access and a local JSON input file. They
are not public endpoints. Run from the workspace root with `DATABASE_URL` explicitly
exported; originals also require `EVIDENCE_DIRECTORY`. Files must contain synthetic
or user-authorized evidence only.

```sh
pnpm --filter @moneyback/api operator /absolute/path/to/operation.json
```

Input examples (replace UUID placeholders):

```json
{"operation":"PROVISION_USER","userId":"<UUID>","email":"demo@example.com"}
{"operation":"BIND_NESSIE_ACCOUNT","userId":"<UUID>","customerId":"<Nessie customer ID>","externalAccountId":"<Nessie account ID>"}
{"operation":"REGISTER_EVIDENCE","userId":"<UUID>","fileId":"receipt-1","category":"RECEIPT","mimeType":"image/jpeg","localPath":"/private/path/receipt.jpg"}
{"operation":"ENABLE_PRICE_MONITORING","userId":"<UUID>","purchaseId":"<UUID>","consentConfirmed":true}
{"operation":"RECORD_SIMULATED_SUBMISSION","userId":"<UUID>","caseId":"<UUID>","accountId":"<UUID>","reference":"RMA-DEMO-4242","simulated":true}
```

`BIND_NESSIE_ACCOUNT` returns an internal `accountId` for `/sync/nessie`; the importer
uses its trusted customer binding rather than interpreting caller IDs as customers.
The operator must verify the sandbox account belongs to that customer/user before
binding it. The binding imports that customer's account tree.

`REGISTER_EVIDENCE` preserves the original under `<EVIDENCE_DIRECTORY>/<userId>/`
with an immutable file ID and checksum, and returns `evidenceId`/`originalFileId`.
The authenticated `/api/v1/documents` upload route also provisions originals. The
ingest route reads these stored originals. Email inputs must already be decoded UTF-8 text/HTML;
image OCR needs a live Gemini key and an explicitly selected supported `GEMINI_MODEL`.
Raw Gemini output, original checksum, model and time are retained privately even if
JSON validation fails. No originals are deleted by consolidation.

Policy extraction takes one user-owned text evidence ID and preserves citations.
Its item eligibility remains REVIEW_REQUIRED. Explicit parsed dates create tentative
deadlines with a notification that asks for eligibility review. Billing comparison
requires two `application/json` evidence files with shapes:

```json
{"kind":"AGREEMENT","charges":[{"label":"Daily rate","amountCents":10000}]}
{"kind":"FINAL_BILL","charges":[{"label":"Daily rate","amountCents":12000}]}
```

Approval moves REVIEW to APPROVED and records the user audit. It does not submit a
merchant action. `RECORD_SIMULATED_SUBMISSION` is an explicit staff action after
approval; it records the simulated refund reference/account and moves through
SUBMITTED to PENDING. Reconciliation only uses completed deposits from the latest
Nessie import with the recorded reference, account, date and bounded expected
amount. Amount alone or merchant name alone cannot confirm a refund. Partial
allocations accumulate without reuse across cases. OVERPAID/unrelated funds remain
unallocated for review. Confirmation events always state `simulated: true`.

## Railway service configuration

The existing Railway project has two services tracking **main**. Both use the repository root (shared pnpm workspace).
Select `/apps/api/railway.json` for the API service and
`/apps/worker/railway.json` for the worker. Both build the root Dockerfile. No
Docker/Railway build was available locally; the workspace build was verified.

1. Provision PostgreSQL/Tiger Data and set `DATABASE_URL`. Apply `pnpm db:migrate`
   against the target database before starting services. Never edit an applied migration.
2. API environment: `NODE_ENV=production`, `DATABASE_URL`, `NESSIE_API_KEY`,
   `API_TOKENS_JSON`, `INTERNAL_WORKER_TOKEN` (a separate 32+ character random token).
   Railway supplies `PORT`. Production refuses to start without credentials and
   refuses replay mode. Gemini/retail features fail closed until their keys/models
   and Bright Data dataset IDs are configured.
3. Mount a persistent private volume at `/data` for the API. Make it writable by
   container UID 1000; set `EVIDENCE_DIRECTORY=/data/evidence`. The container uses
   the non-root `node` user. Without the volume, evidence retention does not survive
   redeployment. Operator evidence registration must run against this volume.
4. Worker environment: `DATABASE_URL`, `INTERNAL_API_URL` (API private-network URL),
   same `INTERNAL_WORKER_TOKEN`, `WORKER_POLL_MS=2000`. Enable
   `WORKER_SCHEDULE_ENABLED=true` after recording purchase-specific monitoring consent.
   Keep one worker service during initial release. The worker polls continuously;
   do not attach a Railway cron schedule to the long-running process.
5. SerpApi discovers priced observations and supported Amazon/Walmart product URLs.
   Bright Data verifies product-level identity, condition and stock. Explicit shipping
   quotes join only for the same product and price; both sources remain evidence.
   Set API `BRIGHTDATA_WALMART_DATASET_ID=gd_l95fol7l1ru6rlo116` and the provider keys.
   Incomplete shipping/condition/stock or identity stays out of savings.
6. Verify public `/health`; check authenticated `/openapi.json`, unauthenticated 401,
   cross-user 404, private evidence persistence after restart, real sandbox imports,
   live provider rate limits and worker retry/replay. Save redacted API logs and a
   deployment URL/commit. Capture screenshots only after running the deployed API.

Jobs left RUNNING after a worker crash require operator review before requeueing;
there is no automatic lease recovery. The execution audit prevents rerunning a
completed internal job; persisted observations/opportunities and refund allocations
are idempotent on retry. Long provider batches can exceed request timeouts and retry;
use small batches for the demo. This is a sandbox release with synthetic verification,
not a completed production or live-provider certification.

## Backend demo

Import `MoneyBack.postman_collection.json` into Postman, or `openapi.json` into a
compatible REST client. Set `baseUrl`, `accessToken`, returned account/evidence IDs
and subsequent receipt/purchase/case IDs. Sync → ingest → match → policy extract →
manual monitor → let the worker execute → offers/opportunities → case → approval →
staff simulated submission → sync completed deposits → reconcile → timeline.
`transactionId` can be retrieved by the trusted operator from the user's imported
transactions; the frozen registry does not expose an unmatched-transactions route.
Keep provider keys and receipt text out of screenshots. The deterministic alternative
is `pnpm --filter @moneyback/api test:release`, labeled offline replay.

Railway reference: https://docs.railway.com/deployments/monorepo and
https://docs.railway.com/config-as-code/reference.

## Live release checks (v1.1)

Authenticated private upload is now available as `POST /api/v1/documents` with
`{mimeType, contentBase64}` (4 MiB maximum). The server assigns the file ID, validates
media signatures/UTF-8, records an evidence checksum and stores it under the user's
private volume directory. Each user may register at most 100 documents through this
route. `GET /api/v1/documents/:originalFileId` returns metadata/checksum, never raw
bytes, and detects missing/tampered files. API contract version 1.1.0 adds these
routes without changing existing payloads. The user must be provisioned before upload.

Use a local, Git-ignored `.env.verify` with DATABASE_URL, DEPLOY_VERIFY_ACCESS_TOKEN,
API_BASE_URL and API_TOKENS_JSON; never commit or send these values in chat.

```sh
# Read-only connectivity, migration and authenticated API checks:
node --env-file=.env.verify scripts/verify-live.mjs
# Create one clearly labeled zero-value synthetic connectivity probe and queue it:
node --env-file=.env.verify scripts/verify-live.mjs --worker
# Upload a synthetic email receipt, invoke live Gemini and record file checksum:
node --env-file=.env.verify scripts/verify-live.mjs --documents
# After redeploying the API, repeat --documents to verify the same checksum
# from a different API instance. Do not remove the ignored state file between runs.
```

Worker connectivity intentionally skips an itemless synthetic purchase and does
not test retail availability or create offers/savings. A live retailer test still
requires provider keys and valid product identifiers/URLs. Gemini keys/models must
be enabled on the API service. Local model/provider diagnostics additionally require
those keys in `.env.verify`. `/health` exposes an instance UUID so the verification
script can distinguish a read-back from a persistence check across an instance change.

Clean Nessie setup now creates a completed synthetic purchase and imports it via
Railway. Use `purchase_date` and explicit `status: completed` when creating purchases;
`transaction_date` is rejected as an extra creation field. The original malformed
account was preserved, and the demo now binds a separate clean customer/account.
See NESSIE_BLOCKER.md and live-nessie-checks.json. API origin:
`https://prod-api.nessieisreal.com`.

### Current provider and recovery results

See VERIFICATION.md and the redacted live JSON reports for current evidence. API code
0fe1f8b is deployed and CI passed. Set GEMINI_MODEL=gemini-3.5-flash; the earlier 3.8
availability failure is superseded by later successful synthetic checks.

SerpApi replaces the active Best Buy integration. The API needs SERPAPI_API_KEY;
the worker delegates provider work to the API. Migration 002 adds SERPAPI without
rewriting historical Best Buy observations. Walmart product collection uses
BRIGHTDATA_WALMART_DATASET_ID=gd_l95fol7l1ru6rlo116 and BRIGHTDATA_API_KEY.

Cross-provider shipping enrichment currently supports explicitly verified first-party
Walmart offers only. Product, seller and price must agree, and both evidence records
are retained. Unknown sellers, conditional free shipping, conflicting models, stale
quotes or unknown stock do not establish savings. The latest worker batch completed
with ten observations and zero price opportunities.

The separate billing fixture used live API comparison of synthetic USD 30/40 documents.
A trusted operator provisioned its OVERBILLING opportunity with cited evidence and an
audit event; the comparison route itself does not create opportunities. Deployed case
creation/approval, staff simulated submission, real Nessie sandbox USD 10 deposit
read-back/import and reconciliation passed. The case reached CONFIRMED, replay did
not allocate twice, and the simulated-confirmation audit exists. No real money moved.
This independently verifies T22 reconciliation; it does not establish T24's complete
live retail path. See live-billing-refund-setup.json and live-billing-refund-checks.json.

No additional Railway configuration is currently required. Remaining release work is
a current eligible retail offer/full retail demonstration plus the team's final demo
and redacted request-log screenshots. No current savings or merchant refund is claimed.
