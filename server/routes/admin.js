'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { config } = require('../config');
const { sanitizeText } = require('../utils/validators');
const repo = require('../db/donationRepository');
const { requireAdminAuth } = require('../middleware/adminAuth');
const { issueCsrfToken, requireCsrfToken } = require('../middleware/csrf');
const { adminLoginLimiter } = require('../middleware/security');

const router = express.Router();

router.post('/login', adminLoginLimiter, async (req, res, next) => {
  try {
    const email = sanitizeText(req.body && req.body.email, 254).toLowerCase();
    const password = typeof (req.body && req.body.password) === 'string' ? req.body.password : '';

    if (!email || !password || !config.admin.email || !config.admin.passwordHash) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials.' });
    }

    // Constant-shape comparison: always run bcrypt.compare even if the
    // email doesn't match, so failed logins don't leak timing info about
    // which part was wrong.
    const emailMatches = email === config.admin.email.toLowerCase();
    const passwordMatches = await bcrypt.compare(password, config.admin.passwordHash || '$2a$10$invalidsaltinvalidsaltinvalidsaltinva');

    if (!emailMatches || !passwordMatches) {
      return res.status(401).json({ ok: false, error: 'Invalid credentials.' });
    }

    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.isAdmin = true;
      req.session.adminEmail = email;
      const csrfToken = issueCsrfToken(req);
      repo.insertAuditLog({ adminEmail: email, action: 'admin_login', detail: null });
      res.json({ ok: true, csrfToken });
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', requireAdminAuth, requireCsrfToken, (req, res, next) => {
  const email = req.session.adminEmail;
  req.session.destroy((err) => {
    if (err) return next(err);
    repo.insertAuditLog({ adminEmail: email, action: 'admin_logout', detail: null });
    res.clearCookie('saijeevanseva.sid');
    res.json({ ok: true });
  });
});

router.get('/session', requireAdminAuth, (req, res) => {
  res.json({ ok: true, email: req.session.adminEmail, csrfToken: req.session.csrfToken });
});

router.get('/donations', requireAdminAuth, (req, res) => {
  const { status, purpose, from, to, search } = req.query;
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const allowedStatuses = new Set(['created', 'pending', 'paid', 'failed', 'refunded']);
  const safeStatus = allowedStatuses.has(status) ? status : undefined;
  const safePurpose = config.donation.purposeIds.has(purpose) ? purpose : undefined;

  const { rows, total } = repo.listDonations({
    status: safeStatus,
    purpose: safePurpose,
    from: typeof from === 'string' ? sanitizeText(from, 40) : undefined,
    to: typeof to === 'string' ? sanitizeText(to, 40) : undefined,
    search: typeof search === 'string' ? sanitizeText(search, 100) : undefined,
    limit,
    offset,
  });

  repo.insertAuditLog({ adminEmail: req.session.adminEmail, action: 'view_donations', detail: `limit=${limit} offset=${offset}` });

  res.json({ ok: true, total, limit, offset, donations: rows });
});

router.get('/summary', requireAdminAuth, (req, res) => {
  const summary = repo.summaryTotals();
  res.json({ ok: true, ...summary });
});

module.exports = router;
