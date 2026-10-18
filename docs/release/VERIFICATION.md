# Backend verification — October 17, 2026

## Current deployed result

The public API is healthy at code commit `0fe1f8b52341a2ab78fca0b55dc6ae2c66c57567`.
GitHub CI for that commit passed. The seller-identity guard is deployed; no further
Railway variable or code deployment is required for these checks.

- Authenticated API reads, Tiger Data verified TLS and migration 001/002 checksums passed.
- Private document write/read and checksum persistence across an API instance change passed.
- The deployed receipt check reads an existing EXTRACTED synthetic receipt and checks its total; this read-back is not a fresh Gemini request.
- Earlier direct Gemini 3.5 Flash evaluation passed 3/3 synthetic EMAIL cases. Fresh deployed extraction and matching also passed for the synthetic USD 40 receipt: item USD 38.91, tax USD 1.09. Earlier transient extraction failures were retried; availability is not guaranteed.
- A fresh deployed retail worker batch for two synthetic purchases SUCCEEDED on its first attempt. It produced ten observations and zero price opportunities. See live-seller-deployment-checks.json; its `observations` field is cumulative for the target purchase, while `jobObservations` counts this execution.

## Live bank-refund reconciliation: passed with operator fixture

The deployed billing comparison API compared two clearly synthetic, uploaded documents:
agreed total USD 30 versus final total USD 40. It returned a verified USD 10 difference.
The billing route returns a comparison; it does not automatically create an opportunity.
A trusted operator provisioned an OVERBILLING test opportunity using those two evidence
records and an explicit SYNTHETIC_RECONCILIATION_TEST_PROVISIONED audit event.

The normal deployed case endpoint then created the case, explicit synthetic-test
approval was recorded, and the trusted operator recorded a simulated submission/reference.
A completed USD 10 Nessie sandbox deposit was created, read back, imported via the
public authenticated sync route and reconciled. Results:

- Case CONFIRMED; expected 1,000 cents, confirmed 1,000 cents; simulated true.
- Repeat reconciliation returned the same single refund allocation.
- Exactly one SIMULATED_REFUND_CONFIRMED audit event exists.
- No real money moved.

See live-billing-refund-setup.json and live-billing-refund-checks.json. This verifies
live Nessie reconciliation with an operator-provisioned fixture. It does **not**
establish automatic billing-opportunity generation or a successful retail-to-refund flow.

## Retail eligibility: live positive path remains open

Current searches and the refreshed exact-product quote do not establish an eligible
same-product/same-seller offer. The historical USD 21.92 + 6.99 Casio quote changed;
a refreshed quote named a marketplace seller at USD 28.99 with free shipping. Other
candidates had different models, sellers or prices. Older successful direct-provider
reports remain historical observations, not current savings evidence.

Cross-provider shipping enrichment requires explicitly verified first-party Walmart
identity from both providers, the same Walmart product and identical USD price.
Bright Data must report the actual seller as Walmart/Walmart.com; a requested URL
selector does not establish the scraped seller. SerpApi must name Walmart with
selectedSellerId=0. Unknown/marketplace sellers and Amazon shipping enrichment remain
unsupported. A provider's own complete offer can still be evaluated. Model, condition,
stock and one-hour freshness checks remain required.

The worker completed correctly and created zero price opportunities. T24's complete
live priced offer → opportunity → case → simulated refund demonstration remains
unverified until a current compatible offer is available. The independent billing
fixture above does not close this gate.

## Local checks and handoff

- `pnpm check`: version pins, contracts, types, 179 tests and backend builds passed;
  one optional PostgreSQL-driver test was skipped in that run.
- Prior separate PostgreSQL 14.21 run: migrations, replay, recovery and integration
  smoke passed seven tests. CI uses PostgreSQL 16.10.
- Synthetic receipt/duplicate/policy regression evaluation passed 15/15 expectations.
  No real-world photographed-receipt accuracy is claimed.
- Offline replay verifies the full retail recovery path, partial allocation, unrelated
  deposit rejection, ownership and idempotency. Its providers are fixtures.
- Docker is unavailable locally; deployed Railway builds succeeded.
- T25 still needs the team's final demo and redacted Railway request logs/screenshots.
  The attached user screenshots show deployment status, not API request-log evidence.

Nessie documents integer deposit amounts. The USD 40 fixture preserves its item/tax
breakdown; expected refunds are never rounded or rewritten to force confirmation.
All private IDs, raw documents and credentials remain in ignored local state.
