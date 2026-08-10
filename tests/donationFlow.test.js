'use strict';

const { test, mock } = require('node:test');
const assert = require('node:assert/strict');
require('../tests/helpers/env').setupTestEnv('donation-flow');

const request = require('supertest');
const razorpayService = require('../server/services/razorpayService');
const { createApp } = require('../server/app');

const app = createApp();

test('create-order rejects invalid input before ever touching Razorpay or the DB', async () => {
  const createOrderMock = mock.method(razorpayService, 'createOrder', async () => {
    throw new Error('should not be called for invalid input');
  });

  const res = await request(app)
    .post('/api/donations/create-order')
    .send({ donor_name: '', donor_email: 'bad', donor_phone: '123', amount: -5, purpose: 'nope' });

  assert.equal(res.status, 422);
  assert.equal(createOrderMock.mock.callCount(), 0);
  createOrderMock.mock.restore();
});

test('create-order never trusts a client-supplied amount/currency - only server-validated values reach Razorpay', async () => {
  let capturedArgs = null;
  const createOrderMock = mock.method(razorpayService, 'createOrder', async (args) => {
    capturedArgs = args;
    return { id: 'order_mocked_123' };
  });

  const res = await request(app)
    .post('/api/donations/create-order')
    .send({
      donor_name: 'Asha Rao',
      donor_email: 'asha@example.com',
      donor_phone: '9876543210',
      amount: 500, // rupees, as a donor would type
      purpose: 'medical_aid',
      // An attacker-controlled client could try to smuggle extra fields -
      // they must be ignored entirely.
      amount_paise_override: 1,
      currency: 'USD',
      key_secret: 'leak_attempt',
    });

  assert.equal(res.status, 201);
  assert.equal(capturedArgs.amountPaise, 50000); // server-derived from validated rupees, not attacker input
  assert.equal(capturedArgs.currency, 'INR');
  assert.equal(res.body.key_id, process.env.RAZORPAY_KEY_ID);
  assert.equal(res.body.key_id.includes(process.env.RAZORPAY_KEY_SECRET), false);
  assert.ok(res.body.public_reference.startsWith('AMX-'));
  assert.equal(JSON.stringify(res.body).includes(process.env.RAZORPAY_KEY_SECRET), false);

  createOrderMock.mock.restore();
});

test('a Razorpay order-creation failure returns a safe generic error, not internal details', async () => {
  const createOrderMock = mock.method(razorpayService, 'createOrder', async () => {
    throw new Error('ECONNREFUSED 10.0.0.1:443 secret=super-secret-value');
  });

  const res = await request(app)
    .post('/api/donations/create-order')
    .send({ donor_name: 'Asha Rao', donor_email: 'asha@example.com', donor_phone: '9876543210', amount: 500, purpose: 'general_fund' });

  assert.equal(res.status, 502);
  assert.equal(JSON.stringify(res.body).includes('secret=super-secret-value'), false);
  assert.equal(JSON.stringify(res.body).includes('ECONNREFUSED'), false);

  createOrderMock.mock.restore();
});

test('full happy path: create-order -> valid checkout signature -> captured payment -> paid status', async () => {
  const createOrderMock = mock.method(razorpayService, 'createOrder', async () => ({ id: 'order_happy_path' }));
  const createRes = await request(app)
    .post('/api/donations/create-order')
    .send({ donor_name: 'Priya Nair', donor_email: 'priya@example.com', donor_phone: '9876543211', amount: 1000, purpose: 'where_needed_most' });
  assert.equal(createRes.status, 201);
  createOrderMock.mock.restore();

  const orderId = createRes.body.order_id;
  const publicRef = createRes.body.public_reference;
  const paymentId = 'pay_happy_path';

  const crypto = require('node:crypto');
  const signature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');

  const fetchPaymentMock = mock.method(razorpayService, 'fetchPayment', async () => ({ id: paymentId, status: 'captured' }));
  const verifyRes = await request(app)
    .post('/api/donations/verify')
    .send({ razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: signature });
  fetchPaymentMock.mock.restore();

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.status, 'paid');

  const statusRes = await request(app).get(`/api/donations/status/${publicRef}`);
  assert.equal(statusRes.status, 200);
  assert.equal(statusRes.body.status, 'paid');
  assert.equal(statusRes.body.receipt_status, 'available');
  // Public status endpoint must never leak donor PII.
  assert.equal(JSON.stringify(statusRes.body).includes('priya@example.com'), false);
});

test('verify rejects a forged signature and does not mark the donation paid', async () => {
  const createOrderMock = mock.method(razorpayService, 'createOrder', async () => ({ id: 'order_forged_sig' }));
  const createRes = await request(app)
    .post('/api/donations/create-order')
    .send({ donor_name: 'Test Attacker', donor_email: 'atk@example.com', donor_phone: '9876543212', amount: 200, purpose: 'general_fund' });
  createOrderMock.mock.restore();

  const orderId = createRes.body.order_id;
  const publicRef = createRes.body.public_reference;

  const verifyRes = await request(app)
    .post('/api/donations/verify')
    .send({ razorpay_order_id: orderId, razorpay_payment_id: 'pay_forged', razorpay_signature: 'a'.repeat(64) });

  assert.equal(verifyRes.status, 400);

  const statusRes = await request(app).get(`/api/donations/status/${publicRef}`);
  assert.equal(statusRes.body.status, 'failed');
});
