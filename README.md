# MoneyBack OS — Backend-First Team Execution Plan

**Four developers · Capital One Nessie hackathon · Backend first · Frontend later**

## What we are building
An autonomous post-purchase recovery service. A Nessie purchase is reconciled to an email/photo receipt, mapped to an exact item, monitored against Best Buy and Bright Data offers, evaluated against return terms, turned into a user-approved recovery case, and optionally reconciled to a *simulated* incoming Nessie deposit. Additional capabilities include refunds, subscriptions, charges, warranties, paper-receipt deduplication, and textbook / gift-card / rental deadlines. No chatbot is required for the core workflow.

## Gate 3 and later ownership

Nandhan implemented and tested T07–T19. The table below describes ownership for the
remaining Gate 3 and later integration work.
| Member | Owned code | Accountable deliverables |
|---|---|---|
| **Rishav** | `apps/api/src/modules/banking/`, `apps/api/src/modules/subscriptions/`, `apps/api/src/server.ts`, `packages/db/`, `packages/contracts/`, CI/repo setup | Nessie purchases/bills/deposits, Tiger Data schema, server/integration, subscription changes |
| **Anish** | `apps/api/src/modules/documents/`, `matching/`, `policies/`, `billing/` | Gemini receipt photo/email extraction, bank matching, paper/digital duplicate grouping, evidence retention, returns/warranties and rental invoice comparisons |
| **Rishithaaa** | `apps/api/src/modules/recovery/`, `deadlines/`, `timeline/`, `notifications/` | Recovery Action Center API, missing refund checks, approvals/state machine, purchase timeline, textbook/gift-card/rental reminders |
| **Nandhan** | `apps/api/src/modules/retail/`, `opportunities/`, `apps/worker/` | Best Buy API, Bright Data dataset scrapers, exact SKU matching, price observations, price drops and scheduled monitors |

**Frontend:** the initial Next.js dashboard is now implemented in `apps/web/` on `frontend/moneyback-dashboard`. Run `pnpm --filter @moneyback/web dev` to explore the labeled demo or connect a per-user API token. Live purchases, opportunities and receipt extraction are connected; Auth0, case/notification history and the full Nessie bank-to-refund gate remain pending.

## Ground rules
- One shared repository and one root `pnpm-lock.yaml`. Do **not** commit `package-lock.json`, `yarn.lock`, or a second lockfile.
- A prerequisite labelled **MERGED** means its PR is merged to `main` *and required GitHub CI checks passed*. Pushing a feature branch alone does **not** unblock downstream integration.
- Developers may prototype independent logic and test with fixtures before a dependency is merged; they must **WAIT** before wiring an integration that consumes unmerged contracts, migrations, or production service functions.
- Only **Rishav** edits `packages/contracts`, `packages/db` migrations, root tooling or `apps/api/src/server.ts`, except an explicitly reviewed coordination PR.
- Each teammate implements endpoints only inside their module and exports `registerXRoutes` plus service functions. Rishav connects routes in the server.
- Use cents for currency, ISO-8601 timestamps, unique external source IDs, idempotent imports, safe logs, user-scoped authorization, and source-backed policy decisions.
- Nessie does **not** supply itemized receipts or perform merchant refunds; simulated deposits prove *test inflows*, not real refunds. Best Buy and Bright Data offer data can be delayed or incomplete.

## How to read the schedule
`START`: no code dependency. `AFTER X`: **WAIT FOR MERGE** of X for integration work. `PARALLEL`: safe with fixtures or after shared contract freeze. Every task gets a PR named `TNN: ...`, tests, and documented verification.

### Gate 0 — Common foundation
| ID | Owner | Exact task and merge acceptance | Wait for merge | Can work in parallel? |
|---|---|---|---|---|
| **T01** | Rishav | Commit common config, workspaces, CI, backend skeleton, dev commands, exact versions; generate and commit `pnpm-lock.yaml` on internet-connected laptop | START | Others can prepare notes/fixtures offline |
| **T02** | Rishav | Freeze `packages/contracts`: purchase, receipt, item, offer, policy, opportunity, refund, event schemas and HTTP response/error structures; add sample JSON fixtures | T01 | Other members review drafts |
| **T03** | Rishav | Tiger Data migrations: users, accounts, transactions, receipts, orders/items, evidence, policies, offers/time series, cases, refunds, subscriptions, jobs/events | T02 | AI/retail modules develop against JSON fixtures |

