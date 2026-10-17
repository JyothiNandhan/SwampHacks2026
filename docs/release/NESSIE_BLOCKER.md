# Nessie demo purchase import — resolved with clean sandbox records

Verified October 17, 2026. This report contains no credentials or account identifiers.

Nessie does support simulated customer/account/purchase creation. The previous claim
that provider support was necessary was premature. A clean checking account returned
an empty purchase array successfully, allowing creation fields to be tested directly.

## Working purchase creation

POST `/accounts/<sandbox-account-id>/purchases` at
`https://prod-api.nessieisreal.com`, with the key supplied privately:

```json
{
  "merchant_id": "<sandbox-merchant-id>",
  "medium": "balance",
  "purchase_date": "2026-10-17",
  "status": "completed",
  "amount": 300,
  "description": "MoneyBack synthetic demo purchase"
}
```

`transaction_date` was rejected as an extra field by PurchaseCreate. Use
`purchase_date` for creation and explicitly provide status. The importer accepts
both documented response date forms while rejecting missing/conflicting dates.

## Measured result

- Created/reused a separate synthetic customer and checking account.
- Created a USD 300 synthetic watch purchase and read it back as completed.
- Bound that clean account to the test user through the trusted operator.
- Called deployed authenticated POST `/api/v1/sync/nessie`.
- Received HTTP 200, sync job SUCCEEDED, and verified one imported transaction.
- Saved the current synthetic customer/account IDs only in private local state and
  `.env.verify`. No real money moved.

The original account still returns Purchase.status validation errors. Because the
importer reads all accounts belonging to a customer, the working demo uses a clean
customer/account tree. Existing sandbox records were not deleted or silently fixed.
Support is not required to proceed with this clean demo; repairing old records would
be a separate task. This does not establish the full receipt-to-simulated-refund flow.

Provider documentation: https://nessieisreal.com/docs
