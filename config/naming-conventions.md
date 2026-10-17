# Shared Naming and Integration Rules (MANDATORY)

1. **Only use fields from `packages/contracts/src/index.ts`.** Never invent alternatives such as `purchase_price`, `price`, `totalPrice`, or `amount` for `amountCents`.
2. **Wire JSON:** `camelCase`. **DB columns:** `snake_case`; mapping occurs in Rishav-owned repository adapters, not in frontend or domain logic.
3. **Amounts:** integer cents (`amountCents`, `priceCents`, `estimatedSavingsCents`); never use floats for currency.
4. **IDs:** `purchaseId` = MoneyBack purchase ID; `nessiePurchaseId` = Capital One ID; `transactionId` = internal bank transaction ID; `receiptId` = evidence receipt ID. Never interchange these.
5. **Time:** `purchasedAt`, `observedAt`, `createdAt` in offset-aware ISO 8601; date-only fields require specifically named `...Date` contract fields.
6. **Naming:** variables/functions camelCase; type names PascalCase; environment variables SCREAMING_SNAKE_CASE; TS enum/JSON status values UPPER_SNAKE_CASE; files kebab-case.
7. **HTTP:** `/api/v1` prefix; routes in `config/api-contract.json`; lists wrapped as `{ data: [], nextCursor: null }`; errors as `{ error: { code, message, requestId } }`.
8. **One writer:** Rishav owns `packages/contracts/`, `config/api-contract.json`, `packages/db/`, and root config. Team members submit a contract-change request to him; don't silently edit canonical fields.
9. **Never duplicate shared interfaces** in individual modules. Import `@moneyback/contracts` instead.
10. **External data:** adapters convert Nessie, Gemini, Best Buy and Bright Data payloads into canonical schemas; never leak raw provider field conventions across module boundaries.
11. **Backward compatibility:** renames must be staged (add/migrate/remove) with updated fixtures and CI; a contract change blocks dependent integration until merged.
12. **Privacy:** token/receipt contents must not appear in logs. Physical receipt evidence stays even when duplicates are consolidated.