### Gate 1 — Independent modules (parallel after T02)
| ID | Owner | Exact task and acceptance | Wait for merge | Parallel? |
|---|---|---|---|---|
| **T04** | Rishav | Fastify server, `/health`, typed config, database pool, Nessie GET client and error tests | T02 | Yes |
| **T05** | Anish | Gemini extractor for photographed/emailed receipts (merchant/date/total/items/model), validated JSON plus raw evidence; fixture-based tests | T02 | Yes |
| **T06** | Nandhan | Best Buy product search/SKU adapter; normalize product offer, validate link and timestamp, test with mocked API | T02 | Yes |
| **T07** | Nandhan | Recovery case state machine (`DETECTED→REVIEW→APPROVED→SUBMITTED→PENDING→CONFIRMED/REJECTED/EXPIRED`); no agent-driven auto-submission | T02 | Yes |
| **T08** | Nandhan | Nessie customers/accounts/purchases/merchants/bills/deposits import; idempotent upserts into Tiger Data | T03 + T04 | Yes with T09–T11 |
| **T09** | Nandhan | Match extracted receipts to Nessie-format fixture payments; detect duplicate paper scans/emails; retain originals and flag paper-keep warnings | T05 | Yes, integration to real bank waits T08 |
| **T10** | Nandhan | Bright Data scraper adapter (`datasets/v3` with configured dataset per retailer), asynchronous snapshot polling and normalized offers | T06 | Yes |
| **T11** | Nandhan | Evidence-backed recovery recommendation, action drafting, approval audit, notification record model | T07 | Yes |

### Gate 2 — Functional integration
| ID | Owner | Exact task and acceptance | Wait for merge | Parallel? |
|---|---|---|---|---|
| **T12** | Nandhan | Wire real purchase imports to the receipt matcher, persist normalized orders/items and evidence | T08 + T09 | Other integrations continue |
| **T13** | Nandhan | Parse return/warranty terms incl. dates and exclusions, preserve citation/evidence, conservative retention categorization | T05 | Yes |
| **T14** | Nandhan | Exact-product comparison, offer freshness, price history, arithmetic net savings & deduplicated price-drop opportunities | T10 + T03 | Yes; policy gating waits T13 |
| **T15** | Nandhan | Refund expectation + partial/late/missing refund reconciliation against Nessie-format deposit fixtures; reject unrelated equal-amount deposits | T11 | Yes; live Nessie awaits T08 |
| **T16** | Nandhan | Subscription price-change service from Nessie bill/purchase history; alert only on supported changes | T08 | Yes |
| **T17** | Nandhan | Compare rental agreement to final bill, detect changed lines and unverified fees; tests | T13 | Yes |
| **T18** | Nandhan | Timeline/events, textbook due dates, rental return time, gift-card terms; notifications and source evidence | T11 + T13 | Yes |
| **T19** | Nandhan | Railway price/monitor worker; scheduled jobs and manual **authenticated demo trigger**, retry/backoff, idempotency | T14 | Yes |

### Gate 3 — End-to-end APIs and release
| ID | Owner | Exact task and acceptance | Wait for merge | Parallel? |
|---|---|---|---|---|
| **T20** | Rishav | Register module routes; secure auth middleware, authz and env validation; expose OpenAPI docs; deploy backend to Railway | T12 + T14 + T15 + T16 + T17 + T18 | Can prep deployment early; live wiring WAIT |
| **T21** | To be assigned | Connect worker to live purchase/policy/case services; Best Buy & Bright Data integration tests, monitor replay | T19 + T20 | Wait for integration |
| **T22** | Rishithaaa | Connect recovery cases to real Nessie deposits and confirm *simulated* reimbursements only when evidence matches | T15 + T20 | Wait for integration |
| **T23** | Anish | Evaluate receipt/duplicate/policy matching, including ambiguous/incorrect papers; publish measured test outcomes | T09 + T13 + T17 | Yes |
| **T24** | Rishav | CI smoke tests: Nessie → receipt → priced item → opportunity → approved case → simulated refund; deploy stable Railway API | T20 + T21 + T22 + T23 | Release gate |
| **T25** | All | Backend-only Postman/Bruno/Swagger demo, README polish, API logs screenshots, handoff | T24 | Final backend milestone |
| **F01** | To be assigned | Begin Vercel frontend using stable OpenAPI + fixtures (no backend rewrites) | T24 | After backend validated |

