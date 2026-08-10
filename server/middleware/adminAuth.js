'use strict';

// Server-side-only authorization guard for admin routes. There is no
// client-side "isAdmin" flag anywhere in this codebase - every admin page
// and every admin API call is re-checked here, against the session that
// was set during a verified login (see routes/admin.js), on every request.
function requireAdminAuth(req, res, next) {
  if (req.session && req.session.isAdmin === true && req.session.adminEmail) {
    return next();
  }
  return res.status(401).json({ ok: false, error: 'Authentication required.' });
}

module.exports = { requireAdminAuth };
