# T05 — Gemini receipt extraction (Anish)

T05 depends on merged T02, not T04. This module exports `createReceiptExtractor`,
`createGeminiGenerator` and `registerDocumentsRoutes`; server registration, token
validation and private storage/database adapters remain Rishav's integration work.
No shared schemas, migrations, dependencies or server files changed. The API test
config resolves contracts from source so tests work before the first workspace build.

## Usage

```ts
import { createGeminiGenerator, createReceiptExtractor } from './extractor.js';
import { registerDocumentsRoutes } from './routes.js';

const extractReceipt = createReceiptExtractor({
  store, // DocumentStore: private, user-scoped originals + extraction evidence + receipts
  generate: createGeminiGenerator(process.env.GEMINI_API_KEY ?? ''),
  model: deploymentSelectedModel // explicit supported model ID; recorded with every result
});
registerDocumentsRoutes(app, { authenticate, extractReceipt });
```

Only `GEMINI_API_KEY` is required by this module; no new environment names. Choose
and verify the deployment's Gemini model explicitly; tests use `fixture-model`.
The store must retain originals without deletion and reject access to other users'
file IDs. `retainExtraction` must durably save raw response text, model, timestamp
and original SHA-256, including malformed/blocked/truncated output. A storage failure
must fail the request. `saveReceipt` persists the canonical receipt and extraction,
including items and warning codes. Storage adapters should handle retries/idempotency
and concurrent requests before live registration. These ports do not claim live DB
or object-storage integration.

After authenticated server registration, with an already uploaded private file:

```sh
curl -X POST http://localhost:3001/api/v1/receipts/ingest \
  -H "Authorization: Bearer $ACCESS_TOKEN" -H 'Content-Type: application/json' \
  -d '{"source":"PHOTO","originalFileId":"original-1"}'
```

Response is canonical `{ "data": Receipt }`, with server-generated ID and
`EXTRACTED` or `REVIEW` status. Missing merchant/date/total/items or provider warnings
force review. The fixture yields totalCents 30000, Demo Watch model DW-1, quantity 1.
Errors use `{ "error": { "code", "message", "requestId" } }` without provider details.
The scaffold server intentionally does not expose this route yet.

Inputs: PHOTO (JPEG/PNG/WebP), EMAIL (decoded UTF-8 text or HTML), PDF (application/pdf),
nonempty and at most 10 MiB. Raw MIME email decoding/attachments are an upstream concern.
No remote URL fetching, automatic mailbox access, or extension capture. Gemini uses
inline bytes/text, structured JSON derived from ReceiptExtractionSchema and a 30-second
abort signal. Runtime validation rejects malformed JSON, extra fields, fractional/negative
cents, wrong sources and incomplete generation. Unknown dates/timezones, identities and
amounts must stay null; extraction remains model-produced evidence requiring review.

## Verification and handoff

```sh
# Node 22.16.0, pnpm 9.15.9; frozen root lockfile install
pnpm --filter @moneyback/api test
pnpm check
```

Synthetic photo-response JSON and email-text fixtures test the adapter without network
calls. Photo bytes are a mocked transport payload, not a real OCR accuracy benchmark.
Tests cover media validation, uncertainty, invalid money/JSON, source mismatch,
truncation, provider/storage failure, auth and route contracts. No live Gemini call or
photo OCR evaluation was performed. Provider API reference:
https://ai.google.dev/api/generate-content

PR handoff: route POST /api/v1/receipts/ingest; schemas ReceiptIngestRequest,
ReceiptExtraction, Receipt, ReceiptResponse, Error; no shared fields or migrations added.
T09/T13 integration is unblocked only after T05 merges with required CI/review.
Pushes to Anish do not trigger the current feature-branch CI filter; use a PR for CI.
