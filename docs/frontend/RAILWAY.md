# Deploy the frontend to Railway

The frontend is a separate service in the existing project. Its runtime calls the
existing HTTPS API through a same-origin server proxy. No database or provider key
is required by the frontend; users connect with their own provisioned API tokens.

## Service configuration

| Setting | Value |
|---|---|
| Service name | `moneyback-web` |
| Repository | `JyothiNandhan/SwampHacks2026` |
| Branch | `main` |
| Root directory | `/` (whole workspace) |
| Dockerfile variable | `RAILWAY_DOCKERFILE_PATH=Dockerfile.web` |
| API origin variable | `API_BASE_URL=https://swamphacks2026-production.up.railway.app` |
| Port variable | `PORT=3000` |
| Healthcheck path | `/api/health` |
| Healthcheck timeout | 120 seconds |
| Start command | Use the image default: `node apps/web/server.js` |
| Public domain target port | `3000` |

Keep the backend API and worker as their existing services. The frontend needs no
persistent volume. `Dockerfile.web` pins Node 22.16.0/pnpm 9.15.9, installs the locked
frontend workspace, builds Next.js standalone output and runs as the non-root node
user. `.dockerignore` excludes local credentials, dependencies and Next.js artifacts.

## Dashboard setup when account automation is unavailable

1. Open the existing project in the production environment.
2. Add a new empty service named `moneyback-web`.
3. Add the three variables listed above before connecting the GitHub source.
4. Connect the repository, branch main, and retain the root directory `/`.
5. Use the Dockerfile's start command; configure healthcheck `/api/health`.
6. Deploy the latest commit and wait for the frontend healthcheck to pass.
7. Under Settings → Networking, generate a domain targeting port 3000.
8. Open the generated HTTPS URL. Demo data is explicitly labeled; use Connect your
   account for live purchases/opportunities. Verify login, a read and logout.

Railway's Dockerfile path variable selects the frontend image rather than the
repository's default backend Dockerfile. No legacy railway.json file is required.

## Verification

- Workspace `pnpm check` passed 183 tests, including four production-origin regressions.
- Frozen frontend-only install and Next.js build passed in an isolated copy matching
  the Docker build context. Docker is not installed locally, so no container build
  is claimed until Railway builds the image.
- The isolated standalone server served the dashboard, static assets and `/api/health`.
- Its production HTTPS proxy simulation passed live Railway token validation,
  authenticated purchase reads, secure cookie flags and logout.
- Unauthenticated proxy reads returned 401; cross-origin mutation returned 403.
- API token values were not included in generated HTML or the published test report.

See railway-production-checks.json. Account connection and the returned deployment
URL must still be verified before describing the frontend as publicly hosted.

References: https://docs.railway.com/builds/dockerfiles and
https://docs.railway.com/guides/nextjs.
