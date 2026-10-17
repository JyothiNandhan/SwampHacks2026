# MoneyBack OS — Canonical Shared Context for Each Teammate's GPT

**COPY THE ENTIRE FILE TO YOUR PERSONAL GPT CHAT AT THE START. Do not let your GPT invent a different architecture, package versions or team ownership.**

## Mission
Build a backend-first, autonomous post-purchase financial recovery prototype for SwampHacks XII / Capital One Nessie. Users' *simulated* bank transactions are reconciled to authorized email receipts or photographed paper receipts. Product identity and purchase conditions are extracted, offers monitored, recoveries estimated, requests prepared for explicit user approval, and matching test refunds reconciled. Additional recurring fees, car-rental invoice variances, warranties and textbook/gift-card/rental deadlines reuse the same services. Not a generic chatbot.

## Team roles
- **Rishav:** repo/toolchain freeze, API/server, Nessie, Tiger Data, migrations, subscriptions, final integration.
- **Anish:** Gemini receipt extraction incl camera uploads, duplicate physical/digital receipts, matching, return/warranty terms, billing/overcharge analysis.
- **Rishithaaa:** recovery cases, missing refund matching, timeline, notifications, textbook/gift-card/car-rental deadlines.
- **Nandhan:** Best Buy Products API, Bright Data datasets scraper, product equivalence, offer monitoring, worker jobs.
Frontend/Vercel postponed until backend stable. Rishithaaa and Nandhan roles were deliberately swapped from an earlier plan. **Do not reverse them.**

## Mandatory decisions
- TypeScript monorepo; `apps/api` Fastify on Railway; `apps/worker` scheduled Railway job; `packages/db` Tiger Data PostgreSQL; `packages/contracts` shared types; `apps/web` reserved for future Vercel Next.js/React/Auth0.
- `pnpm` with a single root lockfile. `config/technology-versions.json`, `pnpm-workspace.yaml`, package manifests, `.nvmrc` are authoritative. NEVER use `latest`, caret (`^`), or tilde (`~`) package specifiers; package changes by reviewed PR only. API credentials only in `.env` and provider secrets.
- Root `README.md` gives authoritative task numbering, dependencies, ownership and what **MERGED** means. A push of an unmerged branch doesn't unblock others. A developer may build against fixtures while waiting for integration prerequisites.
- Rishav is sole owner of `packages/contracts`, `packages/db` migrations, root dependency config and API `server.ts` unless another change is explicitly coordinated.
- API routes must be module-local and registered centrally by Rishav. Expose unit tests for each module. No one edits another person's module to fix integration bugs without coordinating.

## External integrations and limitations
- **Capital One Nessie:** simulated customer/account/purchase/merchant/bill/deposit data. Read purchases via `/accounts/{id}/purchases`, bills via `/accounts/{id}/bills`, deposits via `/accounts/{id}/deposits`. POSTs seed demo fixtures under configured sandbox accounts. Nessie does NOT provide itemized receipts, real retailer return rules, or a real merchant refund API. Verify actual API payloads and current console docs.
- **Best Buy Products API:** official Best Buy catalog and product SKU/price/availability; product search, SKU lookup. No private Best Buy order history. Key server-side.
- **Bright Data Dataset API:** supported retailer product scrapers; configure dataset ID per retailer, request snapshot and poll result if asynchronous. Not a universal live cross-retailer API. Store source URL, timestamp and product condition.
- **Gemini `@google/genai`:** structured receipt/terms extraction, uncertain matching explanations, evidence-grounded draft requests. Never use AI outputs alone to approve a refund, deem a paper receipt safe to destroy, or calculate money. Keep original PDFs/images privately stored.
- **Tiger Data:** SQL relations for finance data, time-stamped price observations and event history. Use integer cents, ISO timestamps, idempotent upsert and unique external identifiers. Restrict records by user.
- **Auth0:** future Vercel Next.js login. Secure Railway backend APIs NOW using access-token checks or demo-only protected access. Do not expose credentialed endpoints publicly.
- **GoDaddy domain, Solana:** optional later; must never block the main Nessie recovery demo.

## Shared contracts and process
- Single purchase canonical model: user → bank transaction ↔ merchant order → line items → receipt evidence → policy → offers → opportunity → case → verified outcome.
- Multiple receipt sources may refer to one order. Deduplicate *purchase records* while preserving unique source evidence. Physical-paper disposal is a conservative recommendation, not automatic deletion.
- Opportunity calculation: expected original refundable amount minus replacement total and extra incremental costs; only when product equivalence/return terms permit. If eligibility unknown, label `REVIEW_REQUIRED`.
- Refund is not `CONFIRMED` just because any equal-amount deposit exists. Link a specific simulated deposit to a specific test refund expectation, avoid double-counting.
- States: `DETECTED`, `REVIEW`, `APPROVED`, `SUBMITTED`, `PENDING`, `CONFIRMED`, `REJECTED`, `EXPIRED`. Internal statuses are not proof merchant accepted an action.
- Every scheduler is idempotent, rate limited, logs request IDs but not passwords/tokens/personal receipt text.
- Stable error shape `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`.
- Unit tests must include ambiguous receipts, mismatched SKU, stale offers, partial refund, unrelated deposit, unusual but legitimate subscription charge, and fee differences unsupported by rental agreement.

