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

function allocateRewardPool(poolCents, players) {
  if (!Number.isSafeInteger(poolCents) || poolCents < 0) {
    throw new TypeError('Pool must be non-negative integer cents.');
  }
  if (!Array.isArray(players)) throw new TypeError('Players must be an array.');
  const normalized = players.map((p) => {
    if (!p || typeof p.userId !== 'string' || !p.userId.trim()) throw new TypeError('Each player needs a userId.');
    if (!Number.isSafeInteger(p.points) || p.points < 0) throw new TypeError('Points must be non-negative integers.');
    return { userId: p.userId, points: p.points };
  });
  if (new Set(normalized.map((p) => p.userId)).size !== normalized.length) throw new TypeError('Duplicate userId.');
  const totalPoints = normalized.reduce((sum, p) => sum + BigInt(p.points), 0n);
  if (totalPoints === 0n || poolCents === 0) {
    return normalized.map((p) => ({ userId: p.userId, rewardCents: 0 }));
  }
  const pool = BigInt(poolCents);
  const denominator = totalPoints;
  const ranked = normalized.map((p) => {
    const numerator = pool * BigInt(p.points);
    return {
      userId: p.userId,
      rewardCents: Number(numerator / denominator),
      remainder: numerator % denominator
    };
  });
  let remaining = poolCents - ranked.reduce((sum, p) => sum + p.rewardCents, 0);
  const order = [...ranked].sort((a, b) => {
    if (a.remainder !== b.remainder) return a.remainder > b.remainder ? -1 : 1;
    return a.userId.localeCompare(b.userId);
  });
  for (let i = 0; i < remaining; i += 1) order[i].rewardCents += 1;
  return ranked.map(({ userId, rewardCents }) => ({ userId, rewardCents }));
}

module.exports = { decimalToCents, centsToDecimal, playerPoolCents, allocateRewardPool };
