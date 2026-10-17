# Browser Extension (planned, NOT implemented)

Chromium Manifest V3 extension for Chrome/Edge. The included `manifest.json` is a minimal planning scaffold, **not a working extension**.

## Purpose
- On an explicit user click, inspect supported retail order/confirmation pages and prepare a structured *capture preview*.
- Ask for user approval before transmitting page-derived purchase data or screenshots to MoneyBack backend.
- Link captures to existing bank transactions, email receipts, product records, and policy evidence.
- Show price-drop notifications from the backend and open the website dashboard for detailed recovery actions.
- No automatic checkout, no arbitrary browsing-history uploads, no receipt deletion, no automatic refund submissions.

## Engineering boundaries
- Manifest V3; prefer `activeTab` and user interaction rather than blanket `<all_urls>` permission.
- Never embed Nessie/Gemini/Best Buy/Bright Data keys in extension source. Only call authenticated Railway API.
- The extension may only detect on-page information it can access; full order details and payment records must come from authorized sources.
- Browser session tokens must not be taken directly from website cookies. Define an explicit supported sign-in/token flow and verify scopes in backend.
- Browser extensions cannot be hosted on Vercel as installable browser extensions. Vercel serves the dashboard; extension is built as a separate distributable to load unpacked in hackathon demo.

## Future modules
`popup`, `content-scripts`, `background/service-worker`, `capture-preview`, `auth`, `api-client`, `alerts` under this directory.

## First demo targets
1. Open a synthetic supported retailer order page. 2. User presses the extension button. 3. Preview fields and sources. 4. Approve and call `POST /api/captures/preview` then `POST /api/captures/confirm` (our own future routes). 5. Dashboard shows new evidence linked to existing purchase.
