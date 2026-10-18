# Initial dashboard verification — October 17, 2026

- Next.js production build passed, including strict TypeScript checks.
- Workspace `pnpm check` passed: 172 tests, one optional test skipped, types and backend builds.
- Frozen offline dependency installation completed using the existing pnpm cache.
- Isolated Chrome checks passed: desktop render, no desktop overflow, purchase search,
  detail dialog, Escape dismissal, opportunities navigation, 390px mobile layout,
  demo upload gating and unauthenticated server-boundary rejection.
- Live account proxy checks passed: per-user token validation, HTTP-only / Secure /
  SameSite=Strict cookie flags, authenticated purchase read, disconnect and cross-origin rejection.
- Screenshots show labeled synthetic data only: dashboard-desktop.png and dashboard-mobile.png.

This is an initial frontend, not a complete frontend release. Auth0 sign-in and
user-triggered Gmail import are implemented, with provider configuration and live
consent verification still pending; see AUTH0_GMAIL.md. Live case/notification history,
pagination controls and final public deployment remain unfinished. Nessie sandbox purchase import and independent simulated-refund reconciliation
have since passed; the complete live retail-to-refund positive path remains open. No sample approval or recovery creates a real financial claim.

## Railway deployment preparation

The dedicated Dockerfile.web and standalone output are prepared for a separate
Railway service. Workspace checks passed 183 tests. A clean frontend-only frozen
install/build and isolated standalone production smoke passed, including HTTPS
proxy origin handling, live account validation/reads, secure cookies and logout.
See RAILWAY.md and railway-production-checks.json. Docker is unavailable locally;
the container build and public hosted URL await the Railway account connection.
