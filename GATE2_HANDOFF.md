# Gate 2 offline handoff (T12–T19)

All files in this handoff are local and uncommitted. No branch was pushed.

## Implemented

- **T12:** `modules/matching/purchase-integration.ts` wires explainable receipt matching to atomic, user-scoped Tiger Data persistence for purchases, receipt links, normalized items, evidence, and transaction match state.
- **T13:** `modules/documents/policy-parser.ts` extracts explicit return/warranty/rental/textbook terms, dates, exclusions, checksums, source excerpts, and conservative eligibility.
- **T14:** `modules/retail/price-monitor.ts` requires exact SKU/GTIN/model identity, validates freshness, includes shipping in net price, records history, and deduplicates open price-drop opportunities.
- **T15:** `modules/recovery/refund-reconciliation.ts` supports partial, late, and missing simulated refunds and rejects unrelated equal-amount deposits.
- **T16:** `modules/banking/subscription-monitor.ts` alerts only from consecutive supported recurring observations for the same merchant/plan.
- **T17:** `modules/documents/billing-comparison.ts` detects rental line changes and uncited fees without overstating eligibility.
- **T18:** `modules/recovery/timeline.ts` creates evidence-backed return, warranty, rental, textbook, and gift-card deadlines/events/notifications.
- **T19:** `apps/worker` now contains a PostgreSQL queue runner, `SKIP LOCKED` claims, stable idempotency keys, authenticated admin/demo trigger service, capped exponential retry, sanitized failures, Railway configuration, and a long-running runtime.

## Verification

Run from repository root:

```bash
pnpm check
pnpm --filter @moneyback/api example:gate2
```

The Gate 2 persistence suite runs the actual migration in PGlite. Provider adapters remain
mocked so CI is deterministic and secrets are never required.

## Manual/live setup still required

These are deployment inputs, not missing Gate 2 business logic:

1. Set `DATABASE_URL`, `INTERNAL_API_URL`, and a new random 16+ character `INTERNAL_WORKER_TOKEN` in Railway.
2. Configure Best Buy/Bright Data credentials and valid retailer dataset IDs for live T21 tests. Rotate any credentials previously pasted into chat.
3. T20 must register authentication/authorization routes; T21 must expose the internal price execution endpoint and connect live purchase/policy/case services.
4. Deployments, commits, merges, and pushes were intentionally not performed.

## Contribution attribution

Nandhan implemented and tested T12–T19. Gate 3 remains available for the other team
members according to the main project tracker.

Shared package and lockfile edits should be applied once, not copied independently into four commits.
