'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');

const TEST_ADMIN_PASSWORD = 'TestPassw0rd!123';

// Each test file that needs a live DB/config should require this BEFORE
// requiring anything under server/ - it sets process.env so server/config
// picks up deterministic, isolated test values (Node's test runner gives
// each test file its own process, so this is safe to do per-file).
function setupTestEnv(dbName) {
  process.env.NODE_ENV = 'test';
  process.env.RAZORPAY_KEY_ID = 'rzp_test_unittest';
  process.env.RAZORPAY_KEY_SECRET = 'unit_test_key_secret';
  process.env.RAZORPAY_WEBHOOK_SECRET = 'unit_test_webhook_secret';
  process.env.DONATION_MIN_AMOUNT_INR = '10';
  process.env.DONATION_MAX_AMOUNT_INR = '500000';
  process.env.CORS_ALLOWED_ORIGINS = 'http://allowed.example.com';
  process.env.SESSION_SECRET = 'a'.repeat(48);
  process.env.ADMIN_EMAIL = 'admin@test.example.com';
  // Low cost factor keeps the suite fast; never do this outside tests.
  process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync(TEST_ADMIN_PASSWORD, 4);
  process.env.DATABASE_PATH = path.join(
    require('node:os').tmpdir(),
    `saijeevanseva-test-${dbName}-${crypto.randomBytes(4).toString('hex')}.sqlite`
  );
  return process.env.DATABASE_PATH;
}

module.exports = { setupTestEnv, TEST_ADMIN_PASSWORD };
