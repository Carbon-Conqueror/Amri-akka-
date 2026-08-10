'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../tests/helpers/env').setupTestEnv('webhook-service');

const repo = require('../server/db/donationRepository');
const { processWebhookEvent } = require('../server/services/webhookService');

test('payment.captured with unknown order_id is reported unhandled, not thrown', () => {
  const result = processWebhookEvent({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_unknown', order_id: 'order_does_not_exist', status: 'captured' } } },
  });
  assert.equal(result.handled, false);
  assert.equal(result.reason, 'unknown_order');
});

test('an unrecognized event type is ignored safely (never causes an error)', () => {
  const result = processWebhookEvent({ event: 'subscription.activated', payload: {} });
  assert.equal(result.handled, false);
  assert.equal(result.reason, 'ignored_event_type');
});

test('order.paid marks the matching donation paid', () => {
  const id = repo.insertCreated({
    publicReference: 'AMX-ORDERPAIDTEST1',
    donorName: 'Order Paid Tester',
    donorEmail: 'op@example.com',
    donorPhone: '9876543210',
    amountPaise: 25000,
    currency: 'INR',
    purpose: 'general_fund',
  });
  repo.attachRazorpayOrder(id, 'order_paid_event_test');

  const result = processWebhookEvent({
    event: 'order.paid',
    payload: {
      order: { entity: { id: 'order_paid_event_test' } },
      payment: { entity: { id: 'pay_order_paid_event' } },
    },
  });
  assert.equal(result.handled, true);
  assert.equal(repo.findById(id).payment_status, 'paid');
});

test('refund.processed marks the matching donation refunded', () => {
  const id = repo.insertCreated({
    publicReference: 'AMX-REFUNDTEST0001',
    donorName: 'Refund Tester',
    donorEmail: 'rf@example.com',
    donorPhone: '9876543210',
    amountPaise: 30000,
    currency: 'INR',
    purpose: 'general_fund',
  });
  repo.attachRazorpayOrder(id, 'order_refund_test');
  repo.markPaid({ donationId: id, razorpayPaymentId: 'pay_refund_test' });

  const result = processWebhookEvent({
    event: 'refund.processed',
    payload: { refund: { entity: { id: 'rfnd_1', payment_id: 'pay_refund_test' } } },
  });
  assert.equal(result.handled, true);
  assert.equal(repo.findById(id).payment_status, 'refunded');
});

test('payment.failed records a truncated, non-sensitive failure reason', () => {
  const id = repo.insertCreated({
    publicReference: 'AMX-FAILEDTEST0001',
    donorName: 'Failed Tester',
    donorEmail: 'ft@example.com',
    donorPhone: '9876543210',
    amountPaise: 15000,
    currency: 'INR',
    purpose: 'general_fund',
  });
  repo.attachRazorpayOrder(id, 'order_failed_test');

  const result = processWebhookEvent({
    event: 'payment.failed',
    payload: {
      payment: {
        entity: {
          id: 'pay_failed_test',
          order_id: 'order_failed_test',
          status: 'failed',
          error_description: 'Insufficient balance in account',
        },
      },
    },
  });
  assert.equal(result.handled, true);
  const row = repo.findById(id);
  assert.equal(row.payment_status, 'failed');
  assert.equal(row.failure_reason, 'Insufficient balance in account');
});
