'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { decimalToCents, centsToDecimal, playerPoolCents } = require('../src/money');

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
