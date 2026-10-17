# Backend-only demo runbook

## Verified today

- Railway API, authenticated reads, database TLS and migrations.
- Clean Nessie sandbox completed purchase creation and deployed transaction import.
- Worker connectivity (synthetic itemless probe; no retailer or savings claim).
- Private receipt upload, live Gemini extraction and unchanged file checksum after redeployment.
- SerpApi returns priced observations; unknown identity/stock/shipping block automatic savings.
- Offline receipt-to-simulated-refund integration passes against actual PostgreSQL.

## 1. Safe deployed walkthrough

Import `MoneyBack.postman_collection.json` into Postman. Set `accessToken` privately
and leave `baseUrl` at the deployed API. Select requests individually; the collection
contains mutation endpoints and is not an unattended release runner.

1. Send **GET /health**. No token is needed; expect status `ok`.
2. Send **GET /purchases** with your token. An empty account is valid; do not substitute demo data.
3. Send **POST /documents** with a supported synthetic receipt encoded as Base64.
   The collection saves `originalFileId` and checksum locally for subsequent requests.
4. Send **GET /documents/:originalFileId**; its test compares the saved checksum.
5. Send **POST /receipts/ingest** with EMAIL, PHOTO or PDF matching the file MIME type.
   The collection saves the returned `receiptId`. Inspect EXTRACTED versus REVIEW.
6. Redeploy the API, then repeat the document GET to demonstrate volume persistence.
7. GET subscriptions, notifications and deadlines as read-only account views.

Do not expose tokens, raw receipts, bank identifiers or credentialed provider URLs
in demo screenshots. Log screenshots should show request IDs and safe status/error
codes. Railway dashboard logs must be captured by the project owner; no fabricated
Railway log screenshot is supplied by these automated checks.

## 2. Reproducible checks from the repository

```sh
pnpm check
pnpm --filter @moneyback/api test:release
node --env-file=.env.verify scripts/verify-live.mjs --worker --documents --require-persistence
node --env-file=.env.verify scripts/evaluate-live-receipts.mjs
```

The live verification script uses ignored state from its first upload; preserve that
state across API redeployments. A reused completed worker job is explicitly labeled.
The live receipt evaluation uses synthetic emails, not a real-world OCR corpus.
Never publish `.env.verify`, the state file or private provider response artifacts.

## 3. Full recovery demonstration: currently offline replay

The release test exercises Nessie-shaped purchases → receipt → item match → policy
→ priced offer → worker → opportunity → explicit user approval → staff-authorized
simulated submission → completed correlated deposits → simulated refund confirmation.
Provider HTTP responses are fixtures; PostgreSQL persistence and worker execution are
real. Label this **offline replay with simulated reimbursements** in the presentation.

The clean sandbox purchase import now passes; the full live equivalent remains
unverified. NESSIE_BLOCKER.md records the corrected creation fields. A complete
live run additionally needs a fresh exact-product offer with verified model identity,
condition, shipping and stock. A search result alone cannot establish eligibility.

## Release sign-off

Keep T22/T24 open until the live bank-to-simulated-refund flow passes. Keep T25's final
presentation sign-off open until the team runs the demo and saves redacted deployment
logs. CI, local tests and a successful health endpoint do not replace those checks.
