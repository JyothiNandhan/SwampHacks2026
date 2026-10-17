# Verification record — October 17, 2026

## Current checks

- `pnpm check`: version pins, contracts, workspace types, **177 tests** and backend builds passed. One optional PostgreSQL-driver test was skipped by this run.
- Separate PostgreSQL 14.21 run: migrations 001/002, migration replay, database recovery and six backend integration tests passed (**7 tests**). CI uses PostgreSQL 16.10.
- Synthetic regression evaluation: 15/15 expectations passed. No real-world OCR accuracy is claimed.
- Docker is unavailable locally; no local image test is claimed.

## Deployed checks

The public API returned HTTP 200 at commit `0c714a7a9aa5c2bab74cb03f2375d32cb3806735`.

- Authenticated reads, verified Tiger Data TLS and migration checksums passed.
- Real Railway worker consumed an itemless synthetic connectivity probe. This does not establish retailer execution.
- Private receipt upload/read-back and identical checksum after an API instance change passed.
- Clean Nessie synthetic completed USD 300 purchase creation and deployed import passed. The original malformed account was preserved.
- The imported bank transaction matched its synthetic receipt: CONFIRMED, one item, correct amount, purchase created. See live-bank-receipt-checks.json.
- Gemini `gemini-3.5-flash` passed **3/3** direct live synthetic EMAIL checks: complete receipt extracted; non-receipt injection and uncertain currency/timezone held for review. The deployed API also extracted the synthetic bank receipt. The prior `gemini-3.8-flash` 503 run is superseded; no real photo corpus was evaluated.

## Live retail checks and implementation

Bright Data's Walmart snapshot returned Casio F91W-1, NEW, in stock, USD 21.92. Shipping was absent and remained unknown. A separate SerpApi Google Product quote returned the same Walmart product ID and price, explicit USD 6.99 shipping and in-stock status. See live-retail-checks.json. These are direct provider checks, not a deployed priced worker pass.

The updated integration discovers supported retailer URLs through product quotes, verifies model/condition/stock using Bright Data, and joins shipping only for the same retailer product and identical price. It stores both evidence records and their provenance. Conditional free shipping, conflicting model claims, stale quotes and mismatched prices remain ineligible. Search listings alone cannot create savings. Worker request timeout is 180 seconds for asynchronous collection; keep demo batches small.

## Remaining release gate

Deploy the new retail integration on both Railway services before testing a priced worker job. Configure `SERPAPI_API_KEY`, `BRIGHTDATA_API_KEY`, `BRIGHTDATA_WALMART_DATASET_ID=gd_l95fol7l1ru6rlo116` and `GEMINI_MODEL=gemini-3.5-flash` on the API. The worker delegates provider requests to the API.

The full live priced opportunity → approved case → correlated completed simulated deposit → confirmed refund remains unverified. Nessie rounded a USD 33.91 test purchase to USD 33; use read-back amounts and a compatible exact test scenario, never alter refund arithmetic to force confirmation. All bank tests are synthetic; no real money moved.

Offline replay verifies the complete recovery path, partial allocations, unrelated-deposit rejection, ownership and idempotency. T22/T24 live sign-off and T25's final team demo/redacted Railway logs remain open. A Railway compute sandbox is unrelated to the Nessie banking sandbox and is not required for these checks.
