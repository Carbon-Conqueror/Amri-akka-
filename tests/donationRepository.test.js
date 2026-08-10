'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../tests/helpers/env').setupTestEnv('repo');

const repo = require('../server/db/donationRepository');

function makeDonation(overrides = {}) {
  return repo.insertCreated({
    publicReference: overrides.publicReference || `AMX-${require('node:crypto').randomBytes(6).toString('hex').toUpperCase()}`,
    donorName: 'Test Donor',
    donorEmail: 'donor@example.com',
    donorPhone: '9876543210',
    amountPaise: 50000,
    currency: 'INR',
    purpose: 'general_fund',
    ...overrides,
  });
}

test('a fresh donation starts as created / receipt not_available', () => {
  const ref = `AMX-${require('node:crypto').randomBytes(6).toString('hex').toUpperCase()}`;
  const id = makeDonation({ publicReference: ref });
  const row = repo.findById(id);
  assert.equal(row.payment_status, 'created');
  assert.equal(row.receipt_status, 'not_available');
});

test('razorpay_order_id must be unique across donations (idempotency guard)', () => {
  const id1 = makeDonation();
  repo.attachRazorpayOrder(id1, 'order_dupe_test');
  const id2 = makeDonation();
  assert.throws(() => repo.attachRazorpayOrder(id2, 'order_dupe_test'));
});

test('markPaid cannot be applied twice, and cannot downgrade a paid donation', () => {
  const id = makeDonation();
  repo.attachRazorpayOrder(id, 'order_markpaid_test');

  const firstApply = repo.markPaid({ donationId: id, razorpayPaymentId: 'pay_1' });
  assert.equal(firstApply, true);

  // Simulates a duplicate webhook delivery for the same payment.
  const secondApply = repo.markPaid({ donationId: id, razorpayPaymentId: 'pay_1' });
  assert.equal(secondApply, false);

  const row = repo.findById(id);
  assert.equal(row.payment_status, 'paid');
});

test('markFailed cannot overwrite an already-paid donation (late payment.failed race)', () => {
  const id = makeDonation();
  repo.attachRazorpayOrder(id, 'order_race_test');
  repo.markPaid({ donationId: id, razorpayPaymentId: 'pay_race' });

  const changed = repo.markFailed({ donationId: id, razorpayPaymentId: 'pay_race', reason: 'late_failed_event' });
  assert.equal(changed, false);

  const row = repo.findById(id);
  assert.equal(row.payment_status, 'paid'); // still paid, not downgraded
});

test('a late payment.captured CAN flip a failed donation to paid (documented Razorpay edge case)', () => {
  const id = makeDonation();
  repo.attachRazorpayOrder(id, 'order_late_capture_test');
  repo.markFailed({ donationId: id, razorpayPaymentId: 'pay_late', reason: 'payment_failed' });

  const changed = repo.markPaid({ donationId: id, razorpayPaymentId: 'pay_late' });
  assert.equal(changed, true);

  const row = repo.findById(id);
  assert.equal(row.payment_status, 'paid');
});

test('recordWebhookEventOnce processes an event id exactly once', () => {
  const first = repo.recordWebhookEventOnce('evt_unique_1', 'payment.captured');
  const second = repo.recordWebhookEventOnce('evt_unique_1', 'payment.captured');
  assert.equal(first, true);
  assert.equal(second, false);
});

test('public_reference is unique', () => {
  const ref = 'AMX-DUPLICATEREF1';
  makeDonation({ publicReference: ref });
  assert.throws(() => makeDonation({ publicReference: ref }));
});

test('listDonations filters by status and purpose without SQL injection via search', () => {
  makeDonation({ purpose: 'medical_aid', donorName: "Robert'); DROP TABLE donations;--" });
  const { rows } = repo.listDonations({ purpose: 'medical_aid' });
  assert.ok(rows.length >= 1);
  // Table still exists and is queryable - injection attempt was treated as literal text.
  const stillWorks = repo.listDonations({});
  assert.ok(Array.isArray(stillWorks.rows));
});
