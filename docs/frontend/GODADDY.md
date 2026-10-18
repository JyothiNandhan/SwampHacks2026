# GoDaddy GitHub deployments

Keep editing `main`. The **Sync GoDaddy frontend** GitHub Actions workflow exports
`apps/web` into the generated `godaddy-web` branch after frontend source/config
changes reach main. It validates a production npm install and Next.js build before
pushing. Do not edit the generated branch: the next export replaces its source.
Backend API and worker scripts, Dockerfiles and Railway settings are unchanged.

In GoDaddy's existing app:

1. Keep GitHub connected. In Settings → Integrations → Change, select
   `JyothiNandhan/SwampHacks2026`, branch **godaddy-web**.
2. Add `API_BASE_URL=https://swamphacks2026-production.up.railway.app` in Secrets.
   Never copy database/provider credentials or user API tokens into this frontend.
3. Use Update Preview to import the new branch initially. Check `/api/health`
   and the dashboard. The URL prefix/root path stays `/`.
4. Confirm automatic updates in this account with a visible frontend commit to
   main. The expected chain is main push → successful workflow → godaddy-web push
   → GoDaddy rebuild. This is deployment after a push, not syncing unsaved edits.
5. A publish-capable hosting subscription is required for a public website.
   Confirm separately whether subsequent pushes update preview or live; do not
   describe automatic live publishing as verified until tested on the account.
6. After the public app works, attach moneybackos.us in GoDaddy and apply the exact
   DNS records it supplies at Porkbun. Preserve unrelated email/DNS records.

GoDaddy advertises deployment on GitHub pushes, but the current account's actual
preview/live behavior remains to be verified. No hosted deployment or DNS change
is performed by the branch-sync workflow itself, and it needs no hosting secrets.
The workflow uses the repository GITHUB_TOKEN with contents write permission.
If repository policy denies branch writes, a maintainer must allow that workflow.

## Local export

`python3 scripts/prepare-godaddy-web.py` creates a fresh `dist/godaddy-web`.
Run `npm ci --omit=dev` and `npm run build` inside that folder. `npm start` binds
to 0.0.0.0 and uses the hosting platform's PORT. The generated package resolves
pnpm catalog versions to exact npm dependencies and includes build-time TypeScript
dependencies in production dependencies because GoDaddy omits dev dependencies.

When frontend dependency versions change, regenerate the independent lockfile to
match the generated manifest before committing. The export fails explicitly when
the manifest and checked-in deployment lockfile disagree. To regenerate, update
the root dependency versions in deployment/godaddy/package-lock.json to match the
catalog, export into a fresh directory, run npm install --package-lock-only there,
and copy the resulting package-lock.json back to deployment/godaddy/.

References:
- https://www.godaddy.com/hosting/nodejs
- https://developer.godaddy.com/en/docs/api-users/hosting/app-requirements
