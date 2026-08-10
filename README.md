# Amrix Forde - Website & Donation Platform

This repository holds two separately-deployed pieces:

1. **The static site** (`index.html`, `donate.html`, `admin/`, `js/`) - hosted on
   **GitHub Pages** at `https://carbon-conqueror.github.io/Amri-akka-/`.
2. **The donation API** (`server/`) - a Node/Express backend that must run on a real
   Node host (Render, Railway, Fly.io, a VPS, etc.), because GitHub Pages only serves
   static files and cannot run server code, a database, or the Razorpay webhook
   endpoint.

The static site calls the API cross-origin over `fetch()`. They are not the same
deployment and are not meant to be - see "Why two deployments" below.

## Architecture

```
index.html          Main site (GitHub Pages)
donate.html          Dedicated donation page (Razorpay Standard Checkout)
admin/index.html     Admin dashboard (client-rendered, server-authorized)
js/
  config.js           Sets window.AMRIXFORDE_API_BASE - THE ONE FILE TO EDIT
                       when you deploy the API somewhere (see below)
  main.js, donate.js  Page logic for index.html / donate.html
admin/admin.js         Page logic for the admin dashboard

server/                Node/Express API - deploy this separately
  app.js               Express app wiring (helmet, CORS, sessions, routes)
  server.js             Entry point (npm start)
  config/               Central config + env validation
  db/                   SQLite (node:sqlite) schema, migrations, repository
  services/             Razorpay integration, donation logic, webhook processing
  routes/               /api/donations, /api/webhooks, /api/admin
  middleware/            Security headers, CORS, rate limits, CSRF, admin auth, errors
  scripts/createAdmin.js  Generates ADMIN_PASSWORD_HASH / SESSION_SECRET for .env
tests/                   node:test + supertest suite (58 tests, no live keys required)
```

`server/app.js` is a JSON-only API - it serves no HTML or static files at all, so
there is no path by which server source, `package.json`, `.env`, or `tests/` could
ever be exposed over HTTP by that process.

Money is stored as an integer in the smallest currency unit (paise), matching
Razorpay's own representation, to avoid floating-point rounding.

## Why two deployments

GitHub Pages is a static file host: no server process, no database, no way to keep
a Razorpay secret key server-side. Real payment verification (checking a Razorpay
signature, confirming captured status, processing signed webhooks) has to happen
somewhere the donor's browser - and GitHub Pages - cannot see or influence. That's
what `server/` is for, and it needs an actual Node runtime.

The frontend never receives, and the server never needs to expose, your Razorpay
secret key, webhook secret, or any card/UPI/OTP data. Razorpay Checkout collects
payment details directly; Amrix Forde never touches them.

## Deploying the API

Pick any Node host with persistent disk (for the SQLite file) - Render, Railway,
Fly.io, and a plain VPS all work. In broad strokes:

1. Deploy this repo (or just `server/` + `package.json`) with start command
   `npm start` (runs `server/server.js`).
2. Set the environment variables from `.env.example` on the host - see Setup below.
   Critically, `CORS_ALLOWED_ORIGINS` must include
   `https://carbon-conqueror.github.io` or the browser will reject every request
   from the site.
3. Once deployed, you'll have a URL like `https://amrix-forde-api.onrender.com`.
   Put it in **`js/config.js`**:
   ```js
   window.AMRIXFORDE_API_BASE = 'https://amrix-forde-api.onrender.com';
   ```
   This is the one file the static site reads to know where the API lives - commit
   that change and GitHub Pages will pick it up.
4. Confirm `PUBLIC_BASE_URL` on the API host matches its own real URL, and configure
   the Razorpay webhook (see below) to point at `<that-url>/api/webhooks/razorpay`.

## Setup (local development)

```bash
npm install
cp .env.example .env
npm run seed:admin   # prompts for admin email/password, prints values for .env
# edit .env: fill in RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET
#            (Test Mode keys from https://dashboard.razorpay.com/app/keys),
#            CORS_ALLOWED_ORIGINS, ADMIN_EMAIL/ADMIN_PASSWORD_HASH/SESSION_SECRET
#            from seed:admin output.
npm run migrate       # creates server/db/donations.sqlite (gitignored)
npm run dev           # API on http://localhost:3000
```

`js/config.js` already defaults to `http://localhost:3000`, so you can open
`index.html`/`donate.html`/`admin/index.html` directly (or via any static file
server, e.g. `npx serve .`) and they'll reach the local API out of the box.
`CORS_ALLOWED_ORIGINS` in `.env.example` includes `http://localhost:3000` by
default - add whatever origin you're serving the static files from if it differs
(e.g. `http://localhost:5500` for a live-reload server).

## Running tests

```bash
npm test
```

