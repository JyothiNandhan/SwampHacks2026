# Verification record — October 17, 2026

## Current checks

- `pnpm check`: version pins, contracts, workspace types, **179 tests** and backend builds passed. One optional PostgreSQL-driver test was skipped by this run.
- Separate PostgreSQL 14.21 run: migrations 001/002, migration replay, database recovery and six backend integration tests passed (**7 tests**). CI uses PostgreSQL 16.10.
- Synthetic regression evaluation: 15/15 expectations passed. No real-world OCR accuracy is claimed.
- Docker is unavailable locally; no local image test is claimed.

## Deployed checks

The public API returned HTTP 200 at commit `5798b7356673e7aa8c8fe96cfd1f9dd5a229e906`.

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

## Deployed retail follow-up

The real Railway worker at `79db2b0` completed one fresh job on its first attempt,
saving five price observations. It created no eligible offer or opportunity; this
is a successful job transport check, not a completed priced recovery flow. See
live-priced-worker-checks.json.

The search query missed retailer quotes when the receipt used F91W-1 and repeated
the product brand/name. A bounded fallback now tries model punctuation and a shorter
product-kind query. Exact model matching normalizes punctuation consistently; it
still requires independent product, price, stock, condition and shipping evidence.
The updated local orchestrator passed against both live providers: six observations,
one verified Walmart F91W-1 offer at 2,192 cents plus 699 cents shipping. See
live-retail-orchestrator-checks.json. This local provider check writes no offers or
refunds; deploy the follow-up fix before repeating the priced worker check.

Nessie's official DepositCreate schema defines amount as an integer. The current
33-dollar purchase versus 28.91-dollar delivered offer yields a 4.09-dollar expected
refund. A whole-dollar deposit cannot fully confirm that amount. The application
must retain the exact expected amount and leave any unmatched remainder pending.
No deposit or completed live refund is claimed by this check.

## Current deployment and seller guard

The API is now serving 5798b73. A fresh deployed job for a separate clearly synthetic
USD 40 purchase and matched receipt (item USD 38.91, tax USD 1.09) succeeded on its
first attempt, saved five observations and created zero eligible offers/opportunities.
See live-priced-worker-followup.json. The earlier USD 21.92 + 6.99 quote is historical;
a refreshed exact-product quote now names a marketplace seller at USD 28.99 with free
shipping. Other current search results name unsupported retailers or different models.
Neither an old price nor a different seller establishes a current eligible offer.

A follow-up guard now permits cross-provider shipping enrichment only for explicitly
verified first-party Walmart offers. SerpApi must name Walmart with selectedSellerId=0;
Bright Data must actually report seller Walmart.com/Walmart. A requested URL selector
alone does not establish the scraped seller. Marketplace, unknown-seller and Amazon
shipping joins remain unsupported; a provider's own complete offer can still be used.
Price, model, condition, stock and freshness gates remain in force. Tests verify a
same-product/same-price seller mismatch is rejected before persistence or replay
short-circuiting. Deploy this guard on the API service.

The live priced recovery and simulated-refund gate remains open pending a current
compatible offer. No sandbox deposit was created and no completed live refund is
claimed. The prepared USD 40 fixture would produce a USD 10 expectation only if a
current verified delivered price is USD 28.91; expected refund amounts are never
rounded or rewritten to make the sandbox confirm.
