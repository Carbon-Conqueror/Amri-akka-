'use strict';

const crypto = require('node:crypto');
const Razorpay = require('razorpay');
const { config } = require('../config');

let client = null;

function getClient() {
  if (client) return client;
  if (!config.razorpay.keyId || !config.razorpay.keySecret) {
    throw new Error('Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing).');
  }
  client = new Razorpay({
    key_id: config.razorpay.keyId,
    key_secret: config.razorpay.keySecret,
  });
  return client;
}

/**
 * Creates a Razorpay Order server-side. Amount must already be validated
 * and expressed in the smallest currency unit (paise for INR) by the caller
 * - this function does not re-derive or trust any client-supplied amount.
 */
async function createOrder({ amountPaise, currency, receipt, notes }) {
  const order = await getClient().orders.create({
    amount: amountPaise,
    currency,
    receipt,
    notes,
  });
  return order;
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Verifies the signature returned by Checkout after a payment attempt.
 * Algorithm per Razorpay's own SDK (razorpay-utils.js):
 *   HMAC-SHA256(order_id + '|' + payment_id, key_secret) === razorpay_signature
 * This alone only proves the payment/order pair is authentic; it is NOT a
 * substitute for checking the order's actual captured status server-side.
 */
function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!orderId || !paymentId || !signature) return false;
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return timingSafeEqualHex(expected, signature);
}

/**
 * Verifies an incoming webhook using the RAW request body (not the parsed
 * JSON) per Razorpay's documented/implemented algorithm:
 *   HMAC-SHA256(raw_body, webhook_secret) === X-Razorpay-Signature header
 */
function verifyWebhookSignature({ rawBody, signature }) {
  if (!rawBody || !signature) return false;
  if (!config.razorpay.webhookSecret) return false;
  const expected = crypto
    .createHmac('sha256', config.razorpay.webhookSecret)
    .update(rawBody)
    .digest('hex');
  return timingSafeEqualHex(expected, signature);
}

async function fetchPayment(paymentId) {
  return getClient().payments.fetch(paymentId);
}

module.exports = {
  getClient,
  createOrder,
  verifyPaymentSignature,
  verifyWebhookSignature,
  fetchPayment,
};
