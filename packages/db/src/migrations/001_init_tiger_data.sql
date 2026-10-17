-- PostgreSQL 16+ / Tiger Data. gen_random_uuid() is built in.
-- Applied once, transactionally, by the checksum-verified migration runner.

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  first_name TEXT,
  last_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  external_account_id TEXT NOT NULL,
  institution_name TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('CHECKING', 'SAVINGS', 'CREDIT', 'LOAN', 'CARD')),
  nickname TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, external_account_id)
);

CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id UUID REFERENCES accounts(id),
  nessie_purchase_id TEXT NOT NULL,
  merchant_name TEXT,
  merchant_id TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  occurred_at TIMESTAMPTZ NOT NULL,
  receipt_status TEXT NOT NULL CHECK (receipt_status IN ('UNMATCHED', 'REVIEW', 'MATCHED')) DEFAULT 'UNMATCHED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('EMAIL', 'PHOTO', 'PDF', 'EXTENSION')),
  merchant_name TEXT,
  order_number TEXT,
  purchased_at TIMESTAMPTZ,
  total_cents INTEGER CHECK (total_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  original_file_id TEXT NOT NULL,
  extraction_status TEXT NOT NULL CHECK (extraction_status IN ('PENDING', 'EXTRACTED', 'REVIEW', 'FAILED')) DEFAULT 'PENDING',
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  receipt_id UUID NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT,
  model TEXT,
  sku TEXT,
  gtin TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER CHECK (unit_price_cents >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  merchant_name TEXT NOT NULL,
  order_number TEXT,
  purchased_at TIMESTAMPTZ NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  match_status TEXT NOT NULL CHECK (match_status IN ('UNMATCHED', 'REVIEW', 'MATCHED')) DEFAULT 'UNMATCHED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('RECEIPT', 'TRANSACTION', 'OFFER', 'POLICY', 'USER')),
  source_id TEXT NOT NULL,
  category TEXT NOT NULL,
  acquisition_method TEXT NOT NULL,
  raw_url TEXT,
  checksum TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, source_type, source_id)
);

CREATE TABLE policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  policy_type TEXT NOT NULL CHECK (policy_type IN ('WARRANTY', 'RETURN', 'RENTAL', 'TEXTBOOK', 'GIFTCARD', 'SUBSCRIPTION')),
  source_name TEXT NOT NULL,
  source_url TEXT,
  raw_terms JSONB NOT NULL DEFAULT '{}'::JSONB,
  exclusions TEXT[] NOT NULL DEFAULT '{}',
  eligibility TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (eligibility IN ('VERIFIED', 'REVIEW_REQUIRED', 'INELIGIBLE')),
  parsed_start_at TIMESTAMPTZ,
  parsed_end_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE product_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('BEST_BUY', 'BRIGHT_DATA', 'FIXTURE')),
  retailer_name TEXT NOT NULL,
  product_name TEXT NOT NULL,
  sku TEXT,
  model TEXT,
  gtin TEXT,
  condition TEXT NOT NULL CHECK (condition IN ('NEW', 'OPEN_BOX', 'REFURBISHED', 'USED', 'UNKNOWN')),
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  shipping_cents INTEGER CHECK (shipping_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  in_stock BOOLEAN,
  product_url TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE price_time_series (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_key TEXT NOT NULL,
  retailer_name TEXT NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  observed_at TIMESTAMPTZ NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('BEST_BUY', 'BRIGHT_DATA', 'FIXTURE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES purchases(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('PRICE_DROP', 'MISSING_REFUND', 'OVERBILLING', 'SUBSCRIPTION_INCREASE', 'DEADLINE', 'WARRANTY')),
  estimated_savings_cents INTEGER CHECK (estimated_savings_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  status TEXT NOT NULL CHECK (status IN ('DETECTED', 'REVIEW', 'APPROVED', 'SUBMITTED', 'PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED')) DEFAULT 'DETECTED',
  eligibility TEXT NOT NULL CHECK (eligibility IN ('VERIFIED', 'REVIEW_REQUIRED', 'INELIGIBLE')) DEFAULT 'REVIEW_REQUIRED',
  deadline_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  opportunity_id UUID NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('DETECTED', 'REVIEW', 'APPROVED', 'SUBMITTED', 'PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED')) DEFAULT 'DETECTED',
  expected_refund_cents INTEGER CHECK (expected_refund_cents >= 0),
  confirmed_refund_cents INTEGER NOT NULL DEFAULT 0 CHECK (confirmed_refund_cents >= 0),
  matching_nessie_deposit_id TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id UUID NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  deposit_id TEXT,
  simulated BOOLEAN NOT NULL DEFAULT TRUE CHECK (simulated),
  expected_at TIMESTAMPTZ,
  expected_amount_cents INTEGER NOT NULL CHECK (expected_amount_cents >= 0),
  confirmed_amount_cents INTEGER CHECK (confirmed_amount_cents >= 0),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'MATCHED', 'REJECTED', 'CONFIRMED')) DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_name TEXT NOT NULL,
  account_id UUID REFERENCES accounts(id),
  plan_name TEXT,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('MONTHLY', 'YEARLY', 'WEEKLY', 'ONE_TIME')),
  started_at TIMESTAMPTZ NOT NULL,
  next_billing_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_at TIMESTAMPTZ,
  job_type TEXT NOT NULL CHECK (job_type IN ('NESSIE_IMPORT', 'PRICE_MONITOR', 'RECEIPT_MATCH', 'POLICY_SCAN', 'REFUND_RECONCILE')),
  status TEXT NOT NULL CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'RETRYING')) DEFAULT 'QUEUED',
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_user_account ON transactions (user_id, account_id, occurred_at DESC);
CREATE INDEX idx_receipts_user_created_at ON receipts (user_id, created_at DESC);
CREATE INDEX idx_purchases_user_purchase_date ON purchases (user_id, purchased_at DESC);
CREATE INDEX idx_opportunities_user_status ON opportunities (user_id, status, created_at DESC);
CREATE INDEX idx_cases_user_status ON cases (user_id, status, created_at DESC);
CREATE INDEX idx_events_user_created_at ON events (user_id, created_at DESC);
CREATE INDEX idx_price_time_series_product_date ON price_time_series (user_id, product_key, observed_at DESC);

