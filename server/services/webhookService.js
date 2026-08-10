'use strict';

const repo = require('../db/donationRepository');

/**
 * Processes a verified Razorpay webhook payload. Signature verification and
 * event-id deduplication happen in the route/middleware before this is
 * called - by the time we get here, `eventId` has already been recorded as
 * "new" via recordWebhookEventOnce, so this function runs at most once per
 * event.
 *
 * Handles the events that affect donation status. Anything else is
 * acknowledged (2xx) and ignored, since Razorpay retries on non-2xx and we
 * don't want unrelated event types to cause retry storms.
 */
function processWebhookEvent({ event, payload }) {
  switch (event) {
    case 'payment.captured': {
      const payment = payload && payload.payment && payload.payment.entity;
      if (!payment) return { handled: false };
      const donation = repo.findByOrderId(payment.order_id);
      if (!donation) return { handled: false, reason: 'unknown_order' };
      repo.markPaid({ donationId: donation.donation_id, razorpayPaymentId: payment.id });
      return { handled: true };
    }

    case 'order.paid': {
      const order = payload && payload.order && payload.order.entity;
      const payment = payload && payload.payment && payload.payment.entity;
      if (!order) return { handled: false };
      const donation = repo.findByOrderId(order.id);
      if (!donation) return { handled: false, reason: 'unknown_order' };
      repo.markPaid({ donationId: donation.donation_id, razorpayPaymentId: payment ? payment.id : donation.razorpay_payment_id });
      return { handled: true };
    }

    case 'payment.failed': {
      const payment = payload && payload.payment && payload.payment.entity;
      if (!payment) return { handled: false };
      const donation = repo.findByOrderId(payment.order_id);
      if (!donation) return { handled: false, reason: 'unknown_order' };
      // Razorpay documents that a payment.failed event can, in edge cases
      // (e.g. delayed UPI/bank confirmation), be followed later by
      // payment.captured for the same payment. markFailed already guards
      // against overwriting a 'paid' donation, so a late capture event
      // will still correctly flip it to paid.
      repo.markFailed({
        donationId: donation.donation_id,
        razorpayPaymentId: payment.id,
        reason: (payment.error_description || payment.error_reason || 'payment_failed'),
      });
      return { handled: true };
    }

    case 'refund.processed': {
      const refund = payload && payload.refund && payload.refund.entity;
      if (!refund) return { handled: false };
      const donation = repo.findByPaymentId(refund.payment_id);
      if (!donation) return { handled: false, reason: 'unknown_payment' };
      repo.markRefunded({ donationId: donation.donation_id });
      return { handled: true };
    }

    default:
      return { handled: false, reason: 'ignored_event_type' };
  }
}

module.exports = { processWebhookEvent };
