'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
require('../tests/helpers/env').setupTestEnv('razorpay-sig');

const razorpayService = require('../server/services/razorpayService');

function paymentSignature(orderId, paymentId, secret) {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

test('verifyPaymentSignature accepts a correctly computed signature', () => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const sig = paymentSignature('order_abc123', 'pay_xyz789', secret);
  const ok = razorpayService.verifyPaymentSignature({
    orderId: 'order_abc123',
    paymentId: 'pay_xyz789',
    signature: sig,
  });
  assert.equal(ok, true);
});

test('verifyPaymentSignature rejects a tampered order id (amount/order substitution attack)', () => {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  const sig = paymentSignature('order_abc123', 'pay_xyz789', secret);
  const ok = razorpayService.verifyPaymentSignature({
    orderId: 'order_DIFFERENT',
    paymentId: 'pay_xyz789',
    signature: sig,
  });
  assert.equal(ok, false);
});

test('verifyPaymentSignature rejects a signature computed with the wrong secret', () => {
  const sig = paymentSignature('order_abc123', 'pay_xyz789', 'wrong_secret');
  const ok = razorpayService.verifyPaymentSignature({
    orderId: 'order_abc123',
    paymentId: 'pay_xyz789',
    signature: sig,
  });
  assert.equal(ok, false);
});

test('verifyPaymentSignature rejects missing fields rather than throwing', () => {
  assert.equal(razorpayService.verifyPaymentSignature({}), false);
  assert.equal(razorpayService.verifyPaymentSignature({ orderId: 'x' }), false);
});

test('verifyPaymentSignature rejects a malformed (non-hex) signature safely', () => {
  const ok = razorpayService.verifyPaymentSignature({
    orderId: 'order_abc123',
    paymentId: 'pay_xyz789',
    signature: 'not-hex-!!!',
  });
  assert.equal(ok, false);
});

test('verifyWebhookSignature accepts a signature over the exact raw body', () => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const rawBody = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {} }));
  const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const ok = razorpayService.verifyWebhookSignature({ rawBody, signature: sig });
  assert.equal(ok, true);
});

test('verifyWebhookSignature rejects if the body is re-serialized/differs by even one byte', () => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const originalBody = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: {} }));
  const sig = crypto.createHmac('sha256', secret).update(originalBody).digest('hex');
  const tamperedBody = Buffer.from(JSON.stringify({ event: 'payment.captured', payload: { x: 1 } }));
  const ok = razorpayService.verifyWebhookSignature({ rawBody: tamperedBody, signature: sig });
  assert.equal(ok, false);
});

test('verifyWebhookSignature rejects an unsigned/empty signature', () => {
  const rawBody = Buffer.from('{}');
  assert.equal(razorpayService.verifyWebhookSignature({ rawBody, signature: '' }), false);
  assert.equal(razorpayService.verifyWebhookSignature({ rawBody, signature: null }), false);
});
