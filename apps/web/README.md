# MoneyBack dashboard

A Next.js 15 dashboard with a forest-green recovery overview, searchable purchases,
opportunity cards, sample recovery journeys, responsive navigation, receipt upload,
and a server-side connection to the existing Railway API.

```sh
pnpm --filter @moneyback/web dev
# http://localhost:3000
pnpm --filter @moneyback/web build
```

The initial workspace is explicitly synthetic. Connecting an account replaces
sample purchases and opportunities with the API response; empty live accounts never
fall back to sample financial records. Search listings and potential recovery are
not confirmed savings. The live purchase list does not infer policy protection.

## Account connection

Use **Connect your account** and a provisioned per-user backend access token.
The Next.js server validates the token against the authenticated purchase endpoint,
then keeps it in a one-hour HTTP-only, SameSite=Strict cookie (Secure in production).
Tokens are not stored in localStorage or embedded in a frontend bundle. Provider
keys belong only on Railway. Auth0 interactive sign-in and user-triggered Gmail
import are implemented but need deployment credentials and live OAuth verification.
See [Auth0 and Gmail activation](../../docs/frontend/AUTH0_GMAIL.md).

The same-origin proxy allows only documented read routes and the receipt upload /
ingest endpoints. It does not expose arbitrary upstream URLs, internal worker routes,
banking mutations or case approvals. State-changing routes check the browser Origin.

Set server-only `API_BASE_URL` to an HTTPS API origin if overriding the default
Railway deployment. No environment variable is required to explore demo mode.
For Railway, use the dedicated root `Dockerfile.web` and keep the service root at
`/` so the shared pnpm catalog/lockfile are available. See
[the Railway deployment instructions](../../docs/frontend/RAILWAY.md). Hosting
preparation and a successful local production build do not establish a public deployment.

## Receipt flow

Connect → Add receipt → select EMAIL, PHOTO or PDF → choose a file under 4 MB.
The file is registered through the private document API and passed to live extraction.
Receipt-to-transaction matching remains a separate backend step; uploading does not
invent a bank transaction or automatically create a recovery case.

## Current boundaries

The purchase/opportunity views load the first API page. Case history, live notification
history are not connected yet. Sample actions never create a real
claim. Live Nessie reconciliation passed using an operator-provisioned synthetic
billing case. The full live retail-to-refund demonstration still needs a current
eligible product/seller/price/shipping offer.

Verification includes a production Next.js build, desktop/mobile browser interaction
checks and live account proxy checks. See the root backend release verification for
provider and sandbox limits.
