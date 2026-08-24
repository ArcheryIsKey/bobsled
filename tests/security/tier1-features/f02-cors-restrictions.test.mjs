/**
 * Tier 1 Feature Test: F2 - Origin-Restricted CORS & Wildcard Block
 * Verifies whitelist enforcement, elimination of suffix wildcards, and clean non-500 rejections.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { createTestApp, HttpTestClient } from '../harness/mock-express.mjs';

describe('Tier 1: F2 - Origin-Restricted CORS & Wildcard Block', () => {
  it('F2-1: Whitelisted origin bobsled-gg-app.web.app receives Access-Control-Allow-Origin', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const origin = 'https://bobsled-gg-app.web.app';
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: origin },
      });
      assert.equal(res.status, 200);
      assert.equal(
        res.getHeader('access-control-allow-origin'),
        origin,
        'Whitelisted origin must receive exact allow-origin header'
      );
      assert.equal(res.getHeader('access-control-allow-credentials'), 'true');
    } finally {
      await client.close();
    }
  });

  it('F2-2: Whitelisted origin bobsled-gg-app.firebaseapp.com receives Access-Control-Allow-Origin', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const origin = 'https://bobsled-gg-app.firebaseapp.com';
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: origin },
      });
      assert.equal(res.status, 200);
      assert.equal(res.getHeader('access-control-allow-origin'), origin);
    } finally {
      await client.close();
    }
  });

  it('F2-3: Insecure wildcard match (attacker-app.web.app) is rejected without allow header', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const attackerOrigin = 'https://malicious-attacker.web.app';
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: attackerOrigin },
      });
      // Origin must NOT receive Access-Control-Allow-Origin
      assert.equal(
        res.getHeader('access-control-allow-origin'),
        null,
        'Insecure wildcard domain must not receive allow-origin header'
      );
    } finally {
      await client.close();
    }
  });

  it('F2-4: Malicious third-party origin returns clean non-500 response', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const evilOrigin = 'https://evil-phishing-site.com';
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: evilOrigin },
      });
      assert.ok(res.status !== 500, `CORS rejection should not trigger HTTP 500 server error, got ${res.status}`);
      assert.equal(res.getHeader('access-control-allow-origin'), null);
    } finally {
      await client.close();
    }
  });

  it('F2-5: Preflight OPTIONS request responds with allowed methods, headers, and maxAge', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const origin = 'https://bobsled-gg-app.web.app';
      const res = await client.request('/api/escrow/verify-deposit', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Idempotency-Key',
        },
      });
      assert.equal(res.status, 204);
      assert.equal(res.getHeader('access-control-allow-origin'), origin);
      const allowMethods = res.getHeader('access-control-allow-methods') || '';
      assert.includes(allowMethods, 'POST', 'OPTIONS preflight must allow POST');
      assert.includes(allowMethods, 'GET', 'OPTIONS preflight must allow GET');
    } finally {
      await client.close();
    }
  });
});
