'use strict';

const { config } = require('../config');
const { DonationError } = require('../services/donationService');

/**
 * Centralized error handler. Never leaks stack traces, internal messages,
 * SQL text, or file paths to the client - only a safe, generic message
 * (or a DonationError's pre-approved publicMessage). Full details still go
 * to the server log for operators.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const isDonationError = err instanceof DonationError;
  const statusCode = isDonationError ? err.statusCode : (err.statusCode || 500);

  console.error('[error]', req.method, req.originalUrl, '-', err && err.message);
  if (!config.isProduction && err && err.stack) {
    console.error(err.stack);
  }

  const publicMessage = isDonationError
    ? err.publicMessage
    : (statusCode < 500 ? (err.publicMessage || 'Invalid request.') : 'Something went wrong. Please try again.');

  res.status(statusCode).json({ ok: false, error: publicMessage });
}

function notFoundHandler(req, res) {
  res.status(404).json({ ok: false, error: 'Not found.' });
}

module.exports = { errorHandler, notFoundHandler };
