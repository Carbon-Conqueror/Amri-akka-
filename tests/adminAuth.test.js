'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { setupTestEnv, TEST_ADMIN_PASSWORD } = require('../tests/helpers/env');
setupTestEnv('admin-auth');

const request = require('supertest');
const { createApp } = require('../server/app');

const app = createApp();

test('admin API rejects unauthenticated requests with 401, never 200', async () => {
  const res1 = await request(app).get('/api/admin/summary');
  assert.equal(res1.status, 401);
  const res2 = await request(app).get('/api/admin/donations');
  assert.equal(res2.status, 401);
});

test('login rejects wrong password without revealing which field was wrong', async () => {
  const res = await request(app)
    .post('/api/admin/login')
    .send({ email: process.env.ADMIN_EMAIL, password: 'wrong-password' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid credentials.');
});

test('login rejects a correct password with the wrong email the same way (no user enumeration)', async () => {
  const res = await request(app)
    .post('/api/admin/login')
    .send({ email: 'not-the-admin@example.com', password: TEST_ADMIN_PASSWORD });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid credentials.');
});

test('SQL-injection-style login attempt is rejected, not treated as a bypass', async () => {
  const res = await request(app)
    .post('/api/admin/login')
    .send({ email: "admin@test.example.com' OR '1'='1", password: "' OR '1'='1" });
  assert.equal(res.status, 401);
});

test('full session lifecycle: login -> access protected route -> CSRF-protected logout -> access revoked', async () => {
  const agent = request.agent(app);

  const loginRes = await agent
    .post('/api/admin/login')
    .send({ email: process.env.ADMIN_EMAIL, password: TEST_ADMIN_PASSWORD });
  assert.equal(loginRes.status, 200);
  assert.ok(loginRes.body.csrfToken);
  const csrfToken = loginRes.body.csrfToken;

  const summaryRes = await agent.get('/api/admin/summary');
  assert.equal(summaryRes.status, 200);

  // Logout without the CSRF token must be refused.
  const noCsrfLogout = await agent.post('/api/admin/logout');
  assert.equal(noCsrfLogout.status, 403);

  // Logout with the correct token succeeds.
  const logoutRes = await agent.post('/api/admin/logout').set('X-CSRF-Token', csrfToken);
  assert.equal(logoutRes.status, 200);

  // Session is gone - protected route is 401 again.
  const afterLogout = await agent.get('/api/admin/summary');
  assert.equal(afterLogout.status, 401);
});

test('the login rate limiter blocks after repeated failed attempts', async () => {
  const agent = request.agent(app);
  let lastStatus = 0;
  for (let i = 0; i < 12; i += 1) {
    const res = await agent
      .post('/api/admin/login')
      .send({ email: process.env.ADMIN_EMAIL, password: 'wrong' });
    lastStatus = res.status;
  }
  assert.equal(lastStatus, 429);
});