-- Tenant-aware keys prevent cross-user references even when an ID is known.
ALTER TABLE accounts ADD UNIQUE (user_id, id);
ALTER TABLE transactions ADD UNIQUE (user_id, id);
ALTER TABLE receipts ADD UNIQUE (user_id, id);
ALTER TABLE receipt_items ADD UNIQUE (user_id, id);
ALTER TABLE purchases ADD UNIQUE (user_id, id);
ALTER TABLE evidence ADD UNIQUE (user_id, id);
ALTER TABLE policies ADD UNIQUE (user_id, id);
ALTER TABLE product_offers ADD UNIQUE (user_id, id);
ALTER TABLE opportunities ADD UNIQUE (user_id, id);
ALTER TABLE cases ADD UNIQUE (user_id, id);
ALTER TABLE refunds ADD UNIQUE (user_id, id);
ALTER TABLE subscriptions ADD UNIQUE (user_id, id);
ALTER TABLE transactions ADD FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id);
ALTER TABLE receipt_items ADD FOREIGN KEY (user_id, receipt_id) REFERENCES receipts(user_id, id);
ALTER TABLE purchases ADD FOREIGN KEY (user_id, transaction_id) REFERENCES transactions(user_id, id);
ALTER TABLE policies ADD FOREIGN KEY (user_id, purchase_id) REFERENCES purchases(user_id, id);
ALTER TABLE product_offers ADD FOREIGN KEY (user_id, purchase_id) REFERENCES purchases(user_id, id);
ALTER TABLE opportunities ADD FOREIGN KEY (user_id, purchase_id) REFERENCES purchases(user_id, id);
ALTER TABLE cases ADD FOREIGN KEY (user_id, opportunity_id) REFERENCES opportunities(user_id, id);
ALTER TABLE refunds ADD FOREIGN KEY (user_id, case_id) REFERENCES cases(user_id, id);
ALTER TABLE subscriptions ADD FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id);

ALTER TABLE transactions ADD UNIQUE (user_id, nessie_purchase_id);
ALTER TABLE transactions ALTER COLUMN account_id SET NOT NULL;
ALTER TABLE purchases ADD UNIQUE (user_id, transaction_id);
ALTER TABLE cases ADD UNIQUE (user_id, opportunity_id);
ALTER TABLE events ADD UNIQUE (user_id, idempotency_key);
ALTER TABLE policies ADD CHECK (parsed_end_at IS NULL OR parsed_start_at IS NULL OR parsed_end_at >= parsed_start_at);