## MVP demonstration
1. Create/read **real Nessie sandbox** $300 watch purchase.
2. Upload synthetic photo/email receipt; Gemini extracts line item and matching engine links to Nessie purchase.
3. Best Buy and/or Bright Data returns a verified comparable product price or a clearly labeled replay offer.
4. Monitoring worker creates one price opportunity with calculation and evidence.
5. Case generator prepares a request; user approves action in protected API test.
6. A *simulated* Nessie deposit is matched to the case; recoveries dashboard count updates once.
7. Show secondary tests: subscription hike, rental overcharge, warranty, textbook/rental deadline, gift-card terms.

## Instructions for the GPT assisting a teammate
1. First ask the developer **which team member and task ID** they are implementing, unless they already provided them.
2. Respect the exact folder ownership and prerequisites in `README.md`. If a dependency PR has not merged, implement against fixtures and clearly identify the integration wait.
3. Generate changes only for owned module paths; if shared contract/migration is required, draft a request for Rishav instead of editing it.
4. Use dependency versions from the configuration and pnpm lockfile, not whatever SDK your memory suggests. Check installed SDK types in repo for correctness.
5. Provide code, module-local tests, a reproducible request example, expected result, required env keys, and a PR handoff checklist.
6. Do not tell the teammate a simulated refund or scraped product offer is a confirmed real-world customer entitlement.

## Current source of truth
`README.md` (plan and task gates), `TASK_TRACKER.csv` (machine-sortable ownership/dependencies), `config/technology-versions.json` (toolchain/direct dependency pins), `SETUP_AND_VERSIONS.md` (installation), root `pnpm-lock.yaml` (when generated on Rishav's machine).


## ADDENDUM — TWO CLIENTS (WEBSITE + BROWSER EXTENSION)
**Updated product scope:** MoneyBack OS will provide **(a)** a Next.js website dashboard deployed on Vercel and **(b)** a Chrome/Edge browser extension using Manifest V3. Both connect to the SAME secure Railway backend and Tiger Data database. The dashboard is the financial control center; the extension is an optional, user-triggered evidence capture and notification companion. Neither is a separate backend.

**Sequence remains backend-first.** Existing tasks T01–T25 remain unchanged; after backend readiness gate T24, frontend development runs in parallel with shared contracts. Do not infer that the extension can see an itemized bank purchase or automatically access every retailer.

### Client feature division
| Website dashboard (`apps/web`) | Browser extension (`apps/extension`) |
|---|---|
| Auth0 login and protected session | Explicit login/authorization handshake with backend |
| Purchases, evidence, timelines | User-approved capture preview on supported retailer pages |
| Price charts and cross-retailer offers | Small price-drop badge / link to full website |
| Recovery Action Center / approval | Link to website Recovery Center, no auto-purchases or auto-refunds |
| Subscription alerts, warranties and deadlines | Optional browser notification of existing server alert |
| Receipt upload/photo and duplicate review | Capture current page receipt/order details if accessible |

### Post-backend work packages: owners and merge blockers
| ID | Owner | Work | WAIT FOR MERGE |
|---|---|---|---|
| **F01** | **Rishav** | Freeze client-facing OpenAPI/auth/capture contracts, secure per-user tokens, limited-scope capture endpoints, CORS rules and test fixtures | T24 |
| **F02** | **Rishithaaa** | Next.js Vercel dashboard skeleton: Auth0 login, home, purchases, opportunity/recovery pages with mock contract data | F01 |
| **F03** | **Nandhan** | Manifest V3 extension skeleton: action popup, explicit capture preview, backend client, no broad site permissions | F01 |
| **F04** | **Anish** | Retail/order capture parsing normalization + evidence extraction tests; shared validation of physical/email/extension captures | F01 |
| **F05** | **Rishav** | Integrate F04 capture with account-scoped API, rate limits, permission checks, secure event provenance | F01 + F04 |
| **F06** | **Nandhan** | Connect extension confirmation to live capture APIs and add backend alert display | F03 + F05 |
| **F07** | **Rishithaaa** | Wire live purchase/recovery APIs into Vercel dashboard; responsive QA | F02 + F05 |
| **F08** | **All** | Test website and extension together; cross-browser permission tests, consent and rejection cases, demo rehearsal | F06 + F07 |

**Parallel rule:** F02, F03 and F04 can run in parallel immediately after F01 merges. F05 waits for F04's merge; F06/F07 wait for F05's merge. Rishav remains API/auth owner; Nandhan owns the extension client, Rishithaaa owns the dashboard client, Anish owns capture parsing. This is a POST-BACKEND reassignment only; backend roles in T01–T25 do not change.

**Safety and consent:** No automatic scraping of arbitrary browsing pages, background capture of personal data, cookie theft, silent uploading, or merchant checkout. Store only user-approved purchase evidence and source metadata. Provide delete/withdraw controls.


## CANONICAL VARIABLE/SCHEMA CONTRACT ADDENDUM
Before coding, read `TEAM_INTEGRATION_RULES.md`, `config/naming-conventions.md`, `config/api-contract.json`, and `packages/contracts/src/index.ts`. **Use these exact names and Zod schemas.** All backend modules must validate inputs/outputs; never invent local synonyms for shared fields. Contract changes require Rishav's reviewed merge.
