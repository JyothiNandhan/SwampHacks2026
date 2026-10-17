# Verification record — October 17, 2026

- `pnpm check`: passed pins, contracts, all workspace types, 157 tests and backend builds.
  One optional PostgreSQL-driver test was skipped by the default run.
- With a temporary local PostgreSQL 14.21 server, `vitest run
  src/integration/backend.test.ts src/database.test.ts`: 3 tests passed, including
  that optional driver check and the API/worker/refund flow. Test schemas were dropped.
  GitHub CI runs these same checks against its PostgreSQL 16.10 service.
- Worker suite: 7 tests passed (also included in the workspace total).
- `receipt-evaluation.json`: 15/15 synthetic regression expectations passed.
- `git diff --check`: passed.

Provider HTTP and Gemini responses in these checks are mocked. The tests do not
establish live OCR accuracy, live retailer availability, or a deployed Railway release.
No Railway project/service exists yet; no Docker build, live provider run or deployed
API screenshot is claimed. See HANDOFF.md for the outstanding release gate.
