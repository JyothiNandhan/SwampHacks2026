# Activate Auth0 and Gmail

The application now implements Auth0 sign-in, isolated account provisioning and
user-triggered Gmail receipt importing. These features require your own provider
applications, consent, deployment settings and a real sign-in test before they
can be described as live. Manual token connection/upload remains available.

## 1. Choose the current frontend origin

Use the exact HTTPS origin that opens the GoDaddy preview, or the public custom
domain after it is connected. This is `APP_BASE_URL`, with no path/query.
Register the actual preview origin during testing; change/add the public domain
when publishing. Do not assume moneybackos.us already serves the Next.js app.

## 2. Auth0

In the Auth0 dashboard, create a **Regular Web Application** and an **API**:

- API identifier/audience: choose a stable identifier such as
  `https://moneyback-api`; use **RS256** signing.
- Application Allowed Callback URLs: `<APP_BASE_URL>/auth/callback`.
- Allowed Logout URLs and Allowed Web Origins: `<APP_BASE_URL>`.
- Enable Refresh Token grant and API Allow Offline Access for session renewal.
- Set AUTH0_DOMAIN to the application's Auth0 domain (no https prefix).
- AUTH0_ISSUER on the API is `https://<AUTH0_DOMAIN>/`.

Set these **on the GoDaddy frontend**:

```text
APP_BASE_URL=<exact frontend origin>
AUTH0_DOMAIN=<tenant domain>
AUTH0_CLIENT_ID=<regular web application's client id>
AUTH0_CLIENT_SECRET=<application secret>
AUTH0_SECRET=<64 random hexadecimal characters>
AUTH0_AUDIENCE=https://moneyback-api
API_BASE_URL=https://swamphacks2026-production.up.railway.app
```

Set these **on the Railway API**:

```text
AUTH0_ISSUER=https://<tenant domain>/
AUTH0_AUDIENCE=https://moneyback-api
```

JWT signatures, issuer, audience, expiration and RS256 are verified server-side.
Accounts are mapped by issuer+subject, never automatically linked by email.
New Auth0 identities receive ordinary user access and an empty workspace; they do
not inherit the demo user's purchases, Nessie account or administrative roles.
Existing opaque token users retain their existing accounts. Account migration or
linking requires a separate trusted administrative process.

## 3. Google Cloud: Gmail only

Create/select a Google Cloud project. Enable **Gmail API**, configure the OAuth
consent screen, and create an **OAuth client ID → Web application**.

- Authorized redirect URI: `<APP_BASE_URL>/api/email/callback`.
- Request scope: `https://www.googleapis.com/auth/gmail.readonly`.
- In Testing mode, add the Gmail accounts you intend to connect as test users.
- Explain that selected receipt content is stored and sent to the app's Gemini
  extraction provider. Gmail read access is separate from Auth0 account login.
- For a broader public launch, follow Google's verification requirements for
  restricted Gmail scopes; do not assume a test-mode client supports every user.

Set these **on the Railway API**, alongside existing document/Gemini settings:

```text
GOOGLE_CLIENT_ID=<Google OAuth web client id>
GOOGLE_CLIENT_SECRET=<Google OAuth web client secret>
GMAIL_REDIRECT_URI=<APP_BASE_URL>/api/email/callback
EMAIL_TOKEN_ENCRYPTION_KEY=<64 random hexadecimal characters>
```

Google credentials and the encryption key belong only on the API. Do not prefix
any credentials with NEXT_PUBLIC_. Do not paste secret values in chat or commit
them. Missing names and locally generated cookie/encryption secrets were added to
the ignored `.env.verify` file; existing values were preserved. Copy values to the
correct hosting service privately. Local edits do not configure hosted services.

## 4. Deploy and verify

Apply migration `003_auth0_gmail` with `pnpm db:migrate` using the configured database
and trusted TLS CA. The migration is additive and checksum protected. Deploy main
on Railway API and update the GoDaddy preview from the generated godaddy-web branch.
The exporter includes middleware.ts. No new worker job or worker configuration is
required for these user-triggered imports.

1. Open Account → Sign in / Create account. Complete Auth0 login; verify an empty
   new account has no demo records and token values are absent from browser JSON.
2. Open Add receipt → Connect or import Gmail receipts → Connect Gmail with Google.
3. Consent to read-only Gmail access. On return, click Import recent receipts.
4. Each operation searches at most 20 matching emails from the last 30 days.
   The UI processes at most five new emails per click, one API request at a time.
   It prioritizes a supported PDF attachment, then readable email text, then images.
   Small inline images are not preferred over email text. One receipt is imported
   per message; this is not an exhaustive mailbox/multiple-attachment crawler.
   Permanently unsupported messages are skipped on repeat imports. Transient failed
   messages have a five-minute retry cooldown so they do not block newer receipts.
5. Repeat import and confirm already imported message IDs are skipped. Saved
   receipt IDs allow recovery after an interrupted import without re-extraction.
6. Disconnect Gmail; local OAuth credentials are deleted and Google revocation is
   attempted. Previously imported evidence is retained. Log out of the workspace.

Gmail importing is user-triggered, not a background/push inbox watcher. It does not
send email, modify messages, create bank purchases, match receipts automatically,
or approve recovery cases. Google may return non-receipt results; the extraction
pipeline retains uncertainty and review status rather than inventing purchases.

## Server API

All routes require the ordinary per-user Bearer token (opaque or verified Auth0):

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/v1/email/gmail` | Configured/connected status and last sync time |
| POST | `/api/v1/email/gmail/connect` | Single-use, user-bound, expiring OAuth state + PKCE |
| POST | `/api/v1/email/gmail/callback` | Exchange code and store encrypted refresh token |
| POST | `/api/v1/email/gmail/import` | Import at most one new receipt from a recent message |
| DELETE | `/api/v1/email/gmail` | Disconnect and attempt Google token revocation |

Front-end routes expose only those operations, enforce Origin on mutations, and
keep access tokens server-side. The OAuth callback uses single-use state and PKCE.
Legacy session cookies are switched to SameSite=Lax only when starting the Gmail
flow to permit Google's cross-site top-level callback; mutation Origin checks stay
in force. Auth0 uses its SDK's encrypted session/transaction cookies.

References:
- https://github.com/auth0/nextjs-auth0
- https://developers.google.com/identity/protocols/oauth2/web-server
- https://developers.google.com/workspace/gmail/api/auth/scopes

## Implementation verification

- Workspace checks passed 194 tests; one optional database integration test was skipped locally.
- Production build of the independent GoDaddy frontend passed with Node.js middleware.
- Signature/issuer/audience/expiry checks, encrypted user-bound OAuth state and tokens,
  cross-user isolation, callback replay rejection and duplicate import prevention passed.
- Local production smoke passed the dashboard, health, unauthenticated Gmail rejection,
  mutation Origin checks, existing live token login/purchase proxy/logout, and no token in HTML.
- Tiger Data migration 003_auth0_gmail was applied successfully over verified TLS.
- Live Auth0 and Google consent are NOT verified: provider credentials are still missing.
  The Airo share wrapper is not the application's OAuth base URL; its direct private
  preview hostname requires gateway authorization. Use a provider-supported directly
  accessible app origin for OAuth testing, ideally the published custom domain.
