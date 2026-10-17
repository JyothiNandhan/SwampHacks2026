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

This is an initial frontend, not a complete frontend release. Auth0 sign-in, live case
and notification history, pagination controls and final public deployment remain
unfinished. The backend's Nessie sandbox purchase-listing error remains external
and unresolved. No sample approval or recovery creates a real financial claim.