-- Orders and their evidence are relational; API adapters aggregate receiptIds/items.
CREATE TABLE purchase_receipts (
  user_id UUID NOT NULL REFERENCES users(id),
  purchase_id UUID NOT NULL,
  receipt_id UUID NOT NULL,
  PRIMARY KEY (purchase_id, receipt_id),
  UNIQUE (user_id, receipt_id),
  FOREIGN KEY (user_id, purchase_id) REFERENCES purchases(user_id, id),
  FOREIGN KEY (user_id, receipt_id) REFERENCES receipts(user_id, id)
);
CREATE TABLE purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  purchase_id UUID NOT NULL,
  name TEXT NOT NULL,
  brand TEXT, model TEXT, sku TEXT, gtin TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER CHECK (unit_price_cents >= 0),
  FOREIGN KEY (user_id, purchase_id) REFERENCES purchases(user_id, id)
);
CREATE TABLE deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  account_id UUID NOT NULL,
  nessie_deposit_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  occurred_at TIMESTAMPTZ NOT NULL,
  reference TEXT,
  simulated BOOLEAN NOT NULL DEFAULT TRUE CHECK (simulated),
  UNIQUE (user_id, nessie_deposit_id),
  FOREIGN KEY (user_id, account_id) REFERENCES accounts(user_id, id)
);
ALTER TABLE refunds ADD FOREIGN KEY (user_id, deposit_id) REFERENCES deposits(user_id, nessie_deposit_id);
ALTER TABLE cases ADD FOREIGN KEY (user_id, matching_nessie_deposit_id) REFERENCES deposits(user_id, nessie_deposit_id);
CREATE UNIQUE INDEX idx_refunds_deposit_once ON refunds(user_id, deposit_id) WHERE deposit_id IS NOT NULL;
ALTER TABLE refunds ADD CHECK (status NOT IN ('MATCHED', 'CONFIRMED') OR (deposit_id IS NOT NULL AND confirmed_amount_cents IS NOT NULL));

-- Ordinary PostgreSQL time series remains compatible with managed Tiger Data.
-- Hypertable conversion is an optional deployment step, not required to migrate.
ALTER TABLE product_offers ADD UNIQUE (user_id, source, product_url, observed_at);
ALTER TABLE price_time_series ADD UNIQUE (user_id, product_key, retailer_name, source, observed_at);
CREATE INDEX idx_jobs_due ON jobs(run_after) WHERE status IN ('QUEUED', 'RETRYING');
CREATE INDEX idx_offers_purchase_observed ON product_offers(user_id, purchase_id, observed_at DESC);

CREATE TABLE opportunity_evidence (
  user_id UUID NOT NULL REFERENCES users(id),
  opportunity_id UUID NOT NULL,
  evidence_id UUID NOT NULL,
  PRIMARY KEY (opportunity_id, evidence_id),
  FOREIGN KEY (user_id, opportunity_id) REFERENCES opportunities(user_id, id),
  FOREIGN KEY (user_id, evidence_id) REFERENCES evidence(user_id, id)
);

CREATE TABLE policy_evidence (
  user_id UUID NOT NULL REFERENCES users(id),
  policy_id UUID NOT NULL,
  evidence_id UUID NOT NULL,
  PRIMARY KEY (policy_id, evidence_id),
  FOREIGN KEY (user_id, policy_id) REFERENCES policies(user_id, id),
  FOREIGN KEY (user_id, evidence_id) REFERENCES evidence(user_id, id)
);

CREATE TABLE refund_evidence (
  user_id UUID NOT NULL REFERENCES users(id),
  refund_id UUID NOT NULL,
  evidence_id UUID NOT NULL,
  PRIMARY KEY (refund_id, evidence_id),
  FOREIGN KEY (user_id, refund_id) REFERENCES refunds(user_id, id),
  FOREIGN KEY (user_id, evidence_id) REFERENCES evidence(user_id, id)
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  opportunity_id UUID,
  type TEXT NOT NULL CHECK (type IN ('PRICE_DROP','REFUND','BILLING','RETURN_DEADLINE','WARRANTY','RENTAL','TEXTBOOK','GIFT_CARD')),
  title TEXT NOT NULL, message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), read_at TIMESTAMPTZ,
  FOREIGN KEY (user_id, opportunity_id) REFERENCES opportunities(user_id, id)
);
CREATE TABLE deadlines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  purchase_id UUID NOT NULL, policy_id UUID NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('RETURN','WARRANTY','RENTAL','TEXTBOOK','GIFT_CARD')),
  deadline_at TIMESTAMPTZ NOT NULL,
  FOREIGN KEY (user_id, purchase_id) REFERENCES purchases(user_id, id),
  FOREIGN KEY (user_id, policy_id) REFERENCES policies(user_id, id),
  UNIQUE (user_id, purchase_id, policy_id, type, deadline_at)
);
CREATE TABLE deadline_evidence (
  user_id UUID NOT NULL REFERENCES users(id),
  deadline_id UUID NOT NULL REFERENCES deadlines(id),
  evidence_id UUID NOT NULL,
  PRIMARY KEY (deadline_id, evidence_id),
  FOREIGN KEY (user_id, evidence_id) REFERENCES evidence(user_id, id)
);
ALTER TABLE deadlines ADD UNIQUE (user_id, id);
ALTER TABLE deadline_evidence ADD FOREIGN KEY (user_id, deadline_id) REFERENCES deadlines(user_id, id);
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
CREATE INDEX idx_deadlines_user_due ON deadlines(user_id, deadline_at);
