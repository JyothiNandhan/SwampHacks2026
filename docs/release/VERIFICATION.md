# Verification record — October 17, 2026

## Current local checks

- `pnpm check`: version pins, contracts, workspace types, 172 tests and backend builds passed.
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
- Live Gemini extraction of the uploaded synthetic email receipt returned EXTRACTED
  with the expected USD 300.00 total.

Direct live SerpApi search returned five validated USD price observations. Search
listings retain unknown identity, stock, shipping and condition; no savings claim
or deployed SerpApi worker job is inferred. Bright Data collection completed, but
the tested pages lacked a usable current price and were correctly rejected.

## Outstanding release checks

- Repeat receipt checksum verification after the API switches to a different instance.
- Nessie sandbox purchase listing still returns HTTP 400 with a missing Purchase.status
  validation error. Customer/account setup succeeded; purchase import has not passed.
- The complete live Nessie-to-simulated-refund flow remains blocked by that upstream error.
  The deterministic API/worker/refund integration flow passes with mocked providers;
  it must remain labeled offline replay.

Historical local PostgreSQL-driver validation used a temporary PostgreSQL 14.21
server: three integration/driver tests passed and test schemas were dropped.
GitHub CI configures PostgreSQL 16.10. These historical checks do not establish a
complete deployed live-provider release.
