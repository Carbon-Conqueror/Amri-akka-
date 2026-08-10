'use strict';

const express = require('express');
const razorpayService = require('../services/razorpayService');
const repo = require('../db/donationRepository');
const webhookService = require('../services/webhookService');
const { captureRawBody } = require('../middleware/rawBody');
const { webhookLimiter } = require('../middleware/security');

const router = express.Router();

const rawJsonParser = express.json({ verify: captureRawBody, limit: '1mb' });

router.post('/razorpay', webhookLimiter, rawJsonParser, (req, res) => {
  const signature = req.get('X-Razorpay-Signature');
  const eventId = req.get('x-razorpay-event-id');

  if (!req.rawBody || !signature) {
    // Malformed delivery - reject, but do not leak why beyond "invalid".
    return res.status(400).json({ ok: false, error: 'Invalid webhook request.' });
  }

  const valid = razorpayService.verifyWebhookSignature({
    rawBody: req.rawBody,
    signature,
  });

  if (!valid) {
    console.warn('[webhook] Rejected webhook with invalid signature. event_id=%s', eventId || '(none)');
    return res.status(400).json({ ok: false, error: 'Invalid signature.' });
  }

  const body = req.body || {};
  const event = body.event;

  // Prefer the delivery-level event id (X-Razorpay-Event-Id) for dedup, as
  // documented by Razorpay; fall back to a payload-derived id if a header
  // is ever missing so we still fail safe (never process twice on doubt).
  const dedupeKey = eventId || `${event}:${JSON.stringify(body.payload || {})}`;

  const isNewEvent = repo.recordWebhookEventOnce(dedupeKey, event || 'unknown');
  if (!isNewEvent) {
    // Already processed this exact event - acknowledge without reprocessing.
    return res.status(200).json({ ok: true, duplicate: true });
  }

  try {
    const result = webhookService.processWebhookEvent({ event, payload: body.payload });
    if (!result.handled) {
      console.log('[webhook] Unhandled/ignored event: %s (%s)', event, result.reason || '');
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    // Log full detail server-side only; Razorpay will retry on 5xx.
    console.error('[webhook] Processing error for event %s:', event, err && err.message);
    return res.status(500).json({ ok: false });
  }
});

module.exports = router;
