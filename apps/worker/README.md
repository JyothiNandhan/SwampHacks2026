# Price monitor worker (T19)

The worker provides a PostgreSQL-backed queue using `FOR UPDATE SKIP LOCKED`, canonical
idempotency keys, authenticated admin/demo manual triggers, hourly scheduled keys, capped
exponential retry, and sanitized failure codes. `JobRunner` accepts the live price handler
as a port; T21 connects that port to purchase, policy, Best Buy/Bright Data, and case services.

Railway runs `service.ts` as a long-lived process after `DATABASE_URL`, `INTERNAL_API_URL`,
and a 16+ character `INTERNAL_WORKER_TOKEN` are configured. It calls the T21 internal
execution route with an idempotency key; failures contain sanitized codes only. No
credentials belong in source control.
