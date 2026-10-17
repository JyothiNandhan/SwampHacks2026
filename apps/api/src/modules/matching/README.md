# T09 — Receipt matching and duplicate detection

`matchReceiptToTransactions` validates canonical receipts/transactions and produces explainable, sorted match candidates. Exact amount, normalized merchant, date proximity and an optional reference contribute to the score. The function proposes candidates only; it does not silently mutate a transaction or persist a match.

`detectDuplicateReceipts` groups identical checksums or complete matching business keys. Every original receipt ID is retained and duplicate groups include `KEEP_ORIGINAL_PAPER_RECEIPTS`; consolidation must change associations rather than delete source evidence.

Tests use synthetic records and make no Gemini, Nessie or database calls. Real persistence waits for the T12 integration service and authenticated user scope.

`purchase-integration.ts` now supplies T12's user-scoped transaction/receipt/order/item/evidence
persistence boundary. Only matcher scores of 55 or above persist; uncertain matches remain REVIEW.
