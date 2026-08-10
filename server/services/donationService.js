'use strict';

const { config } = require('../config');
const razorpayService = require('./razorpayService');
const repo = require('../db/donationRepository');
const { generatePublicReference } = require('../utils/reference');

class DonationError extends Error {
  constructor(message, statusCode, publicMessage) {
    super(message);
    this.statusCode = statusCode || 400;
    this.publicMessage = publicMessage || message;
  }
}

/**
 * Creates a donation record and a matching Razorpay Order. The browser
 * supplies donor info + a requested amount/purpose; everything is
 * re-validated here against server-side rules before anything is persisted
 * or sent to Razorpay. The browser never sets amount-in-paise, currency,
 * order id, or status directly.
 */
async function createDonationOrder({ donorName, donorEmail, donorPhone, amountInr, amountPaise, purpose }) {
  const currency = config.donation.currency;

  let publicReference;
  let donationId;
  // Extremely unlikely to collide (12 random hex chars), but guard anyway
  // since public_reference has a UNIQUE constraint.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    publicReference = generatePublicReference();
    try {
      donationId = repo.insertCreated({
        publicReference,
        donorName,
        donorEmail,
        donorPhone,
        amountPaise,
        currency,
        purpose,
      });
      break;
    } catch (err) {
      if (String(err && err.message).includes('UNIQUE') && attempt < 4) continue;
      throw err;
    }
  }

  let order;
  try {
    order = await razorpayService.createOrder({
      amountPaise,
      currency,
      receipt: publicReference,
      notes: { purpose, donation_id: String(donationId) },
    });
  } catch (err) {
    repo.markFailed({ donationId, reason: 'order_creation_failed' });
    throw new DonationError(
      `Razorpay order creation failed: ${err && err.message}`,
      502,
      'We could not start your donation right now. Please try again in a moment.'
    );
  }

  repo.attachRazorpayOrder(donationId, order.id);

  return {
    publicReference,
    orderId: order.id,
    amount: amountPaise,
    amountInr,
    currency,
    purpose,
    keyId: config.razorpay.keyId,
    donorName,
    donorEmail,
    donorPhone,
  };
}

/**
 * Verifies a Checkout success callback. This is a convenience/fast-path for
 * the browser; it does NOT solely determine final status - the webhook
 * handler is the authoritative path and will independently reconcile the
 * same payment, including if the browser tab closes before this call.
 */
async function verifyCheckoutPayment({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) {
  const donation = repo.findByOrderId(razorpayOrderId);
  if (!donation) {
    throw new DonationError('Unknown order_id', 404, 'We could not find this donation.');
  }

  const signatureValid = razorpayService.verifyPaymentSignature({
    orderId: razorpayOrderId,
    paymentId: razorpayPaymentId,
    signature: razorpaySignature,
  });

  if (!signatureValid) {
    repo.markFailed({ donationId: donation.donation_id, razorpayPaymentId, reason: 'signature_verification_failed' });
    throw new DonationError('Signature verification failed', 400, 'We could not verify this payment.');
  }

  // Signature proves authenticity of the (order_id, payment_id) pair, but
  // not the payment's actual state - fetch it from Razorpay to confirm.
  let payment;
  try {
    payment = await razorpayService.fetchPayment(razorpayPaymentId);
  } catch (err) {
    // Signature was valid but we couldn't confirm capture yet - leave the
    // donation pending; the webhook will reconcile it shortly.
    repo.markPending({ donationId: donation.donation_id, razorpayPaymentId });
    return { status: 'pending', publicReference: donation.public_reference };
  }

  if (payment.status === 'captured') {
    repo.markPaid({ donationId: donation.donation_id, razorpayPaymentId });
    return { status: 'paid', publicReference: donation.public_reference };
  }

  if (payment.status === 'authorized') {
    // Standard Checkout auto-captures; reaching here usually means capture
    // is still in flight. Treat as pending, not paid.
    repo.markPending({ donationId: donation.donation_id, razorpayPaymentId });
    return { status: 'pending', publicReference: donation.public_reference };
  }

  if (payment.status === 'failed') {
    repo.markFailed({ donationId: donation.donation_id, razorpayPaymentId, reason: 'payment_failed' });
    return { status: 'failed', publicReference: donation.public_reference };
  }

  repo.markPending({ donationId: donation.donation_id, razorpayPaymentId });
  return { status: 'pending', publicReference: donation.public_reference };
}

function getStatusByPublicReference(publicReference) {
  const donation = repo.findByPublicReference(publicReference);
  if (!donation) return null;
  return {
    publicReference: donation.public_reference,
    status: donation.payment_status,
    receiptStatus: donation.receipt_status,
    amount: donation.amount,
    currency: donation.currency,
    purpose: donation.purpose,
    createdAt: donation.created_at,
  };
}

module.exports = {
  DonationError,
  createDonationOrder,
  verifyCheckoutPayment,
  getStatusByPublicReference,
};
