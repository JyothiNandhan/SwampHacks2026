# Shared setup, reproducibility and debugging

## One-time maintainer setup — Rishav ONLY (T01)
1. Install Node **22.16.0**, for example `nvm install && nvm use` (read `.nvmrc`).
2. Install the pinned package manager: `npm install --global pnpm@9.15.9` (or a compatible Corepack setup). Confirm `pnpm --version`.
3. On an internet-connected laptop, run `bash scripts/maintainer-bootstrap.sh`. This generates `pnpm-lock.yaml` from exact `catalog:` pins.
4. Confirm the lockfile includes every workspace and install succeeds, then commit `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `.nvmrc`, manifest files and `config/technology-versions.json` in T01 PR.
5. Merge T01 into `main` only when GitHub CI passes with frozen lockfile.

## Every team member — after T01 is merged
```bash
git clone <REPO_URL>
cd moneyback-os
nvm install && nvm use
npm install --global pnpm@9.15.9
bash scripts/team-setup.sh
cp .env.example .env     # fill ONLY keys for your own module
```
For PowerShell without bash, run equivalent commands: `node scripts/check-versions.mjs`, check `pnpm --version`, `pnpm install --frozen-lockfile`, `pnpm check`.

## Dependency upgrade protocol
- No independent upgrades. Open an issue describing the SDK and why it's needed.
- Rishav changes `config/technology-versions.json` plus `pnpm-workspace.yaml` catalog AND version references/manifests in one PR; runs `pnpm install`, commits a NEW `pnpm-lock.yaml`, updates CI after successful tests.
- All teammates `git pull --ff-only` then `pnpm install --frozen-lockfile` after merge.
- Never install packages with `--no-save` as a dependency workaround. Keep optional SDKs out until needed. Do not install package binaries globally except pinned runtime tools.

## Notes on 'same versions'
- **Same:** Node runtime, pnpm, all declared direct npm packages, exact resolved transitive dependencies once `pnpm-lock.yaml` is committed.
- **Not automatically same:** Railway/ Vercel infrastructure rollout, Tiger Data managed server version, external API content and Gemini *model* backend. Record chosen database server version and model ID in configuration before deploying; test compatibility and watch breaking vendor changes.
- **Auth0 / Next.js** installed but frontend is postponed; don't run frontend build until sources are actually added.
- Exact pins are a chosen baseline, NOT yet proven working in this isolated file-generation environment. Validate the real install on Rishav's machine. Security patches require reviewed upgrades; freezing does not mean ignore vulnerabilities.

## Deployment
- Railway API: root `apps/api`, build via workspace root (`pnpm install --frozen-lockfile && pnpm --filter @moneyback/api build`), start `pnpm --filter @moneyback/api start`; use Railway `PORT`.
- Railway worker: run worker workspace with shared lockfile, configure schedule only after jobs implemented and test idempotency.
- Tiger Data: `DATABASE_URL` injected as secret, run migration procedure from `packages/db` when T03 ready.
- Vercel: defer until F01. Monorepo root installation may be required for workspace/catalog dependencies.

## Troubleshooting
- Node mismatch: `nvm install && nvm use`.
- pnpm mismatch: install **9.15.9** and verify `pnpm --version`.
- Lockfile absent: **STOP** and ask Rishav to merge T01; do not invent a lockfile.
- `frozen-lockfile` fails: manifest/catalog changed without regenerated lockfile; revert changes or coordinate maintainer PR.
- ESM/TS import issues: use NodeNext-compatible file extension imports (`.js` for local TS compiled imports).
- API failures: inspect Railway deployment/runtime logs with request ID; inspect GitHub Actions for CI; do not log keys or raw receipts.
- Best Buy/Bright Data errors: validate key, rate limits, SKU/dataset ID, asynchronous snapshot progress, and staleness.


## Browser extension addition
- `apps/extension/` is a separate `pnpm` workspace package (same pinned TypeScript catalog as backend/web).
- Chrome/Edge Manifest V3 schema is a browser platform specification, not an npm dependency version. Chrome/Edge versions vary; test on current stable browsers and record tested versions in README.
- Extension is **not yet operational**; it must be implemented after the F01 client contract gate.
- From monorepo root: `pnpm --filter @moneyback/extension typecheck` (after the committed lockfile install).
- An extension production bundle/package step still needs implementation before loading unpacked; the provided stub simply checks TypeScript syntax.
- Vercel hosts only the website. Railway serves secured API/monitoring workers.
