-- Sai Jeevan Seva donations schema.
-- Money is stored in the smallest currency unit (paise for INR) as an
-- integer to avoid floating-point rounding issues, matching how Razorpay
-- itself represents amounts.

CREATE TABLE IF NOT EXISTS donations (
  donation_id        INTEGER PRIMARY KEY AUTOINCREMENT,
  public_reference    TEXT NOT NULL UNIQUE,

  donor_name          TEXT NOT NULL,
  donor_email         TEXT NOT NULL,
  donor_phone         TEXT NOT NULL,

  amount              INTEGER NOT NULL,           -- smallest currency unit (paise)
  currency             TEXT NOT NULL DEFAULT 'INR',
  purpose              TEXT NOT NULL,

  razorpay_order_id   TEXT UNIQUE,
  razorpay_payment_id TEXT UNIQUE,

  payment_status      TEXT NOT NULL DEFAULT 'created',
  receipt_status       TEXT NOT NULL DEFAULT 'not_available',

  failure_reason       TEXT,

  created_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_donations_status ON donations (payment_status);
CREATE INDEX IF NOT EXISTS idx_donations_created_at ON donations (created_at);
CREATE INDEX IF NOT EXISTS idx_donations_purpose ON donations (purpose);

-- Every webhook delivery we act on is recorded by Razorpay's event id so a
-- redelivered/duplicate webhook (Razorpay retries on non-2xx, and can also
-- send the same event more than once by design) can never be processed twice.
CREATE TABLE IF NOT EXISTS webhook_events (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  razorpay_event_id    TEXT NOT NULL UNIQUE,
  event_type           TEXT NOT NULL,
  received_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Audit log for sensitive admin actions (e.g. viewing donor PII, exporting
-- data). Kept separate from application logs so it can be retained/reviewed
-- independently.
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_email     TEXT NOT NULL,
  action          TEXT NOT NULL,
  detail          TEXT,
  created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
