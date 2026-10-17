# Verification record — October 17, 2026

## Current local checks

- `pnpm check`: version pins, contracts, workspace types, 174 tests and backend builds passed.
  One optional PostgreSQL-driver test was skipped by the default run.
- Migration upgrade test preserves historical Best Buy offers, accepts SerpApi offers,
  rejects unknown sources and verifies migration replay.
- `receipt-evaluation.json`: 15/15 synthetic regression expectations passed.
- `git diff --check`: passed. Docker is unavailable locally; no local image test is claimed.

## Live checks

The Railway API served commit `9de6e330e321005d2f7307ced3d2e9fb6c30579b`.
The following checks passed against the deployed service and live database:

- API health and authenticated purchase listing.
- Database connection with verified TLS and checksums for migrations 001 and 002.
- Real worker consumed a synthetic zero-value, itemless connectivity probe and returned
  SUCCEEDED. This tests transport/job execution, not prices or savings.
- Authenticated private receipt upload and checksum read-back; the mounted volume is writable.
- The same uploaded receipt retained its checksum after a confirmed API instance change.
- Live Gemini extraction of the uploaded synthetic email receipt returned EXTRACTED
  with the expected USD 300.00 total.

Direct live SerpApi search returned five validated USD price observations. Search
listings retain unknown identity, stock, shipping and condition; no savings claim
or deployed SerpApi worker job is inferred. Bright Data collection completed, but
the tested pages lacked a usable current price and were correctly rejected.

## Outstanding release checks

- Clean Nessie sandbox purchase creation and deployed import now pass. The old
  malformed account is retained but excluded from the clean demo customer.
- The complete live Nessie-to-simulated-refund flow still needs verified retail
  evidence, fresh receipt extraction and completed correlated sandbox deposits.
  The deterministic API/worker/refund integration flow passes with mocked providers;
  it must remain labeled offline replay.

Historical local PostgreSQL-driver validation used a temporary PostgreSQL 14.21
server: three integration/driver tests passed and test schemas were dropped.
GitHub CI configures PostgreSQL 16.10. These historical checks do not establish a
complete deployed live-provider release.


## Backend completion pass

- Current real PostgreSQL 14.21 run: migration 001/002, migration replay, database pool
  recovery and all five backend integration tests passed (six tests total).
- SerpApi observations persisted under SERPAPI in both offers and history; uncertain
  listings created zero savings opportunities.
- Current `live-deployment-checks.json` passes authenticated reads, verified database
  TLS/migration checks, receipt read-back, prior extraction totals and cross-instance
  persistence. Its worker result explicitly reuses a completed connectivity probe.
- Remote main CI was green at `c1a5c04` (run 39075420858), before these final backend fixes.
- Fresh live Gemini evaluation was attempted on three synthetic EMAIL examples.
  All three requests returned provider HTTP 503; no extraction behavior or accuracy
  conclusion can be drawn from that run. See live-receipt-evaluation.json. The earlier
  successful live receipt extraction remains historical evidence, not a current
  provider availability guarantee.
- The backend demo collection now asserts successful responses, captures uploaded
  document/receipt/case IDs, and checks the document checksum. DEMO.md documents
  individual request order and the boundary between live checks and offline replay.

The supplied https://nessieisreal.com site publishes the same production API origin
used by the application. Clean sandbox provisioning resolved the demo import blocker. NESSIE_BLOCKER.md
records the diagnosis and corrected creation fields.
- Unidentified SerpApi listings now receive distinct source-and-URL price-history
  keys; two separate products no longer share a `model:null` history stream.


## Nessie sandbox resolution

A fresh synthetic customer/checking account was provisioned without deleting older
records. Purchase creation accepted `purchase_date` and explicit `status: completed`;
it rejected `transaction_date` as an extra creation field. The completed USD 300
synthetic purchase was read back, bound to the test user, and imported through the
deployed authenticated sync route (HTTP 200, job SUCCEEDED, one transaction saved).
No real money moved. See live-nessie-checks.json. Provider support is not needed to
continue using this clean demo account. The original account's invalid records were
not repaired, and the full receipt/retail/refund flow is still not claimed as passed.