**Possible parallel starts immediately after T02:** Rishav T03/T04, Anish T05, Nandhan T06, Rishithaaa T07. Don't block research, contract tests, and mock implementations while waiting for other API keys.

## Feature ownership (multiple modules make one feature)
| Feature | Primary coordinator | Others required |
|---|---|---|
| Automatic receipt & transaction matching | **Anish** | Rishav banking + schema |
| Purchase memory & financial timeline | **Rishithaaa** | Rishav transaction records; Anish evidence |
| Autonomous price-drop recovery | **Nandhan** | Anish SKU/policy; Rishithaaa case |
| Return deadline rescue | **Anish** | Rishithaaa deadline scheduler |
| AI Recovery Action Center | **Rishithaaa** | Nandhan offers; Anish policy; Rishav audit/data |
| Missing Refund Detective | **Rishithaaa** | Rishav Nessie deposits |
| Subscription Price-Hike Guardian | **Rishav** | Rishithaaa notifications |
| Hidden Charge & Overbilling Detector | **Anish** | Rishav transaction data; Rishithaaa cases |
| Warranty & Purchase Protection Agent | **Anish** | Rishithaaa reminders |
| Financial Deadline Guardian (textbook, gift-card, car-rental only) | **Rishithaaa** | Anish document extraction |
| Photo scans / duplicate hardcopy-digital receipts | **Anish** | Rishav storage and transaction matching |

## Target API service contracts (OUR OWN API, not Nessie routes)
- `GET /health` (Rishav)
- `POST /api/sync/nessie`, `GET /api/purchases`, `GET /api/subscriptions` (Rishav)
- `POST /api/receipts/extract`, `POST /api/receipts/match`, `POST /api/receipts/deduplicate`, `POST /api/policies/extract`, `POST /api/billing/compare` (Anish)
- `GET /api/retail/offers`, `POST /api/dev/monitor-prices` (Nandhan; dev trigger protected)
- `GET /api/opportunities`, `POST /api/recovery/cases`, `POST /api/recovery/cases/:id/approve`, `POST /api/refunds/reconcile`, `GET /api/timeline`, `GET /api/deadlines` (Rishithaaa)
Final method/paths and payloads are locked in T02 contracts, and changes require contract version update and reviewed PR.

## Branch, push, and unblock protocol
1. From `main`, `git pull --ff-only` then `git switch -c feature/T05-gemini-receipts` (example).
2. Edit owned module files only, run `pnpm check`, and push the feature branch. Open PR describing fixture tests, API dependencies and whether dependent tasks unblock.
3. CI green + review + **merge into `main`** = downstream dependent task may proceed. Notify the team with `MERGED T05` and commit SHA.
4. If you need a shared schema change, create an issue and ask Rishav to make a contract/migration PR FIRST. Do not silently edit another owner's files.
5. Do not delete receipts automatically, invent policies, initiate real refunds, or count mere price alerts as confirmed savings.

## Deployment and testing
- `apps/api` → Railway API; `apps/worker` → Railway cron/scheduled worker; Tiger Data → PostgreSQL; private object storage for documents.
- Vercel web **only after T24**. Auth0 frontend sign-in postponed; backend must still validate access tokens / restrict demo endpoints; no unauthenticated financial routes.
- Validate in Postman/Bruno or API documentation; GitHub Actions must pass. Keep a recorded/frozen demo price response **labeled replay** if providers rate-limit or fail.
- Prioritize a reliable live vertical slice over unfinished extra integrations: Nessie purchase → scanned/email receipt → match → Best Buy/Bright Data offer → policy decision → case → simulated deposit match.

