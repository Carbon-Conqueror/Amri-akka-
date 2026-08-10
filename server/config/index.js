'use strict';

require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

function parseBool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return String(value).trim().toLowerCase() === 'true';
}

function parseIntEnv(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseOrigins(value) {
  if (!value) return [];
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// Donation purposes are defined here, in server config, rather than hard-coded
// in every route/service. Add/remove entries here to change what donors can
// choose without touching business logic elsewhere.
const DONATION_PURPOSES = [
  { id: 'general_fund', label: 'General Fund' },
  { id: 'orphan_care', label: 'Orphan Care' },
  { id: 'medical_aid', label: 'Medical Aid' },
  { id: 'where_needed_most', label: 'Where Needed Most' },
];

const DONATION_PURPOSE_IDS = new Set(DONATION_PURPOSES.map((p) => p.id));

const config = {
  env: NODE_ENV,
  isProduction,
  isTest,
  port: parseIntEnv(process.env.PORT, 3000),
  publicBaseUrl: process.env.PUBLIC_BASE_URL || `http://localhost:${parseIntEnv(process.env.PORT, 3000)}`,
  corsAllowedOrigins: parseOrigins(process.env.CORS_ALLOWED_ORIGINS),

  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },

  donation: {
    currency: 'INR',
    minAmountInr: parseIntEnv(process.env.DONATION_MIN_AMOUNT_INR, 10),
    maxAmountInr: parseIntEnv(process.env.DONATION_MAX_AMOUNT_INR, 500000),
    purposes: DONATION_PURPOSES,
    purposeIds: DONATION_PURPOSE_IDS,
    defaultPurposeId: 'where_needed_most',
  },

  features: {
    internationalDonationsEnabled: parseBool(process.env.ENABLE_INTERNATIONAL_DONATIONS, false),
    eightyGReceiptClaimEnabled: parseBool(process.env.ENABLE_80G_RECEIPT_CLAIM, false),
    eightyGRegistrationNumber: process.env.EIGHTY_G_REGISTRATION_NUMBER || '',
  },

  admin: {
    email: process.env.ADMIN_EMAIL || '',
    passwordHash: process.env.ADMIN_PASSWORD_HASH || '',
    sessionSecret: process.env.SESSION_SECRET || '',
  },

  dbPath: process.env.DATABASE_PATH || require('path').join(__dirname, '..', 'db', 'donations.sqlite'),
};

/**
 * Fail fast on missing required secrets, but only when it actually matters:
 * - In production, missing Razorpay/session secrets are fatal.
 * - In development/test, we warn instead of crashing so the rest of the
 *   stack (routes, validation, DB, static pages) can still be exercised
 *   without live credentials.
 */
function assertValidConfig() {
  const problems = [];

  if (!config.razorpay.keyId || !config.razorpay.keySecret) {
    problems.push('RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set.');
  }
  if (!config.razorpay.webhookSecret) {
    problems.push('RAZORPAY_WEBHOOK_SECRET is not set - webhook signatures cannot be verified.');
  }
  if (!config.admin.sessionSecret || config.admin.sessionSecret.length < 32) {
    problems.push('SESSION_SECRET is missing or too short (need 32+ chars).');
  }
  if (!config.admin.passwordHash) {
    problems.push('ADMIN_PASSWORD_HASH is not set - admin dashboard cannot authenticate anyone.');
  }
  if (config.corsAllowedOrigins.length === 0) {
    problems.push('CORS_ALLOWED_ORIGINS is empty - the public API will reject all browser requests.');
  }
  if (config.corsAllowedOrigins.includes('*')) {
    problems.push('CORS_ALLOWED_ORIGINS must not contain "*" for a payment API.');
  }
  if (config.donation.minAmountInr < 1) {
    problems.push('DONATION_MIN_AMOUNT_INR must be at least 1.');
  }
  if (config.donation.maxAmountInr <= config.donation.minAmountInr) {
    problems.push('DONATION_MAX_AMOUNT_INR must be greater than DONATION_MIN_AMOUNT_INR.');
  }

  if (problems.length > 0) {
    const message = 'Configuration problems:\n  - ' + problems.join('\n  - ');
    if (isProduction) {
      throw new Error(message);
    } else if (!isTest) {
      // eslint-disable-next-line no-console
      console.warn('\n[config] ' + message + '\n[config] Continuing in ' + NODE_ENV + ' mode, but payments will not work until these are set.\n');
    }
  }
}

module.exports = { config, assertValidConfig, DONATION_PURPOSES, DONATION_PURPOSE_IDS };
