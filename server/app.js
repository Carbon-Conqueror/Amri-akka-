'use strict';

const express = require('express');
const session = require('express-session');
const { config } = require('./config');
const { buildHelmet, buildCors } = require('./middleware/security');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const donationsRouter = require('./routes/donations');
const webhooksRouter = require('./routes/webhooks');
const adminRouter = require('./routes/admin');

// This app is an API-only backend. The static site (index.html, donate.html,
// admin/) is served separately by GitHub Pages from the repo root - this
// server never serves any static files, so there is no path by which server
// source, package.json/lockfile, tests, node_modules, or .env could ever be
// exposed over HTTP by this process.
function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(buildHelmet());
  app.use(buildCors());

  // Webhook route is mounted BEFORE the global JSON body parser and parses
  // its own body (see routes/webhooks.js) so it can capture the exact raw
  // bytes Razorpay signed. It must never go through a parser that discards
  // or re-encodes the body first.
  app.use('/api/webhooks', webhooksRouter);

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use(
    session({
      name: 'saijeevanseva.sid',
      secret: config.admin.sessionSecret || 'dev-only-insecure-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        // The admin UI is served from a different origin (GitHub Pages) than
        // this API, so the session cookie is cross-site from the browser's
        // point of view. SameSite=None requires Secure, which in turn
        // requires HTTPS - only turn it on once the API is actually served
        // over HTTPS (i.e. in production). In local/same-origin development,
        // 'lax' + non-secure works over plain http://localhost.
        secure: config.isProduction,
        sameSite: config.isProduction ? 'none' : 'lax',
        maxAge: 1000 * 60 * 60 * 2, // 2 hours
      },
    })
  );

  app.use('/api/donations', donationsRouter);
  app.use('/api/admin', adminRouter);

  app.get('/healthz', (req, res) => {
    res.json({ ok: true, env: config.env });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
