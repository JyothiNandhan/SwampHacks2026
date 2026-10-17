# Tiger Data schema (T03)

Target PostgreSQL 16+ including Tiger Data. Core migrations need no superuser extension installation. Price observations are indexed ordinary PostgreSQL tables; Timescale hypertable conversion can be evaluated separately with the deployed extension/version and its unique-key requirements.

After `pnpm install --frozen-lockfile`, export `DATABASE_URL` using your provider's TLS connection string and run:

```bash
pnpm --filter @moneyback/db migrate:check
pnpm db:migrate
```

The CLI uses the exported environment; it does not automatically load `.env`. Migration execution locks the database with a transaction-scoped advisory lock, records SHA-256 checksums, and atomically commits schema plus ledger. Repeated execution skips applied migrations; checksum drift and unknown migrations fail. Never edit an applied SQL migration. Add a new ordered manifest entry instead. There is no destructive down migration. Before production changes use provider backups and a separate migration role.

The schema includes bank accounts/transactions/deposits, receipt originals and extracted lines, purchases (orders), purchase line items and receipt associations, evidence, source-backed policies, offers and price observations, opportunities, recovery cases, simulated refunds, subscriptions, durable jobs, timeline events, notifications and deadlines. API `receiptIds`, `items` and `evidenceIds` are aggregates of the corresponding association tables. Deadline evidence is stored separately from policy evidence. Original evidence is retained; consolidating receipts changes associations, not source rows.

Composite foreign keys enforce matching user ownership for relationships. Every service must still scope reads and writes to the authenticated user; this migration does not supply application authentication or row-level security. Private file IDs refer to future object storage, not public URLs. Money is constrained to nonnegative integer USD cents. External bank IDs, observed offer keys, event keys and job idempotency keys prevent replay duplication. Job keys must encode tenant, job type, target and schedule window. Workers implement scheduling and retries in T19.

A deposit can be linked to only one refund. This scaffold permits simulated deposits only. The future reconciliation service must verify reference, account, amount, timing and evidence before confirming a case; database uniqueness alone cannot establish a refund match. State transitions, approval auditing and provider import services remain separate tasks.

`pnpm --filter @moneyback/db test` runs migrations against an isolated embedded PostgreSQL engine (PGlite), including replay, rollback, ownership, invalid money, duplicate imports and deposit constraints. CI additionally runs the same migration with the actual `pg` driver against PostgreSQL 16. Managed Tiger Data connectivity and provider-specific TLS must be verified separately when credentials are configured.
