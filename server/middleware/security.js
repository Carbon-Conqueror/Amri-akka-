'use strict';

const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { config } = require('../config');

// This is a JSON-only API - it never serves HTML, so there's no document for
// a Content-Security-Policy to protect. The CSP that matters (script-src,
// frame-src for Razorpay Checkout, etc.) lives in the <meta> tag on
// donate.html/admin/index.html, which are served by GitHub Pages instead.
// Helmet's other defaults (X-Content-Type-Options, no X-Powered-By, a
// disabled CSP here, etc.) still apply to every JSON response.
function buildHelmet() {
  return helmet({
    contentSecurityPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });
}

function buildCors() {
  return cors({
    origin(origin, callback) {
      // Same-origin requests (no Origin header, e.g. server-to-server,
      // curl, or the webhook call from Razorpay's servers) are allowed
      // through; browser cross-origin calls are checked against the
      // explicit allowlist. Never '*' - this API sets/reads cookies for
      // the admin dashboard and handles payment data.
      if (!origin) return callback(null, true);
      if (config.corsAllowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  });
}

// Public donation endpoints: generous enough for real donors retrying a
// typo, tight enough to blunt scripted abuse.
const donationCreateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please wait a few minutes and try again.' },
});

const donationVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please wait a few minutes and try again.' },
});

const statusLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many requests. Please slow down.' },
});

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Too many login attempts. Please wait before trying again.' },
});

const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  buildHelmet,
  buildCors,
  donationCreateLimiter,
  donationVerifyLimiter,
  statusLimiter,
  adminLoginLimiter,
  webhookLimiter,
};
