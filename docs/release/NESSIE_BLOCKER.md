# Nessie sandbox purchase validation blocker

Observed October 17, 2026. This report contains no API keys or account identifiers.
No support message has been sent automatically.

## Reproduction for the sandbox owner

Use the existing synthetic demo account ID from the private local verification
configuration. Supply its Nessie API key only through your local client; do not
paste a credentialed request URL into an issue, screenshot or chat.

API origin: `https://prod-api.nessieisreal.com`.

| Request | Result |
|---|---|
| GET `/accounts/<account-id>` | HTTP 200; valid account object |
| GET `/accounts/<account-id>/deposits` | HTTP 200; empty array |
| GET `/accounts/<account-id>/purchases` | HTTP 400 |
| GET `/merchants/<merchant-id>/accounts/<account-id>/purchases` | HTTP 400 |

The purchase endpoints return a provider validation error whose relevant excerpt is:

```text
1 validation error for Purchase
status
  field required (type=value_error.missing)
```

The application cannot validate or import a purchase array because the upstream
returns an error instead. This is not the Tiger Data certificate issue, an API
startup failure, a missing account binding, or an app-side JSON normalization error.
The created customer and checking account exist. Purchase creation did not complete
with a validated response, so no successful purchase import is claimed.

## Requested provider resolution

The sandbox owner can ask Nessie support to inspect the account's purchase records
and the response serializer's required `status` field, or provide a different sandbox
customer/account with a purchase list that returns HTTP 200 and completed records.
Do not delete/reset sandbox resources or relax application validation to conceal it.

After resolution, rerun authenticated sync, receipt matching, exact priced-offer
verification, explicit case approval, staff-authorized simulated submission, completed
sandbox deposit import and correlated refund reconciliation. Do not mark T22/T24
complete using fixture transactions in place of successful live sandbox imports.

Provider documentation: https://prod.nessieisreal.com/docs
Published specification: https://prod.nessieisreal.com/nessie-openapi-spec.yaml
The website documents purchase `transaction_date`; older SDKs use `purchase_date`.
The importer accepts either and rejects missing/conflicting dates.
