/**
 * Tier 1 Feature Test: F1 - HTTP Security Headers
 * Verifies security headers in firebase.json configuration and Express Helmet middleware.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, assert } from '../harness/test-runner.mjs';
import { createTestApp, HttpTestClient } from '../harness/mock-express.mjs';

describe('Tier 1: F1 - HTTP Security Headers (firebase.json & Express)', () => {
  it('F1-1: firebase.json specifies nosniff, DENY, Referrer-Policy, and HSTS headers on wildcards', () => {
    const firebaseJsonPath = path.join(process.cwd(), 'firebase.json');
    assert.ok(fs.existsSync(firebaseJsonPath), 'firebase.json must exist');
    const config = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));

    assert.ok(config.hosting, 'hosting block must be present');
    assert.ok(Array.isArray(config.hosting.headers), 'headers block must be an array');

    const globalHeadersEntry = config.hosting.headers.find((h) => h.source === '**');
    assert.ok(globalHeadersEntry, 'Global wildcard "**" header rule must exist in firebase.json');

    const headersMap = new Map();
    globalHeadersEntry.headers.forEach((h) => headersMap.set(h.key.toLowerCase(), h.value));

    assert.equal(headersMap.get('x-content-type-options'), 'nosniff', 'nosniff header must match');
    assert.equal(headersMap.get('x-frame-options'), 'DENY', 'X-Frame-Options must be DENY');
    assert.equal(headersMap.get('referrer-policy'), 'strict-origin-when-cross-origin', 'Referrer-Policy mismatch');
    assert.includes(headersMap.get('strict-transport-security'), 'max-age=31536000', 'HSTS max-age must be 1yr');
    assert.includes(headersMap.get('strict-transport-security'), 'includeSubDomains', 'HSTS must include subdomains');
  });

  it('F1-2: Express backend returns X-Frame-Options: DENY on API endpoints', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const res = await client.request('/api/escrow/config');
      assert.equal(res.status, 200);
      assert.equal(res.getHeader('x-frame-options'), 'DENY', 'Express should return X-Frame-Options: DENY');
    } finally {
      await client.close();
    }
  });

  it('F1-3: Express backend returns X-Content-Type-Options: nosniff', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const res = await client.request('/api/escrow/config');
      assert.equal(res.getHeader('x-content-type-options'), 'nosniff', 'nosniff header missing or mismatch');
    } finally {
      await client.close();
    }
  });

  it('F1-4: Express backend returns Referrer-Policy and Permissions-Policy', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const res = await client.request('/api/escrow/config');
      assert.equal(
        res.getHeader('referrer-policy'),
        'strict-origin-when-cross-origin',
        'Referrer-Policy header must match'
      );
      assert.equal(
        res.getHeader('permissions-policy'),
        'camera=(), microphone=(), geolocation=()',
        'Permissions-Policy must disable camera/microphone/geolocation'
      );
    } finally {
      await client.close();
    }
  });

  it('F1-5: Express backend enforces Content-Security-Policy with strict directives', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const res = await client.request('/api/escrow/config');
      const csp = res.getHeader('content-security-policy');
      assert.ok(csp, 'Content-Security-Policy header must be present');
      assert.includes(csp, "default-src 'self'", 'CSP must define default-src self');
      assert.includes(csp, "object-src 'none'", 'CSP must prohibit object plugins');
      assert.includes(csp, "frame-ancestors 'none'", 'CSP must disallow embedding frame ancestors');
      assert.includes(csp, 'https://api.mainnet-beta.solana.com', 'CSP must whitelist Solana RPC endpoints');
    } finally {
      await client.close();
    }
  });
});
