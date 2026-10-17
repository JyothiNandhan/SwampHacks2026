# Offline task handoff

These working-tree files intentionally have no commit. Split them into owner-reviewed commits before merging.

## D01 — Nandhan

- `apps/deepspace/` contains the pinned DeepSpace Vite/React + Hono Worker foundation.
- It includes the authentication proxy/JWT WebSocket boundary, health endpoint, user-scoped real-time notification schema, synthetic fixture, responsive dashboard and unit test.
- The intended permanent owner must sign in and run `deepspace app init`; do not hand-write the placeholder app ID.
- Review shared dependency pins in `pnpm-workspace.yaml`, `config/technology-versions.json`, `pnpm-lock.yaml`, root scripts and `.gitignore`.

## T06 and T10 — Nandhan

- Existing retail adapter files remain present and tested.
- Keep these in their own clean PR rather than mixing them into teammate-owned task commits.

## T07 and T11 — Nandhan

- `apps/api/src/modules/recovery/` contains the explicit-approval state machine, evidence-backed recommendation drafting, approval event and notification generation, tests and handoff documentation.
- Agents cannot approve or submit a recovery.

## T08 — Nandhan

- `apps/api/src/modules/banking/nessie-import.ts` validates and normalizes Nessie customers, accounts, purchases, merchants, bills and deposits.
- `TigerDataNessieStore` persists one atomic, per-user, replay-safe import. The integration test applies the real migration to PGlite and imports the same provider records twice.
- Route registration and authenticated mapping from the caller to `userId`/`customerId` remain part of T20.

## T09 — Nandhan

- `apps/api/src/modules/matching/` provides explainable receipt/payment candidate scores and non-destructive duplicate grouping.
- Original receipt IDs are retained and duplicate groups carry the paper-receipt retention warning.

## Required split and verification

Each owner should inspect their files, run `pnpm check`, create their own task branch/commit and open the required reviewed PR. D01 additionally requires the manual DeepSpace account initialization described in `apps/deepspace/README.md` before its production build or deployment.
