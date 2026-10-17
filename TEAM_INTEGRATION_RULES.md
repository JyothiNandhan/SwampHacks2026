# How Four GPTs Must Work Together

Upload `TEAM_GPT_CONTEXT.md`, this file, `config/naming-conventions.md`, `config/api-contract.json` and `packages/contracts/src/index.ts` to every GPT chat. Use current GitHub `main` as the final authority.

## Ownership
- Nandhan implemented and tested T07–T19 for the Gate 1/Gate 2 delivery. Gate 3 work
  remains assigned to the contributors listed in `TASK_TRACKER.csv`.
- Rishav: shared contracts, database, Nessie, deployment, API route integration.
- Anish: documents, Gemini, policy extraction, receipt matching.
- Nandhan: Best Buy/Bright Data/price workers; later browser extension.
- Rishithaaa: recovery cases, alerts, refunds; later website dashboard.

## Hand-off protocol
1. Specify your task ID and person in the GPT prompt.
2. Check merged prerequisites in README/TASK_TRACKER.csv. Unmerged branches **never unblock** integration.
3. Implement only owned module files. Import canonical Zod schemas/types from `@moneyback/contracts`.
4. Parse external input through adapters and validate against shared Zod schemas at the boundary.
5. Add fixture + tests for contract shape and edge cases.
6. If a required field is missing: open a contract-change issue for Rishav; don't locally rename it.
7. Run `pnpm check:contracts`, `pnpm check:versions`, `pnpm check`, plus module tests, then open PR.
8. Include in PR: routes changed, schema used, fields added, migration dependency, env names, sample JSON, verification commands.

## Examples of bugs this prevents
- Anish returning `total_amount` while Rishav expects `amountCents`.
- Nandhan returning `product_price` as dollars while recovery interprets integer cents.
- Rishithaaa mistaking a Nessie deposit ID for an original purchase ID.
- Extension sending `order_id` while backend accepts `orderNumber`.

## Never do
No `as any` to bypass schema mismatch, no custom hardcoded credentials, no silent status/value renames, no frontend-to-Nessie calls, no deleting source receipts on consolidation.
