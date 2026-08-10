'use strict';

const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { config } = require('./config');
const { buildHelmet, buildCors } = require('./middleware/security');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const donationsRouter = require('./routes/donations');
const webhooksRouter = require('./routes/webhooks');
const adminRouter = require('./routes/admin');

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
      name: 'amrixforde.sid',
      secret: config.admin.sessionSecret || 'dev-only-insecure-secret-change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'strict',
        maxAge: 1000 * 60 * 60 * 2, // 2 hours
      },
    })
  );

  app.use('/api/donations', donationsRouter);
  app.use('/api/admin', adminRouter);

  app.get('/healthz', (req, res) => {
    res.json({ ok: true, env: config.env });
  });

  // Static site (index.html, donate.html, admin UI) is served from a
  // dedicated public/ directory - never the repo root - so server source,
  // package.json/lockfile, tests, and node_modules can never be served as
  // static files even by accident.
  app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', extensions: ['html'] }));

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
