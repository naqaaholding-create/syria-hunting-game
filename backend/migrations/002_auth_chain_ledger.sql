-- Migration 002: auth primitives and TRON event tracking.
-- Apply only after reviewing against the current schema. No live money movement is enabled.

CREATE TABLE IF NOT EXISTS user_credentials (
  user_id UUID PRIMARY KEY REFERENCES game_users(id) ON DELETE CASCADE,
  password_hash TEXT NOT NULL,
  password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until TIMESTAMPTZ,
  mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES game_users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_agent_hash TEXT,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_expiry
  ON auth_sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS wallet_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES game_users(id) ON DELETE CASCADE,
  chain TEXT NOT NULL CHECK (chain IN ('tron')),
  address TEXT NOT NULL,
  verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified','pending','verified','revoked')),
  nonce_hash TEXT,
  nonce_expires_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wallet_connections_user
  ON wallet_connections(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chain_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chain TEXT NOT NULL CHECK (chain IN ('tron-shasta','tron-mainnet')),
  token_symbol TEXT NOT NULL CHECK (token_symbol = 'USDT'),
  token_contract TEXT NOT NULL,
  tx_hash TEXT NOT NULL,
  event_index INTEGER NOT NULL CHECK (event_index >= 0),
  sender_address TEXT NOT NULL,
  recipient_address TEXT NOT NULL,
  amount_base_units NUMERIC(78,0) NOT NULL CHECK (amount_base_units > 0),
  block_number BIGINT,
  confirmations INTEGER NOT NULL DEFAULT 0 CHECK (confirmations >= 0),
  chain_status TEXT NOT NULL DEFAULT 'detected'
    CHECK (chain_status IN ('detected','confirming','confirmed','failed','reorged','credited','ignored')),
  assigned_user_id UUID REFERENCES game_users(id),
  ledger_transaction_id UUID REFERENCES ledger_transactions(id),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at TIMESTAMPTZ,
  credited_at TIMESTAMPTZ,
  UNIQUE (chain, token_contract, tx_hash, event_index)
);
CREATE INDEX IF NOT EXISTS idx_chain_deposits_status_detected
  ON chain_deposits(chain_status, detected_at);
CREATE INDEX IF NOT EXISTS idx_chain_deposits_recipient
  ON chain_deposits(chain, recipient_address, block_number);

CREATE TABLE IF NOT EXISTS chain_watcher_cursors (
  chain TEXT PRIMARY KEY CHECK (chain IN ('tron-shasta','tron-mainnet')),
  last_scanned_block BIGINT NOT NULL DEFAULT 0 CHECK (last_scanned_block >= 0),
  last_success_at TIMESTAMPTZ,
  last_error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payout_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  withdrawal_request_id UUID NOT NULL UNIQUE REFERENCES withdrawal_requests(id),
  chain TEXT NOT NULL CHECK (chain IN ('tron-shasta','tron-mainnet')),
  token_contract TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  amount_base_units NUMERIC(78,0) NOT NULL CHECK (amount_base_units > 0),
  tx_hash TEXT UNIQUE,
  transfer_status TEXT NOT NULL DEFAULT 'queued'
    CHECK (transfer_status IN ('queued','awaiting_manual_transfer','broadcast','confirmed','failed','cancelled')),
  submitted_by UUID REFERENCES game_users(id),
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  failure_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payout_transfers_status
  ON payout_transfers(transfer_status, created_at);

-- A posted transaction must have at least two entries that sum to zero.
-- The deferred trigger checks the final state at commit, allowing entries to be
-- inserted before the transaction is marked posted inside the same DB transaction.
CREATE OR REPLACE FUNCTION assert_posted_ledger_balanced() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tx_id UUID;
  tx_status TEXT;
  entry_count BIGINT;
  net_amount NUMERIC;
BEGIN
  tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  SELECT status INTO tx_status FROM ledger_transactions WHERE id = tx_id;
  IF tx_status = 'posted' THEN
    SELECT COUNT(*), COALESCE(SUM(amount_cents), 0)
      INTO entry_count, net_amount
      FROM ledger_entries WHERE transaction_id = tx_id;
    IF entry_count < 2 OR net_amount <> 0 THEN
      RAISE EXCEPTION 'posted ledger transaction must balance';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS ledger_balance_check_entries ON ledger_entries;
CREATE CONSTRAINT TRIGGER ledger_balance_check_entries
AFTER INSERT OR UPDATE OR DELETE ON ledger_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_posted_ledger_balanced();

CREATE OR REPLACE FUNCTION prevent_posted_ledger_entry_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  tx_id UUID;
  tx_status TEXT;
BEGIN
  tx_id := COALESCE(NEW.transaction_id, OLD.transaction_id);
  SELECT status INTO tx_status FROM ledger_transactions WHERE id = tx_id;
  IF tx_status = 'posted' THEN
    RAISE EXCEPTION 'posted ledger entries are immutable; use a reversal';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS ledger_immutable_entries ON ledger_entries;
CREATE TRIGGER ledger_immutable_entries
BEFORE UPDATE OR DELETE ON ledger_entries
FOR EACH ROW EXECUTE FUNCTION prevent_posted_ledger_entry_mutation();

-- Production must additionally restrict direct DB writes by application role,
-- protect admin actions with MFA and separation of duties, and test rollback paths.
