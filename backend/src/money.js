'use strict';

const MAX_SAFE_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

function decimalToCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new TypeError('Amount must be a decimal string or number.');
  }
  const text = String(value).trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) throw new TypeError('Amount must be a non-negative decimal with at most two decimal places.');
  const whole = BigInt(match[1]);
  const fraction = BigInt((match[2] || '').padEnd(2, '0') || '0');
  const cents = whole * 100n + fraction;
  if (cents > MAX_SAFE_CENTS) throw new RangeError('Amount is too large.');
  return Number(cents);
}

function centsToDecimal(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new TypeError('Cents must be a non-negative safe integer.');
  return (cents / 100).toString() + '.' + String(cents % 100).padStart(2, '0');
}

function playerPoolCents(eligibleRevenueCents) {
  if (!Number.isSafeInteger(eligibleRevenueCents) || eligibleRevenueCents < 0) {
    throw new TypeError('Eligible revenue must be non-negative integer cents.');
  }
  return Math.floor(eligibleRevenueCents * 0.2);
}

module.exports = { decimalToCents, centsToDecimal, playerPoolCents };
