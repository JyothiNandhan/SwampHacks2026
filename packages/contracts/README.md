# Shared contracts v1.0.0

`src/index.ts` is the authoritative boundary for JSON. Import schemas and inferred types from `@moneyback/contracts`; parse adapter results before passing them to other modules. `fixtures/` contains synthetic, linked examples, including a **FIXTURE** offer and a pending **simulated** refund. They represent no real purchase, policy entitlement or recovery.

Amounts are nonnegative 32-bit integer cents in USD, compatible with PostgreSQL INTEGER. Unknown extracted values remain null. Time fields require an ISO timestamp with timezone. Objects reject unknown fields. IDs are opaque strings; database adapters generate UUID internal IDs and retain provider IDs separately. Fields such as `userId` must come from authenticated server context, never the request body.

`config/api-contract.json` freezes the `/api/v1` routes, request schemas, response schemas, owners and security requirements. `/health` alone has no prefix. Single responses use `{ data }`, lists use `{ data, nextCursor }`, and errors use `{ error: { code, message, requestId } }`. Route ID parameters are validated with `Id`; lists use opaque cursors. Error messages must not expose provider credentials or raw document data. These are contracts for future endpoints, not implemented financial routes. Extension capture remains behind F01.

The earlier README's target paths are planning examples. The route registry is canonical: receipt extraction uses `/receipts/ingest`; deduplication uses `/receipts/:receiptId/consolidate`; offer lookup uses `/offers/:purchaseId`; the protected demo trigger uses `/monitoring/prices/run`; timeline uses `/purchases/:purchaseId/timeline`.

Schema validation establishes shape, not business eligibility. Future services must verify tenant ownership, exact product identity, offer freshness, source-backed policy decisions, explicit approval, and specific deposit evidence. Partial amounts are allowed; an equal-amount deposit alone is insufficient. State transitions belong to T07.

Run `pnpm --filter @moneyback/contracts test` and `pnpm check:contracts`. Change contracts, fixtures and registry together through a reviewed versioned PR. Database adapters aggregate purchase items, receipt IDs and evidence IDs from relational tables.
