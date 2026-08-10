'use strict';

const crypto = require('node:crypto');

// Non-guessable public donation reference, safe to show to donors and to
// use as a lookup key for the status-polling endpoint. Not a database
// primary key and not sequential, so it can't be enumerated.
function generatePublicReference() {
  const random = crypto.randomBytes(6).toString('hex').toUpperCase(); // 12 hex chars
  return `AMX-${random}`;
}

module.exports = { generatePublicReference };
