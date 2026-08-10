'use strict';

const { getDb, closeDb } = require('./db');

function migrate() {
  // getDb() already applies schema.sql (CREATE TABLE IF NOT EXISTS ...),
  // so opening the connection is sufficient to bring the DB up to date.
  getDb();
  console.log('[migrate] Schema applied at', require('../config').config.dbPath);
  closeDb();
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate };
