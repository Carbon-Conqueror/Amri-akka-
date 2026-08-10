'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../tests/helpers/env').setupTestEnv('validators');

const {
  validateDonorName,
  validateDonorEmail,
  validateDonorPhone,
  validatePurpose,
  validateAmountInr,
  validateDonationInput,
} = require('../server/utils/validators');

test('validateDonorName rejects script injection attempts', () => {
  const r = validateDonorName('<script>alert(1)</script>');
  assert.equal(r.ok, false);
});

test('validateDonorName accepts a normal name', () => {
  const r = validateDonorName('  Asha Rao  ');
  assert.equal(r.ok, true);
  assert.equal(r.value, 'Asha Rao');
});

test('validateDonorEmail rejects malformed addresses', () => {
  assert.equal(validateDonorEmail('not-an-email').ok, false);
  assert.equal(validateDonorEmail('a@b').ok, false);
  assert.equal(validateDonorEmail('').ok, false);
});

test('validateDonorEmail lowercases and accepts valid addresses', () => {
  const r = validateDonorEmail('Donor@Example.COM');
  assert.equal(r.ok, true);
  assert.equal(r.value, 'donor@example.com');
});

test('validateDonorPhone rejects non-Indian-mobile formats', () => {
  assert.equal(validateDonorPhone('12345').ok, false);
  assert.equal(validateDonorPhone('0000000000').ok, false); // doesn't start 6-9
  assert.equal(validateDonorPhone("9876543210' OR '1'='1").ok, false);
});

test('validateDonorPhone accepts a valid 10-digit number with/without +91', () => {
  assert.equal(validateDonorPhone('9876543210').ok, true);
  assert.equal(validateDonorPhone('+91 98765 43210').ok, true);
  assert.equal(validateDonorPhone('919876543210').ok, true);
});

test('validatePurpose rejects anything not on the server-configured list', () => {
  assert.equal(validatePurpose('general_fund').ok, true);
  assert.equal(validatePurpose('made_up_purpose').ok, false);
  assert.equal(validatePurpose('').ok, false);
});

test('validateAmountInr enforces server-side min/max, not client-trusted values', () => {
  assert.equal(validateAmountInr(5).ok, false); // below min (10)
  assert.equal(validateAmountInr(600000).ok, false); // above max (500000)
  assert.equal(validateAmountInr(1.5).ok, false); // not an integer
  assert.equal(validateAmountInr('abc').ok, false);
  const r = validateAmountInr(500);
  assert.equal(r.ok, true);
  assert.equal(r.paise, 50000); // converts to smallest currency unit
});

test('validateAmountInr rejects negative and zero amounts', () => {
  assert.equal(validateAmountInr(0).ok, false);
  assert.equal(validateAmountInr(-100).ok, false);
});

test('validateDonationInput aggregates all field errors together', () => {
  const r = validateDonationInput({
    donor_name: '',
    donor_email: 'bad',
    donor_phone: '123',
    amount: 'nan',
    purpose: 'nope',
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.donor_name);
  assert.ok(r.errors.donor_email);
  assert.ok(r.errors.donor_phone);
  assert.ok(r.errors.amount);
  assert.ok(r.errors.purpose);
});

test('validateDonationInput accepts a fully valid payload and normalizes it', () => {
  const r = validateDonationInput({
    donor_name: 'Asha Rao',
    donor_email: 'asha@example.com',
    donor_phone: '9876543210',
    amount: 500,
    purpose: 'orphan_care',
  });
  assert.equal(r.ok, true);
  assert.equal(r.value.amountPaise, 50000);
  assert.equal(r.value.purpose, 'orphan_care');
});
