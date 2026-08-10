'use strict';

const crypto = require('node:crypto');

// Double-submit-cookie style CSRF protection for session-authenticated
// admin routes. A per-session token is generated at login, handed to the
// client once via JSON (not readable cross-site), and must be echoed back
// in the X-CSRF-Token header on every state-changing admin request.
function issueCsrfToken(req) {
  const token = crypto.randomBytes(32).toString('hex');
  req.session.csrfToken = token;
  return token;
}

function requireCsrfToken(req, res, next) {
  const sessionToken = req.session && req.session.csrfToken;
  const headerToken = req.get('X-CSRF-Token');
  if (!sessionToken || !headerToken || sessionToken !== headerToken) {
    return res.status(403).json({ ok: false, error: 'Invalid or missing CSRF token.' });
  }
  return next();
}

module.exports = { issueCsrfToken, requireCsrfToken };
