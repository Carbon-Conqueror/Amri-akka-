'use strict';

const express = require('express');
const { config } = require('../config');
const { validateDonationInput, sanitizeText } = require('../utils/validators');
const donationService = require('../services/donationService');
const { donationCreateLimiter, donationVerifyLimiter, statusLimiter } = require('../middleware/security');

const router = express.Router();

const PUBLIC_REF_RE = /^AMX-[0-9A-F]{12}$/;
const RAZORPAY_ID_RE = /^[A-Za-z0-9_]{1,64}$/;

router.get('/config', (req, res) => {
  res.json({
    ok: true,
    currency: config.donation.currency,
    minAmountInr: config.donation.minAmountInr,
    maxAmountInr: config.donation.maxAmountInr,
    purposes: config.donation.purposes,
    defaultPurposeId: config.donation.defaultPurposeId,
    internationalDonationsEnabled: config.features.internationalDonationsEnabled,
    keyId: config.razorpay.keyId || null,
  });
});

router.post('/create-order', donationCreateLimiter, async (req, res, next) => {
  try {
    const result = validateDonationInput(req.body);
    if (!result.ok) {
      return res.status(422).json({ ok: false, errors: result.errors });
    }

    const { donorName, donorEmail, donorPhone, amountInr, amountPaise, purpose } = result.value;

    const order = await donationService.createDonationOrder({
      donorName,
      donorEmail,
      donorPhone,
      amountInr,
      amountPaise,
      purpose,
    });

    res.status(201).json({
      ok: true,
      order_id: order.orderId,
      amount: order.amount,
      currency: order.currency,
      key_id: order.keyId,
      public_reference: order.publicReference,
      purpose: order.purpose,
      prefill: {
        name: order.donorName,
        email: order.donorEmail,
        contact: order.donorPhone,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/verify', donationVerifyLimiter, async (req, res, next) => {
  try {
    const orderId = sanitizeText(req.body && req.body.razorpay_order_id, 64);
    const paymentId = sanitizeText(req.body && req.body.razorpay_payment_id, 64);
    const signature = sanitizeText(req.body && req.body.razorpay_signature, 256);

    if (!RAZORPAY_ID_RE.test(orderId) || !RAZORPAY_ID_RE.test(paymentId) || !signature) {
      return res.status(422).json({ ok: false, error: 'Missing or malformed payment confirmation.' });
    }

    const result = await donationService.verifyCheckoutPayment({
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });

    res.json({ ok: true, status: result.status, public_reference: result.publicReference });
  } catch (err) {
    next(err);
  }
});

router.get('/status/:publicReference', statusLimiter, (req, res, next) => {
  try {
    const ref = sanitizeText(req.params.publicReference, 20).toUpperCase();
    if (!PUBLIC_REF_RE.test(ref)) {
      return res.status(422).json({ ok: false, error: 'Invalid reference.' });
    }
    const status = donationService.getStatusByPublicReference(ref);
    if (!status) {
      return res.status(404).json({ ok: false, error: 'Donation not found.' });
    }
    // Public-safe subset only - no donor name/email/phone here.
    res.json({
      ok: true,
      public_reference: status.publicReference,
      status: status.status,
      receipt_status: status.receiptStatus,
      amount: status.amount,
      currency: status.currency,
      purpose: status.purpose,
      created_at: status.createdAt,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
