# MoneyBack OS — Backend-First Team Execution Plan

**Four developers · Capital One Nessie hackathon · Backend first · Frontend later**

## What we are building
An autonomous post-purchase recovery service. A Nessie purchase is reconciled to an email/photo receipt, mapped to an exact item, monitored against Best Buy and Bright Data offers, evaluated against return terms, turned into a user-approved recovery case, and optionally reconciled to a *simulated* incoming Nessie deposit. Additional capabilities include refunds, subscriptions, charges, warranties, paper-receipt deduplication, and textbook / gift-card / rental deadlines. No chatbot is required for the core workflow.

## Decision: modular ownership, not feature-per-person
| Member | Owned code | Accountable deliverables |
|---|---|---|
| **Rishav** | `apps/api/src/modules/banking/`, `apps/api/src/modules/subscriptions/`, `apps/api/src/server.ts`, `packages/db/`, `packages/contracts/`, CI/repo setup | Nessie purchases/bills/deposits, Tiger Data schema, server/integration, subscription changes |
| **Anish** | `apps/api/src/modules/documents/`, `matching/`, `policies/`, `billing/` | Gemini receipt photo/email extraction, bank matching, paper/digital duplicate grouping, evidence retention, returns/warranties and rental invoice comparisons |
| **Rishithaaa** | `apps/api/src/modules/recovery/`, `deadlines/`, `timeline/`, `notifications/` | Recovery Action Center API, missing refund checks, approvals/state machine, purchase timeline, textbook/gift-card/rental reminders |
| **Nandhan** | `apps/api/src/modules/retail/`, `opportunities/`, `apps/worker/` | Best Buy API, Bright Data dataset scrapers, exact SKU matching, price observations, price drops and scheduled monitors |

**Frontend:** postponed until the backend release gate. Later assign a frontend owner and start `apps/web/` on a separate branch. No frontend feature should block backend progress.

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
| **T07** | Rishithaaa | Recovery case state machine (`DETECTED→REVIEW→APPROVED→SUBMITTED→PENDING→CONFIRMED/REJECTED/EXPIRED`); no agent-driven auto-submission | T02 | Yes |
| **T08** | Rishav | Nessie customers/accounts/purchases/merchants/bills/deposits import; idempotent upserts into Tiger Data | T03 + T04 | Yes with T09–T11 |
| **T09** | Anish | Match extracted receipts to Nessie-format fixture payments; detect duplicate paper scans/emails; retain originals and flag paper-keep warnings | T05 | Yes, integration to real bank waits T08 |
| **T10** | Nandhan | Bright Data scraper adapter (`datasets/v3` with configured dataset per retailer), asynchronous snapshot polling and normalized offers | T06 | Yes |
| **T11** | Rishithaaa | Evidence-backed recovery recommendation, action drafting, approval audit, notification record model | T07 | Yes |

### Gate 2 — Functional integration
| ID | Owner | Exact task and acceptance | Wait for merge | Parallel? |
|---|---|---|---|---|
| **T12** | Rishav | Wire real purchase imports to Anish matcher, persist normalized orders/items and evidence | T08 + T09 | Other integrations continue |
| **T13** | Anish | Parse return/warranty terms incl. dates and exclusions, preserve citation/evidence, conservative retention categorization | T05 | Yes |
| **T14** | Nandhan | Exact-product comparison, offer freshness, price history, arithmetic net savings & deduplicated price-drop opportunities | T10 + T03 | Yes; policy gating waits T13 |
| **T15** | Rishithaaa | Refund expectation + partial/late/missing refund reconciliation against Nessie-format deposit fixtures; reject unrelated equal-amount deposits | T11 | Yes; live Nessie awaits T08 |
| **T16** | Rishav | Subscription price-change service from Nessie bill/purchase history; alert only on supported changes | T08 | Yes |
| **T17** | Anish | Compare rental agreement to final bill, detect changed lines and unverified fees; tests | T13 | Yes |
| **T18** | Rishithaaa | Timeline/events, textbook due dates, rental return time, gift-card terms; notifications and source evidence | T11 + T13 | Yes |
| **T19** | Nandhan | Railway price/monitor worker; scheduled jobs and manual **authenticated demo trigger**, retry/backoff, idempotency | T14 | Yes |

### Gate 3 — End-to-end APIs and release
| ID | Owner | Exact task and acceptance | Wait for merge | Parallel? |
|---|---|---|---|---|
| **T20** | Rishav | Register module routes; secure auth middleware, authz and env validation; expose OpenAPI docs; deploy backend to Railway | T12 + T14 + T15 + T16 + T17 + T18 | Can prep deployment early; live wiring WAIT |
| **T21** | Nandhan | Connect worker to live purchase/policy/case services; Best Buy & Bright Data integration tests, monitor replay | T19 + T20 | Wait for integration |
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
