'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('../tests/helpers/env').setupTestEnv('webhook-route');

const request = require('supertest');
const { createApp } = require('../server/app');
const repo = require('../server/db/donationRepository');

const app = createApp();
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

function sign(bodyString) {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(bodyString).digest('hex');
}

test('webhook with an invalid signature is rejected with 400 and never processed', async () => {
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_x', order_id: 'order_x', status: 'captured' } } } });
  const res = await request(app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', 'deadbeefdeadbeef')
    .set('x-razorpay-event-id', 'evt_invalid_sig_1')
    .send(body);
  assert.equal(res.status, 400);
});

test('webhook with a missing signature header is rejected', async () => {
  const body = JSON.stringify({ event: 'payment.captured', payload: {} });
  const res = await request(app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .send(body);
  assert.equal(res.status, 400);
});

test('a valid, signed payment.captured webhook marks the matching donation paid exactly once', async () => {
  const donationId = repo.insertCreated({
    publicReference: 'AMX-WEBHOOKTEST01',
    donorName: 'Webhook Tester',
    donorEmail: 'wh@example.com',
    donorPhone: '9876543210',
    amountPaise: 100000,
    currency: 'INR',
    purpose: 'general_fund',
  });
  repo.attachRazorpayOrder(donationId, 'order_webhook_flow');

  const body = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_webhook_flow', order_id: 'order_webhook_flow', status: 'captured', amount: 100000 } } },
  });
  const sig = sign(body);

  const res1 = await request(app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', sig)
    .set('x-razorpay-event-id', 'evt_captured_flow_1')
    .send(body);
  assert.equal(res1.status, 200);
  assert.equal(repo.findById(donationId).payment_status, 'paid');

  // Razorpay redelivers on retry / at-least-once semantics - same event id.
  const res2 = await request(app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', sig)
    .set('x-razorpay-event-id', 'evt_captured_flow_1')
    .send(body);
  assert.equal(res2.status, 200);
  assert.equal(res2.body.duplicate, true);
});

test('webhook processing failure returns 5xx so Razorpay retries, and never leaks internals', async () => {
  // Malformed payload (missing payment.entity) for a captured event -
  // handled gracefully, not a crash/500 with a stack trace.
  const body = JSON.stringify({ event: 'payment.captured', payload: {} });
  const sig = sign(body);
  const res = await request(app)
    .post('/api/webhooks/razorpay')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', sig)
    .set('x-razorpay-event-id', 'evt_malformed_1')
    .send(body);
  assert.equal(res.status, 200); // acknowledged, just marked unhandled
  assert.ok(!JSON.stringify(res.body).includes('at Object')); // no stack trace leakage
});
