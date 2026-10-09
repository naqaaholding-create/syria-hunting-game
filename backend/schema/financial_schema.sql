-- رحلة صيد: draft financial schema for PostgreSQL.
-- Prototype schema only. Do not use for real-money transactions without
-- server-side business logic, security review, migrations, and accounting tests.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS game_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','restricted','suspended','closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES game_users(id),
  account_type TEXT NOT NULL
    CHECK (account_type IN ('free_game','purchased_game','earnings_available','earnings_held')),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  balance_cents BIGINT NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, account_type, currency)
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  idempotency_key TEXT NOT NULL UNIQUE,
  transaction_type TEXT NOT NULL
    CHECK (transaction_type IN (
      'grant_free','purchase_credit','shop_purchase','mission_reward',
      'reward_allocation','withdrawal_hold','withdrawal_release',
      'withdrawal_paid','refund','chargeback','admin_adjustment','reversal'
    )),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','posted','reversed','failed')),
  reference_type TEXT,
  reference_id TEXT,
  description TEXT NOT NULL,
  created_by UUID REFERENCES game_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id UUID NOT NULL REFERENCES ledger_transactions(id),
  account_id UUID NOT NULL REFERENCES wallet_accounts(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents <> 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_account_created
  ON ledger_entries(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_transactions_status_created
  ON ledger_transactions(status, created_at DESC);

CREATE TABLE IF NOT EXISTS revenue_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  eligible_revenue_cents BIGINT NOT NULL DEFAULT 0 CHECK (eligible_revenue_cents >= 0),
  player_pool_cents BIGINT NOT NULL DEFAULT 0 CHECK (player_pool_cents >= 0),
  pool_rate_basis_points INTEGER NOT NULL DEFAULT 2000
    CHECK (pool_rate_basis_points = 2000),
  definition_version TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','review','approved','distributed','closed')),
  approved_by UUID REFERENCES game_users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE TABLE IF NOT EXISTS mission_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES game_users(id),
  mission_id TEXT NOT NULL,
  score BIGINT NOT NULL CHECK (score >= 0),
  eligible BOOLEAN NOT NULL DEFAULT FALSE,
  anti_fraud_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (anti_fraud_status IN ('pending','passed','review','rejected')),
  completed_at TIMESTAMPTZ NOT NULL,
  UNIQUE (user_id, mission_id)
);
CREATE INDEX IF NOT EXISTS idx_mission_performance_period_user
  ON mission_performance(completed_at, user_id);

CREATE TABLE IF NOT EXISTS reward_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revenue_period_id UUID NOT NULL REFERENCES revenue_periods(id),
  user_id UUID NOT NULL REFERENCES game_users(id),
  eligible_points BIGINT NOT NULL CHECK (eligible_points >= 0),
  reward_cents BIGINT NOT NULL CHECK (reward_cents >= 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','posted','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (revenue_period_id, user_id)
);

CREATE TABLE IF NOT EXISTS shop_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES game_users(id),
  sku TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_cents BIGINT NOT NULL CHECK (unit_price_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  wallet_type TEXT NOT NULL
    CHECK (wallet_type IN ('free_game','purchased_game','earnings_available')),
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','paid','fulfilled','cancelled','refunded')),
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  signature_verified BOOLEAN NOT NULL DEFAULT FALSE,
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received','processed','ignored','failed')),
  related_user_id UUID REFERENCES game_users(id),
  amount_cents BIGINT CHECK (amount_cents IS NULL OR amount_cents >= 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  UNIQUE (provider, provider_event_id)
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES game_users(id),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  currency CHAR(3) NOT NULL DEFAULT 'USD' CHECK (currency = 'USD'),
  payout_provider TEXT NOT NULL,
  -- Store only a token/reference to encrypted payout destination held securely server-side.
  payout_destination_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'requested'
    CHECK (status IN (
      'requested','under_review','approved','processing','paid',
      'rejected','cancelled','failed'
    )),
  reviewed_by UUID REFERENCES game_users(id),
  review_reason TEXT,
  provider_transfer_id TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_status_time
  ON withdrawal_requests(status, requested_at);

CREATE TABLE IF NOT EXISTS admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID REFERENCES game_users(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target_time
  ON admin_audit_log(target_type, target_id, created_at DESC);

-- Application/service requirements not expressible as simple CHECK constraints:
-- * Post ledger transactions atomically and require sum(entries.amount_cents) = 0.
-- * Prevent UPDATE/DELETE on posted ledger entries via permissions/triggers.
-- * Perform balance checks and withdrawal holds in serializable/locked transactions.
-- * Never trust client-supplied prices, scores, payment confirmations, or admin identity.
-- * Keep payout destination secrets outside this database column and outside GitHub.
