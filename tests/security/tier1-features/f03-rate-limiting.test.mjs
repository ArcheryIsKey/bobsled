/**
 * Tier 1 Feature Test: F3 - Multi-Tiered Rate Limiting
 * Verifies general, auth, sensitive escrow, and cron rate limits and 429 status enforcement.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { createTestApp, HttpTestClient } from '../harness/mock-express.mjs';

describe('Tier 1: F3 - Multi-Tiered Rate Limiting', () => {
  it('F3-1: Sensitive escrow endpoint enforces strict rate limit (e.g. 3 req threshold in test harness)', async () => {
    const { app } = createTestApp({ escrowMax: 3, rateLimitWindows: true });
    const client = new HttpTestClient(app);
    try {
      // Send 3 requests - should pass
      for (let i = 0; i < 3; i++) {
        const res = await client.request('/api/escrow/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { gameId: 'g1' },
        });
        assert.ok(res.status !== 429, `Request ${i + 1} should not be rate limited, got ${res.status}`);
      }

      // 4th request must trigger 429
      const blockedRes = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'g1' },
      });
      assert.equal(blockedRes.status, 429, 'Excessive escrow requests must return HTTP 429');
      assert.ok(blockedRes.json?.error, '429 response must contain JSON error message');
    } finally {
      await client.close();
    }
  });

  it('F3-2: Auth endpoint enforces dedicated authentication rate limit tier', async () => {
    const { app } = createTestApp({ authMax: 2, rateLimitWindows: true });
    const client = new HttpTestClient(app);
    try {
      const pubkey = '11111111111111111111111111111111';
      for (let i = 0; i < 2; i++) {
        const res = await client.request('/api/auth/nonce', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { publicKey: pubkey },
        });
        assert.ok(res.status !== 429, `Auth request ${i + 1} should succeed`);
      }

      const blockedRes = await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { publicKey: pubkey },
      });
      assert.equal(blockedRes.status, 429, 'Auth flood must trigger 429 Too Many Requests');
      assert.includes(blockedRes.json?.error, 'Rate limit exceeded', 'Error message should indicate auth rate limit');
    } finally {
      await client.close();
    }
  });

  it('F3-3: Cron recovery endpoint enforces dedicated maintenance rate limiter', async () => {
    const { app } = createTestApp({ cronMax: 2, rateLimitWindows: true });
    const client = new HttpTestClient(app);
    try {
      for (let i = 0; i < 2; i++) {
        const res = await client.request('/api/cron/recover', { method: 'POST' });
        assert.equal(res.status, 200);
      }

      const blockedRes = await client.request('/api/cron/recover', { method: 'POST' });
      assert.equal(blockedRes.status, 429, 'Cron route must be rate limited on burst requests');
    } finally {
      await client.close();
    }
  });

  it('F3-4: General API limiter protects overall backend endpoints', async () => {
    const { app } = createTestApp({ generalMax: 4, rateLimitWindows: true });
    const client = new HttpTestClient(app);
    try {
      for (let i = 0; i < 4; i++) {
        const res = await client.request('/api/escrow/config');
        assert.equal(res.status, 200);
      }

      const blockedRes = await client.request('/api/escrow/config');
      assert.equal(blockedRes.status, 429, 'General route must enforce general 429 ceiling');
    } finally {
      await client.close();
    }
  });

  it('F3-5: Rate limit response includes standard headers and structured JSON', async () => {
    const { app } = createTestApp({ authMax: 1, rateLimitWindows: true });
    const client = new HttpTestClient(app);
    try {
      await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { publicKey: '11111111111111111111111111111111' },
      });

      const blockedRes = await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { publicKey: '11111111111111111111111111111111' },
      });

      assert.equal(blockedRes.status, 429);
      assert.ok(
        blockedRes.getHeader('ratelimit-limit') !== null || blockedRes.getHeader('retry-after') !== null,
        'Response should include standard rate limit headers'
      );
      assert.ok(typeof blockedRes.json?.error === 'string', 'Body must be structured JSON with error field');
    } finally {
      await client.close();
    }
  });
});
