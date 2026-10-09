'use strict';

/**
 * Double-entry posting service.
 * Each entry is a signed integer number of cents. Sum of all entries must be zero.
 * This module is intentionally not wired to public routes until authentication and
 * authorization are implemented.
 */

class LedgerError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'LedgerError';
    this.code = code;
  }
}

async function postLedgerTransaction(pool, input) {
  const {
    idempotencyKey, transactionType, description,
    entries, createdBy = null, referenceType = null, referenceId = null
  } = input || {};

  if (!pool) throw new LedgerError('DATABASE_UNAVAILABLE', 'Database is not configured.');
  if (typeof idempotencyKey !== 'string' || idempotencyKey.length < 12 || idempotencyKey.length > 200) {
    throw new LedgerError('INVALID_IDEMPOTENCY_KEY', 'A valid idempotency key is required.');
  }
  if (typeof description !== 'string' || !description.trim() || description.length > 500) {
    throw new LedgerError('INVALID_DESCRIPTION', 'A short transaction description is required.');
  }
  if (!Array.isArray(entries) || entries.length < 2 || entries.length > 50) {
    throw new LedgerError('INVALID_ENTRIES', 'At least two and at most 50 ledger entries are required.');
  }

  let total = 0n;
  const normalized = entries.map((entry) => {
    if (!entry || typeof entry.accountId !== 'string' || !/^[0-9a-f-]{36}$/i.test(entry.accountId)) {
      throw new LedgerError('INVALID_ACCOUNT', 'Every ledger entry must reference an account UUID.');
    }
    if (!/^-?\d+$/.test(String(entry.amountCents))) {
      throw new LedgerError('INVALID_AMOUNT', 'Ledger amounts must be integer cents.');
    }
    const amount = BigInt(entry.amountCents);
    if (amount === 0n || amount > 9007199254740991n || amount < -9007199254740991n) {
      throw new LedgerError('INVALID_AMOUNT', 'Ledger amount is zero or outside the supported safe integer range.');
    }
    total += amount;
    return { accountId: entry.accountId, amountCents: amount.toString() };
  });
  if (total !== 0n) throw new LedgerError('UNBALANCED', 'Ledger entries must sum to zero.');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await client.query(
      'SELECT id, status FROM ledger_transactions WHERE idempotency_key = $1 FOR UPDATE',
      [idempotencyKey]
    );
    if (existing.rowCount) {
      if (existing.rows[0].status === 'posted') {
        await client.query('COMMIT');
        return { id: existing.rows[0].id, status: 'posted', duplicate: true };
      }
      throw new LedgerError('IDEMPOTENCY_CONFLICT', 'This idempotency key already exists in a non-posted state.');
    }

    const accountIds = [...new Set(normalized.map((entry) => entry.accountId))].sort();
    const accountsResult = await client.query(
      'SELECT id, balance_cents FROM wallet_accounts WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
      [accountIds]
    );
    if (accountsResult.rowCount !== accountIds.length) {
      throw new LedgerError('ACCOUNT_NOT_FOUND', 'One or more ledger accounts do not exist.');
    }
    const balances = new Map(accountsResult.rows.map((row) => [row.id, BigInt(row.balance_cents)]));

    // Aggregate entries by account before checking and updating balances.
    const deltas = new Map();
    for (const entry of normalized) {
      deltas.set(entry.accountId, (deltas.get(entry.accountId) || 0n) + BigInt(entry.amountCents));
    }
    for (const [accountId, delta] of deltas) {
      if (balances.get(accountId) + delta < 0n) {
        throw new LedgerError('INSUFFICIENT_BALANCE', 'A ledger account would become negative.');
      }
    }

    const txResult = await client.query(
      `INSERT INTO ledger_transactions
       (idempotency_key, transaction_type, status, reference_type, reference_id, description, created_by)
       VALUES ($1, $2, 'pending', $3, $4, $5, $6)
       RETURNING id`,
      [idempotencyKey, transactionType, referenceType, referenceId, description.trim(), createdBy]
    );
    const txId = txResult.rows[0].id;

    for (const entry of normalized) {
      await client.query(
        'INSERT INTO ledger_entries(transaction_id, account_id, amount_cents) VALUES ($1, $2, $3)',
        [txId, entry.accountId, entry.amountCents]
      );
    }
    for (const [accountId, delta] of deltas) {
      await client.query(
        'UPDATE wallet_accounts SET balance_cents = balance_cents + $1::bigint, updated_at = now() WHERE id = $2',
        [delta.toString(), accountId]
      );
    }
    await client.query(
      "UPDATE ledger_transactions SET status = 'posted', posted_at = now() WHERE id = $1",
      [txId]
    );
    await client.query('COMMIT');
    return { id: txId, status: 'posted', duplicate: false };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { postLedgerTransaction, LedgerError };
