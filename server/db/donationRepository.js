'use strict';

const { getDb } = require('./db');

function nowIso() {
  return new Date().toISOString();
}

function insertCreated({ publicReference, donorName, donorEmail, donorPhone, amountPaise, currency, purpose }) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO donations
      (public_reference, donor_name, donor_email, donor_phone, amount, currency, purpose, payment_status, receipt_status, created_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, 'created', 'not_available', ?, ?)
  `);
  const ts = nowIso();
  const info = stmt.run(publicReference, donorName, donorEmail, donorPhone, amountPaise, currency, purpose, ts, ts);
  return Number(info.lastInsertRowid);
}

function attachRazorpayOrder(donationId, razorpayOrderId) {
  const db = getDb();
  db.prepare(`UPDATE donations SET razorpay_order_id = ?, updated_at = ? WHERE donation_id = ?`)
    .run(razorpayOrderId, nowIso(), donationId);
}

function findByOrderId(razorpayOrderId) {
  const db = getDb();
  return db.prepare(`SELECT * FROM donations WHERE razorpay_order_id = ?`).get(razorpayOrderId) || null;
}

function findByPaymentId(razorpayPaymentId) {
  const db = getDb();
  return db.prepare(`SELECT * FROM donations WHERE razorpay_payment_id = ?`).get(razorpayPaymentId) || null;
}

function findByPublicReference(publicReference) {
  const db = getDb();
  return db.prepare(`SELECT * FROM donations WHERE public_reference = ?`).get(publicReference) || null;
}

function findById(donationId) {
  const db = getDb();
  return db.prepare(`SELECT * FROM donations WHERE donation_id = ?`).get(donationId) || null;
}

/**
 * Moves a donation to 'paid' exactly once. Uses a status guard in the WHERE
 * clause so a race between the verify-endpoint and a webhook (both can
 * legitimately fire for the same payment) can't double-process or overwrite
 * a terminal state.
 */
function markPaid({ donationId, razorpayPaymentId }) {
  const db = getDb();
  const info = db.prepare(`
    UPDATE donations
    SET razorpay_payment_id = ?, payment_status = 'paid', receipt_status = 'available', updated_at = ?
    WHERE donation_id = ? AND payment_status != 'paid'
  `).run(razorpayPaymentId, nowIso(), donationId);
  return info.changes > 0;
}

function markPending({ donationId, razorpayPaymentId }) {
  const db = getDb();
  const info = db.prepare(`
    UPDATE donations
    SET razorpay_payment_id = ?, payment_status = 'pending', updated_at = ?
    WHERE donation_id = ? AND payment_status NOT IN ('paid', 'refunded')
  `).run(razorpayPaymentId, nowIso(), donationId);
  return info.changes > 0;
}

function markFailed({ donationId, razorpayPaymentId, reason }) {
  const db = getDb();
  const info = db.prepare(`
    UPDATE donations
    SET razorpay_payment_id = COALESCE(?, razorpay_payment_id), payment_status = 'failed', failure_reason = ?, updated_at = ?
    WHERE donation_id = ? AND payment_status NOT IN ('paid', 'refunded')
  `).run(razorpayPaymentId || null, reason ? String(reason).slice(0, 300) : null, nowIso(), donationId);
  return info.changes > 0;
}

function markRefunded({ donationId }) {
  const db = getDb();
  const info = db.prepare(`
    UPDATE donations SET payment_status = 'refunded', updated_at = ? WHERE donation_id = ?
  `).run(nowIso(), donationId);
  return info.changes > 0;
}

/**
 * Records that a given Razorpay webhook event id has been processed.
 * Returns true if this is the first time we've seen it (caller should
 * process it), false if it's a duplicate delivery (caller should skip
 * processing but still return 2xx to Razorpay).
 */
function recordWebhookEventOnce(eventId, eventType) {
  const db = getDb();
  try {
    db.prepare(`INSERT INTO webhook_events (razorpay_event_id, event_type, received_at) VALUES (?, ?, ?)`)
      .run(eventId, eventType, nowIso());
    return true;
  } catch (err) {
    if (String(err && err.message).includes('UNIQUE')) return false;
    throw err;
  }
}

function insertAuditLog({ adminEmail, action, detail }) {
  const db = getDb();
  db.prepare(`INSERT INTO admin_audit_log (admin_email, action, detail, created_at) VALUES (?, ?, ?, ?)`)
    .run(adminEmail, action, detail ? String(detail).slice(0, 500) : null, nowIso());
}

function listDonations({ status, purpose, from, to, search, limit = 50, offset = 0 } = {}) {
  const db = getDb();
  const clauses = [];
  const params = [];

  if (status) { clauses.push('payment_status = ?'); params.push(status); }
  if (purpose) { clauses.push('purpose = ?'); params.push(purpose); }
  if (from) { clauses.push('created_at >= ?'); params.push(from); }
  if (to) { clauses.push('created_at <= ?'); params.push(to); }
  if (search) {
    clauses.push('(public_reference LIKE ? OR donor_email LIKE ? OR donor_name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const rows = db.prepare(`
    SELECT donation_id, public_reference, donor_name, donor_email, donor_phone, amount, currency,
           purpose, payment_status, receipt_status, razorpay_order_id, razorpay_payment_id,
           created_at, updated_at
    FROM donations ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset);

  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM donations ${where}`).get(...params);

  return { rows, total: totalRow.c };
}

function summaryTotals() {
  const db = getDb();
  const rows = db.prepare(`
    SELECT payment_status, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total_amount
    FROM donations
    GROUP BY payment_status
  `).all();
  const byPurpose = db.prepare(`
    SELECT purpose, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total_amount
    FROM donations
    WHERE payment_status = 'paid'
    GROUP BY purpose
  `).all();
  return { byStatus: rows, byPurpose };
}

module.exports = {
  insertCreated,
  attachRazorpayOrder,
  findByOrderId,
  findByPaymentId,
  findByPublicReference,
  findById,
  markPaid,
  markPending,
  markFailed,
  markRefunded,
  recordWebhookEventOnce,
  insertAuditLog,
  listDonations,
  summaryTotals,
};