See `TEAM_GPT_CONTEXT.md`, `TASK_TRACKER.csv`, `SETUP_AND_VERSIONS.md` and `config/technology-versions.json` before starting.


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


## Important: Prevent four GPTs from generating incompatible variable names
The previous scaffold pinned packages but did **not** fully freeze JSON field names. This version adds `packages/contracts/src/index.ts` (Zod schemas and shared TypeScript types), `config/api-contract.json` (route names/owners), `config/env-contract.json` and `.env.example` (environment keys), plus `config/naming-conventions.md` and `TEAM_INTEGRATION_RULES.md`.

**New gate after T02:** Rishav merges shared contract schemas and route registry; all other modules import them. `pnpm check:contracts` and `pnpm check` are required in CI. The schema fields are starter contracts and may evolve through reviewed PRs; they do not yet prove that provider payloads are valid.

## T01–T03 implementation handoff

The foundation now includes a committed root lockfile, reproducible Node/pnpm pins, CI, a tested health endpoint, and compiled backend commands (T01); versioned runtime contracts, a route registry and synthetic JSON fixtures (T02); and an executable, checksum-verified PostgreSQL migration with ownership and replay constraints (T03).

```bash
bash scripts/team-setup.sh
pnpm dev:api              # GET http://localhost:3001/health
pnpm check                # pins, contracts, types, tests and builds
pnpm db:migrate           # explicitly exported DATABASE_URL required
```

Read [the contract handoff](packages/contracts/README.md) and [database migration instructions](packages/db/README.md) before implementing downstream modules. The route registry is authoritative over the earlier target route examples. Financial routes, provider clients, authentication, business workflows and client applications remain in their scheduled tasks.

Each task is delivered as a separate commit/stacked PR. Merge T01, then T02, then T03 after required CI and review; branch pushes alone do not mark prerequisites MERGED. Migration and contract fixture checks do not represent a live Tiger Data deployment or an integrated recovery workflow.

## T04 implementation handoff

`apps/api` now has typed environment configuration, a lazy database pool with shutdown cleanup, canonical HTTP errors, and a validated GET-only Nessie transport. `/health` remains credential-free in development; production startup requires `DATABASE_URL` and `NESSIE_API_KEY`. No financial routes are registered. See [the server and banking handoff](apps/api/src/modules/banking/README.md) for configuration, service usage, error codes and verification. T08 can build provider adapters/imports on this foundation; live provider connectivity remains to be verified with configured credentials.

## T20–T25 integration handoff (Anish branch)

The backend now registers the canonical API routes with provisioned per-user
credentials, ownership checks, private evidence retention and OpenAPI documentation.
The worker executes database-owned price jobs and opt-in schedules; refund
reconciliation requires completed, correlated simulated Nessie deposits.

See [the release handoff](docs/release/HANDOFF.md),
[Postman collection](docs/release/MoneyBack.postman_collection.json),
[OpenAPI specification](docs/release/openapi.json), and
[measured synthetic receipt evaluation](docs/release/receipt-evaluation.json).
Run `pnpm check` and `pnpm --filter @moneyback/api test:release`.

**Railway API and worker are deployed.** Full live provider checks and redacted
deployment logs/screenshots remain required before passing the final T24/T25 gate.


### Backend release status — October 17, 2026

Frontend development is paused. Backend local and real PostgreSQL checks pass;
Railway receipt storage persists across API redeployments. See
[the backend demo](docs/release/DEMO.md) and [measured verification](docs/release/VERIFICATION.md).
Nessie sandbox purchase creation and deployed import now pass using a clean demo
customer and explicit completed status. T22/T24 live sign-off remains open:
Gemini 3.5 Flash passed 3/3 live synthetic email checks and the bank receipt matched.
Direct exact-product and shipping evidence pass; the updated retail integration
still needs deployment and a priced worker-to-simulated-refund run. The existing offline refund
smoke uses labeled fixture providers and simulated reimbursements.