The suite (`tests/*.test.js`, run with Node's built-in test runner) needs **no live
Razorpay credentials** - it uses synthetic HMAC signatures computed with the same
algorithm Razorpay's SDK uses, and mocks the two calls that would otherwise hit
Razorpay's network API (`orders.create`, `payments.fetch`). It covers:

- Payment & webhook signature verification (valid, tampered, wrong-secret, malformed)
- Input validation (name/email/phone/amount/purpose), including XSS/SQLi-shaped input
- Idempotency: duplicate webhook delivery, double `markPaid`, unique DB constraints,
  the documented Razorpay `payment.failed` → `payment.captured` late-settlement race
- The full create-order → verify → status lifecycle, and that a forged signature
  never marks a donation paid
- Admin auth: wrong password, wrong email (no user enumeration), SQLi login attempt,
  full session + CSRF lifecycle, login rate limiting
- CORS allowlisting (never `*`), security headers, no stack-trace/path leakage,
  and that the API serves no static files (its own site pages included) at all

Separately (not part of `npm test`, done manually this session via Playwright
against a real running server), the cross-origin setup itself was verified: the
static site running on one origin successfully loaded server-driven config,
submitted the donation form, and completed admin login/CSRF/dashboard against the
API running on a different origin - including under a `/Amri-akka-/`-style subpath,
matching how GitHub Pages actually serves a project site.

## What still needs a real Razorpay account before going live

This implementation is complete and internally verified, but end-to-end verification
against Razorpay's actual servers requires credentials this environment does not
have and cannot obtain (outbound access to razorpay.com is blocked in this sandbox).
Before accepting real donations:

1. **Test Mode first.** Create a Razorpay account, switch to Test Mode, put
   `rzp_test_...` keys in the API host's environment. Use Razorpay's
   [test cards/UPI](https://razorpay.com/docs/payments/payments/test-card-upi-details/)
   to run the full flow: create-order → Checkout → success → verify → webhook →
   admin dashboard. Also test a **failed** test payment and a **cancelled** checkout.
2. **Configure the webhook** in the Razorpay Dashboard (Account & Settings →
   Webhooks) pointing at `https://<your-api-host>/api/webhooks/razorpay`, subscribed
   to at least `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`.
   Copy the webhook secret it gives you into `RAZORPAY_WEBHOOK_SECRET`.
3. **Confirm signature verification against real payloads** - the algorithms here
   were implemented directly from Razorpay's official SDK source (`razorpay-utils.js`
   in the installed `razorpay` npm package), not from possibly-stale docs, but a real
   Test Mode payment is the only way to be certain end-to-end.
4. Only after Test Mode is fully green: switch the API host's env to live
   `rzp_live_...` keys and a live webhook secret, on HTTPS, with `NODE_ENV=production`.

## Configuration flags that must stay off until legally verified

- `ENABLE_INTERNATIONAL_DONATIONS` (default `false`): accepting foreign
  contributions may require FCRA registration. Leave off until Amrix Forde's
  legal/accounting team confirms compliance and Razorpay authorizes the flow.
- `ENABLE_80G_RECEIPT_CLAIM` (default `false`) / `EIGHTY_G_REGISTRATION_NUMBER`:
  do not claim 80G tax-deductibility on receipts until Amrix Forde holds a valid,
  current 80G registration and the receipt wording has been checked against it.

## A known limitation: GitHub Pages and security headers

GitHub Pages does not let you set custom HTTP response headers, so the site cannot
send a `Content-Security-Policy`, `X-Frame-Options`, or `Strict-Transport-Security`
header the way the API does (via `helmet` in `server/middleware/security.js`). The
API's own responses still get these headers. If Amrix Forde later moves the static
site to a host that supports custom headers, a CSP equivalent to what was removed
from the API (see git history) should be added there.

## Deployment checklist

- [ ] `js/config.js` points at the real deployed API URL, committed and live on Pages
- [ ] `NODE_ENV=production`, real `RAZORPAY_KEY_ID`/`KEY_SECRET`/`WEBHOOK_SECRET` on
      the API host
- [ ] `CORS_ALLOWED_ORIGINS` includes `https://carbon-conqueror.github.io` (and any
      custom domain) and nothing else
- [ ] `SESSION_SECRET` is a fresh random 48+ byte value, not the `.env.example` one
- [ ] `ADMIN_PASSWORD_HASH` generated via `npm run seed:admin`, not a placeholder
- [ ] API is served over HTTPS (cookies are `secure`/`SameSite=None` in production
      specifically because the admin UI is cross-site from the API - see `server/app.js`)
- [ ] `server/db/donations.sqlite` is on persistent, access-controlled storage and
      is included in your backup plan (it holds donor PII - handle accordingly)
- [ ] Razorpay Dashboard webhook URL points at the deployed `/api/webhooks/razorpay`
- [ ] `npm test` passes and Test Mode end-to-end checks (above) are done
