'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
require('../tests/helpers/env').setupTestEnv('security');

const request = require('supertest');
const { createApp } = require('../server/app');

const app = createApp();

test('CORS rejects an origin that is not on the allowlist', async () => {
  const res = await request(app)
    .get('/api/donations/config')
    .set('Origin', 'https://evil.example.com');
  assert.notEqual(res.headers['access-control-allow-origin'], 'https://evil.example.com');
  assert.notEqual(res.headers['access-control-allow-origin'], '*');
});

test('CORS allows the explicitly configured origin', async () => {
  const res = await request(app)
    .get('/api/donations/config')
    .set('Origin', 'http://allowed.example.com');
  assert.equal(res.headers['access-control-allow-origin'], 'http://allowed.example.com');
});

test('never sends Access-Control-Allow-Origin: * on any response', async () => {
  const res = await request(app).get('/api/donations/config').set('Origin', 'http://allowed.example.com');
  assert.notEqual(res.headers['access-control-allow-origin'], '*');
});

test('security headers are present on API responses (nosniff, referrer policy, no X-Powered-By)', async () => {
  // This app is JSON-only and serves no HTML documents - CSP is a
  // document-level protection and is intentionally left to the pages
  // themselves (served by GitHub Pages), not sent here.
  const res = await request(app).get('/healthz');
  assert.ok(res.headers['x-content-type-options']);
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  assert.ok(res.headers['referrer-policy']);
  assert.equal(res.headers['x-powered-by'], undefined);
});

test('a 404 API route responds without leaking a stack trace or file paths', async () => {
  const res = await request(app).get('/api/this-route-does-not-exist');
  assert.equal(res.status, 404);
  const bodyText = JSON.stringify(res.body);
  assert.equal(bodyText.includes('/server/'), false);
  assert.equal(bodyText.includes('.js:'), false);
  assert.equal(bodyText.includes('node_modules'), false);
});

test('this app serves no static files at all - only /api and /healthz respond', async () => {
  // The static site (index.html, donate.html, admin/) is served separately
  // by GitHub Pages, not by this process, so nothing here should ever
  // resolve a file path - including the site's own pages.
  const paths = [
    '/package.json', '/package-lock.json', '/.env', '/.env.example',
    '/server/config/index.js', '/server/server.js', '/tests/security.test.js',
    '/index.html', '/donate.html', '/admin/index.html', '/js/main.js',
  ];
  for (const p of paths) {
    const res = await request(app).get(p);
    assert.equal(res.status, 404, `expected 404 for ${p}, got ${res.status}`);
  }
});

test('donation creation input is rejected when amount is a non-numeric injection attempt', async () => {
  const res = await request(app)
    .post('/api/donations/create-order')
    .send({
      donor_name: 'Attacker',
      donor_email: 'a@example.com',
      donor_phone: '9876543210',
      amount: '1; DROP TABLE donations;--',
      purpose: 'general_fund',
    });
  assert.equal(res.status, 422);
});

test('donation creation input rejects an XSS payload in the name field', async () => {
  const res = await request(app)
    .post('/api/donations/create-order')
    .send({
      donor_name: '<img src=x onerror=alert(1)>',
      donor_email: 'a@example.com',
      donor_phone: '9876543210',
      amount: 100,
      purpose: 'general_fund',
    });
  assert.equal(res.status, 422);
  assert.ok(res.body.errors.donor_name);
});

test('the JSON body parser rejects oversized request bodies', async () => {
  const bigName = 'A'.repeat(200 * 1024); // 200kb, over the 100kb limit
  const res = await request(app)
    .post('/api/donations/create-order')
    .send({ donor_name: bigName, donor_email: 'a@example.com', donor_phone: '9876543210', amount: 100, purpose: 'general_fund' });
  assert.equal(res.status, 413);
});

test('donation status lookup rejects a malformed/guessed reference format', async () => {
  const res = await request(app).get('/api/donations/status/not-a-real-reference');
  assert.equal(res.status, 422);
});

test('donation status lookup 404s for a well-formed but unknown reference', async () => {
  const res = await request(app).get('/api/donations/status/AMX-000000000000');
  assert.equal(res.status, 404);
});
