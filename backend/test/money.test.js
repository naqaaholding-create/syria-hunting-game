'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decimalToCents, centsToDecimal, playerPoolCents, allocateRewardPool } = require('../src/money');

test('converts decimal strings to integer cents without floating point', () => {
  assert.equal(decimalToCents('12.50'), 1250);
  assert.equal(decimalToCents('0.7'), 70);
  assert.equal(decimalToCents('9'), 900);
  assert.equal(centsToDecimal(1250), '12.50');
});

test('rejects invalid money formats', () => {
  for (const value of ['-1', '1.234', '01.00', '1e3', 'NaN', '']) {
    assert.throws(() => decimalToCents(value));
  }
});

test('player reward pool is 20 percent of eligible revenue collectively', () => {
  assert.equal(playerPoolCents(10000), 2000);
  assert.equal(playerPoolCents(999), 199);
  assert.equal(playerPoolCents(0), 0);
});

test('reward pool rejects negative or fractional cents', () => {
  assert.throws(() => playerPoolCents(-1));
  assert.throws(() => playerPoolCents(10.5));
});

test('reward allocation distributes exact pool cents proportionally and deterministically', () => {
  const result = allocateRewardPool(10, [
    { userId: 'b', points: 1 },
    { userId: 'a', points: 1 },
    { userId: 'c', points: 1 }
  ]);
  assert.equal(result.reduce((sum, p) => sum + p.rewardCents, 0), 10);
  assert.deepEqual(result, [
    { userId: 'b', rewardCents: 3 },
    { userId: 'a', rewardCents: 4 },
    { userId: 'c', rewardCents: 3 }
  ]);
});

test('zero eligible points do not distribute the pool', () => {
  assert.deepEqual(allocateRewardPool(100, [{ userId: 'a', points: 0 }]), [
    { userId: 'a', rewardCents: 0 }
  ]);
});

test('reward allocation rejects duplicate players', () => {
  assert.throws(() => allocateRewardPool(10, [
    { userId: 'a', points: 1 }, { userId: 'a', points: 2 }
  ]));
});
