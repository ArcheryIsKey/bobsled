/**
 * Tier 2 Boundary Test: B01 - HTTP Headers & CORS Adversarial Boundaries
 * Exercises origin spoofing, subdomain attacks, CRLF header injection, and malformed preflight requests.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { createTestApp, HttpTestClient } from '../harness/mock-express.mjs';

describe('Tier 2: B01 - HTTP Headers & CORS Adversarial Boundaries', () => {
  it('B01-1: Subdomain prefix spoofing (bobsled-gg-app.web.app.attacker.com) is rejected', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'https://bobsled-gg-app.web.app.attacker.com' },
      });
      assert.equal(res.getHeader('access-control-allow-origin'), null);
    } finally {
      await client.close();
    }
  });

  it('B01-2: Suffix match bypass (fake-bobsled-gg-app.web.app) is blocked', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'https://fake-bobsled-gg-app.web.app' },
      });
      assert.equal(res.getHeader('access-control-allow-origin'), null);
    } finally {
      await client.close();
    }
  });

  it('B01-3: HTTP scheme downgrade (http://bobsled-gg-app.web.app) is blocked (HTTPS required in prod)', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'http://bobsled-gg-app.web.app' },
      });
      assert.equal(res.getHeader('access-control-allow-origin'), null);
    } finally {
      await client.close();
    }
  });

  it('B01-4: Null origin with credentials is denied allow-origin', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'null' },
      });
      assert.equal(res.getHeader('access-control-allow-origin'), null);
    } finally {
      await client.close();
    }
  });

  it('B01-5: Port-spoofed origin (https://bobsled-gg-app.web.app:8080) is blocked', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'https://bobsled-gg-app.web.app:8080' },
      });
      assert.equal(res.getHeader('access-control-allow-origin'), null);
    } finally {
      await client.close();
    }
  });

  it('B01-6: Disallowed HTTP method verb (DELETE on config) is rejected', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const res = await client.request('/api/escrow/config', {
        method: 'DELETE',
      });
      assert.ok([404, 405].includes(res.status), `Expected 404 or 405 for DELETE, got ${res.status}`);
    } finally {
      await client.close();
    }
  });

  it('B01-7: CRLF Header Injection Attempt in origin does not corrupt response headers', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const injectionOrigin = 'https://bobsled-gg-app.web.app%0d%0aInjected-Header:%20Hacked';
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: injectionOrigin },
      });
      assert.equal(res.getHeader('injected-header'), null, 'Injected header must not appear');
      assert.equal(res.getHeader('access-control-allow-origin'), null);
    } finally {
      await client.close();
    }
  });

  it('B01-8: Preflight with unauthorized custom header is not whitelisted in allow-headers', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const origin = 'https://bobsled-gg-app.web.app';
      const res = await client.request('/api/escrow/verify-deposit', {
        method: 'OPTIONS',
        headers: {
          Origin: origin,
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'X-Malicious-Exploit-Header',
        },
      });
      assert.equal(res.status, 204);
      const allowHeaders = res.getHeader('access-control-allow-headers') || '';
      assert.ok(!allowHeaders.includes('X-Malicious-Exploit-Header'));
    } finally {
      await client.close();
    }
  });

  it('B01-9: Framing protection - response contains DENY regardless of client User-Agent', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const res = await client.request('/api/escrow/config', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Mobile; rv:48.0) Gecko/48.0 Firefox/48.0' },
      });
      assert.equal(res.getHeader('x-frame-options'), 'DENY');
    } finally {
      await client.close();
    }
  });

  it('B01-10: Oversized Origin header (> 4KB) handled gracefully without server crash', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    try {
      const giantOrigin = 'https://' + 'a'.repeat(4000) + '.web.app';
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: giantOrigin },
      });
      assert.ok(res.status !== 500);
      assert.equal(res.getHeader('access-control-allow-origin'), null);
    } finally {
      await client.close();
    }
  });
});
