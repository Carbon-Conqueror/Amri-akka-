'use strict';

const { config } = require('../config');

const NAME_RE = /^[\p{L}\p{M}' .-]{2,80}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Indian mobile numbers: optional +91/91 prefix, then a 10-digit number
// starting 6-9. International donor phone support is intentionally out of
// scope while ENABLE_INTERNATIONAL_DONATIONS is false.
const PHONE_IN_RE = /^(\+?91[-\s]?)?[6-9]\d{9}$/;

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function sanitizeText(v, maxLen) {
  if (typeof v !== 'string') return '';
  // Strip control characters and collapse surrounding whitespace. This is
  // for storage/display hygiene, not the sole XSS defense - output encoding
  // at render time (and using a real templating/escaping layer) is what
  // actually prevents XSS.
  // eslint-disable-next-line no-control-regex
  const cleaned = v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  return cleaned.slice(0, maxLen);
}

function validateDonorName(v) {
  const s = sanitizeText(v, 80);
  if (!NAME_RE.test(s)) return { ok: false, error: 'Please enter a valid name.' };
  return { ok: true, value: s };
}

function validateDonorEmail(v) {
  const s = sanitizeText(v, 254).toLowerCase();
  if (!EMAIL_RE.test(s)) return { ok: false, error: 'Please enter a valid email address.' };
  return { ok: true, value: s };
}

function validateDonorPhone(v) {
  const s = sanitizeText(v, 20);
  // Donors type numbers with all sorts of spacing/hyphenation
  // ("+91 98765 43210", "98765-43210") - normalize whitespace/hyphens away
  // before validating shape, rather than trying to enumerate every layout.
  const compact = s.replace(/[\s-]/g, '');
  if (!PHONE_IN_RE.test(compact)) {
    return { ok: false, error: 'Please enter a valid 10-digit Indian mobile number.' };
  }
  const digits = compact.replace(/\D/g, '').slice(-10);
  return { ok: true, value: digits };
}

function validatePurpose(v) {
  const s = sanitizeText(v, 40);
  if (!config.donation.purposeIds.has(s)) {
    return { ok: false, error: 'Please choose a valid donation purpose.' };
  }
  return { ok: true, value: s };
}

/**
 * Accepts an amount in whole INR rupees (as entered by a donor) and
 * validates it against the server-side configured min/max. Returns the
 * amount in paise (the smallest currency unit) for use with Razorpay.
 */
function validateAmountInr(v) {
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    return { ok: false, error: 'Amount must be a whole number of rupees.' };
  }
  if (n < config.donation.minAmountInr || n > config.donation.maxAmountInr) {
    return {
      ok: false,
      error: `Amount must be between ₹${config.donation.minAmountInr} and ₹${config.donation.maxAmountInr}.`,
    };
  }
  return { ok: true, value: n, paise: n * 100 };
}

function validateDonationInput(body) {
  const errors = {};
  const out = {};

  const name = validateDonorName(body && body.donor_name);
  if (!name.ok) errors.donor_name = name.error; else out.donorName = name.value;

  const email = validateDonorEmail(body && body.donor_email);
  if (!email.ok) errors.donor_email = email.error; else out.donorEmail = email.value;

  const phone = validateDonorPhone(body && body.donor_phone);
  if (!phone.ok) errors.donor_phone = phone.error; else out.donorPhone = phone.value;

  const purpose = validatePurpose(body && body.purpose);
  if (!purpose.ok) errors.purpose = purpose.error; else out.purpose = purpose.value;

  const amount = validateAmountInr(body && body.amount);
  if (!amount.ok) errors.amount = amount.error; else {
    out.amountInr = amount.value;
    out.amountPaise = amount.paise;
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, value: out };
}

module.exports = {
  validateDonorName,
  validateDonorEmail,
  validateDonorPhone,
  validatePurpose,
  validateAmountInr,
  validateDonationInput,
  sanitizeText,
  isNonEmptyString,
};
