# D01 — DeepSpace foundation

This application is the MoneyBack OS real-time client boundary. It uses pinned `deepspace@0.42.3`, a Vite/React client, a Hono Cloudflare Worker, DeepSpace authentication and one user-scoped `savings-notifications` collection.

The default card is explicitly synthetic. Signed-in members can create a confirmed test record and see the subscription update without a reload. Do not send raw receipts, bank transactions, provider credentials or authoritative recovery state to this collection. Railway remains the API/security boundary and Tiger Data remains the financial source of truth.

## Manual team-owner setup

The intended permanent owner—not an arbitrary developer shell—must run:

```bash
pnpm --filter @moneyback/deepspace login
pnpm --filter @moneyback/deepspace exec deepspace auth whoami
pnpm --filter @moneyback/deepspace exec deepspace app init
```

`app init` replaces `__APP_ID__` in `wrangler.toml`. Commit that server-minted ID because it identifies the shared application; never commit `.dev.vars`, session files or identity tokens. Then verify with `pnpm --filter @moneyback/deepspace build` and deploy only after the Railway token-validation contract is approved.
