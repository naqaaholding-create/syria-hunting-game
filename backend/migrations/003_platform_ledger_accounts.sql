-- Migration 003: explicit platform ledger accounts and account uniqueness.
-- Review on a disposable database before any production use.

ALTER TABLE wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_accounts_user_id_fkey;
ALTER TABLE wallet_accounts
  ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES game_users(id);

ALTER TABLE wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_accounts_account_type_check;
ALTER TABLE wallet_accounts
  ADD CONSTRAINT wallet_accounts_account_type_check
  CHECK (account_type IN (
    'free_game','purchased_game','earnings_available','earnings_held',
    'platform_treasury','platform_reward_pool','platform_payment_clearing',
    'platform_expense','platform_revenue'
  ));

ALTER TABLE wallet_accounts
  DROP CONSTRAINT IF EXISTS wallet_accounts_user_id_account_type_currency_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_user_account_currency
  ON wallet_accounts(user_id, account_type, currency)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wallet_platform_account_currency
  ON wallet_accounts(account_type, currency)
  WHERE user_id IS NULL;

-- Ensure each user can only own player buckets and system buckets are not assigned
-- to a user. The API must enforce this too; DB roles must not permit client writes.
CREATE OR REPLACE FUNCTION validate_wallet_account_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_type LIKE 'platform\_%' ESCAPE '\' AND NEW.user_id IS NOT NULL THEN
    RAISE EXCEPTION 'platform ledger accounts must not belong to a player';
  END IF;
  IF NEW.account_type NOT LIKE 'platform\_%' ESCAPE '\' AND NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'player wallet accounts require a user';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallet_account_owner_check ON wallet_accounts;
CREATE TRIGGER wallet_account_owner_check
BEFORE INSERT OR UPDATE OF user_id, account_type ON wallet_accounts
FOR EACH ROW EXECUTE FUNCTION validate_wallet_account_owner();

-- Create standard platform control accounts. Their balances are ledger-controlled,
-- not spendable player balances.
INSERT INTO wallet_accounts(user_id, account_type, currency, balance_cents)
VALUES
  (NULL, 'platform_treasury', 'USD', 0),
  (NULL, 'platform_reward_pool', 'USD', 0),
  (NULL, 'platform_payment_clearing', 'USD', 0),
  (NULL, 'platform_expense', 'USD', 0),
  (NULL, 'platform_revenue', 'USD', 0)
ON CONFLICT (account_type, currency) WHERE user_id IS NULL DO NOTHING;
