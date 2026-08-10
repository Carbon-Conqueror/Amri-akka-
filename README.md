# Amrix Forde - Website & Donation Platform

This repository contains the Amrix Forde public website (`public/index.html`) and a
Node/Express backend that adds a production-grade, Razorpay-backed donation system:
a dedicated donation page, server-verified payments, a secure webhook endpoint, and
an admin dashboard.

## Architecture

```
public/            Static site (served by Express, never the repo root)
  index.html        Main site
  donate.html        Dedicated donation page (Razorpay Standard Checkout)
  admin/index.html   Admin dashboard (client-rendered, server-authorized)
  js/                External JS for index.html, donate.html, admin (CSP-compliant)
server/
  app.js             Express app wiring (helmet, CORS, sessions, routes)
  server.js           Entry point (npm start)
  config/             Central config + env validation
  db/                 SQLite (node:sqlite) schema, migrations, repository
  services/           Razorpay integration, donation logic, webhook processing
  routes/             /api/donations, /api/webhooks, /api/admin
  middleware/          Security headers, CORS, rate limits, CSRF, admin auth, errors
  scripts/createAdmin.js  Generates ADMIN_PASSWORD_HASH / SESSION_SECRET for .env
tests/                 node:test + supertest suite (58 tests, no live keys required)
```

Money is stored as an integer in the smallest currency unit (paise), matching
Razorpay's own representation, to avoid floating-point rounding.

## Why a backend at all

The original site was a static HTML page. Real payment verification (checking a
Razorpay signature, confirming captured status, processing signed webhooks) has to
happen somewhere the donor's browser cannot see or influence - that's this server.
The frontend never receives, and the server never needs, your Razorpay secret key,
webhook secret, or any card/UPI/OTP data. Razorpay Checkout collects payment details
directly; Amrix Forde never touches them.

## Setup

```bash
npm install
cp .env.example .env
npm run seed:admin   # prompts for admin email/password, prints values for .env
# edit .env: fill in RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET
#            (Test Mode keys from https://dashboard.razorpay.com/app/keys),
#            CORS_ALLOWED_ORIGINS, ADMIN_EMAIL/ADMIN_PASSWORD_HASH/SESSION_SECRET
#            from seed:admin output.
npm run migrate       # creates server/db/donations.sqlite (gitignored)
npm run dev           # http://localhost:3000
```

Visit `/` for the site, `/donate.html` to donate, `/admin/` for the dashboard.

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
  static file isolation (server source/`.env`/tests can never be served)

## What still needs a real Razorpay account before going live

This implementation is complete and internally verified, but end-to-end verification
against Razorpay's actual servers requires credentials this environment does not
have and cannot obtain (outbound access to razorpay.com is blocked in this sandbox).
Before accepting real donations:

1. **Test Mode first.** Create a Razorpay account, switch to Test Mode, put
   `rzp_test_...` keys in `.env`. Use Razorpay's [test cards/UPI](https://razorpay.com/docs/payments/payments/test-card-upi-details/)
   to run the full flow: create-order → Checkout → success → verify → webhook →
   admin dashboard. Also test a **failed** test payment and a **cancelled** checkout.
2. **Configure the webhook** in the Razorpay Dashboard (Account & Settings →
   Webhooks) pointing at `https://<your-domain>/api/webhooks/razorpay`, subscribed
   to at least `payment.captured`, `payment.failed`, `order.paid`, `refund.processed`.
   Copy the webhook secret it gives you into `RAZORPAY_WEBHOOK_SECRET`.
3. **Confirm signature verification against real payloads** - the algorithms here
   were implemented directly from Razorpay's official SDK source (`razorpay-utils.js`
   in the installed `razorpay` npm package), not from possibly-stale docs, but a real
   Test Mode payment is the only way to be certain end-to-end.
4. Only after Test Mode is fully green: switch `.env` to live `rzp_live_...` keys
   and a live webhook secret, on HTTPS, with `NODE_ENV=production`.

## Configuration flags that must stay off until legally verified

- `ENABLE_INTERNATIONAL_DONATIONS` (default `false`): accepting foreign
  contributions may require FCRA registration. Leave off until Amrix Forde's
  legal/accounting team confirms compliance and Razorpay authorizes the flow.
- `ENABLE_80G_RECEIPT_CLAIM` (default `false`) / `EIGHTY_G_REGISTRATION_NUMBER`:
  do not claim 80G tax-deductibility on receipts until Amrix Forde holds a valid,
  current 80G registration and the receipt wording has been checked against it.

## Deployment checklist

- [ ] `NODE_ENV=production`, real `RAZORPAY_KEY_ID`/`KEY_SECRET`/`WEBHOOK_SECRET`
- [ ] `CORS_ALLOWED_ORIGINS` set to the real donation-page origin(s) only
- [ ] `SESSION_SECRET` is a fresh random 48+ byte value, not the `.env.example` one
- [ ] `ADMIN_PASSWORD_HASH` generated via `npm run seed:admin`, not a placeholder
- [ ] Serving over HTTPS (cookies are `secure` in production - see `server/app.js`)
- [ ] `server/db/donations.sqlite` is on persistent, access-controlled storage and
      is included in your backup plan (it holds donor PII - handle accordingly)
- [ ] Razorpay Dashboard webhook URL points at the deployed `/api/webhooks/razorpay`
- [ ] `npm test` passes and Test Mode end-to-end checks (above) are done
