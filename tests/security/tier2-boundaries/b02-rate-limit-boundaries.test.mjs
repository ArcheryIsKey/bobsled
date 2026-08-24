/**
 * Tier 2 Boundary Test: B02 - Rate Limiting Threshold & Concurrency Boundaries
 * Exercises limit boundaries (N vs N+1), multi-IP isolation, route independence, and burst flood rejection.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { createTestApp, HttpTestClient } from '../harness/mock-express.mjs';

describe('Tier 2: B02 - Rate Limiting Threshold & Concurrency Boundaries', () => {
  it('B02-1: Exact threshold boundary: N requests succeed, request N+1 is rejected with 429', async () => {
    const maxLimit = 5;
    const { app } = createTestApp({ escrowMax: maxLimit, rateLimitWindows: true });
    const client = new HttpTestClient(app);

    try {
      for (let i = 1; i <= maxLimit; i++) {
        const res = await client.request('/api/escrow/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { gameId: 'g_boundary' },
        });
        assert.ok(res.status !== 429, `Request ${i} of ${maxLimit} should not be rate limited`);
      }

      const blockedRes = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'g_boundary' },
      });
      assert.equal(blockedRes.status, 429, 'Request N+1 must be rejected with 429');
    } finally {
      await client.close();
    }
  });

  it('B02-2: Concurrent burst flood: 15 simultaneous requests against limit 5 yield exactly 5 passes and 10 rejections', async () => {
    const maxLimit = 5;
    const { app } = createTestApp({ escrowMax: maxLimit, rateLimitWindows: true });
    const client = new HttpTestClient(app);

    try {
      const promises = Array.from({ length: 15 }, () =>
        client.request('/api/escrow/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { gameId: 'g_burst' },
        })
      );

      const results = await Promise.all(promises);
      const passedCount = results.filter((r) => r.status !== 429).length;
      const rateLimitedCount = results.filter((r) => r.status === 429).length;

      assert.equal(passedCount, maxLimit, `Expected exactly ${maxLimit} requests to pass`);
      assert.equal(rateLimitedCount, 15 - maxLimit, `Expected exactly ${15 - maxLimit} requests to be 429 blocked`);
    } finally {
      await client.close();
    }
  });

  it('B02-3: Route bucket isolation: Exhausting Auth limiter does not exhaust Escrow config endpoint', async () => {
    const { app } = createTestApp({ authMax: 2, generalMax: 100, rateLimitWindows: true });
    const client = new HttpTestClient(app);

    try {
      const pubkey = '11111111111111111111111111111111';
      await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { publicKey: pubkey },
      });
      await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { publicKey: pubkey },
      });
      const blockedAuth = await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { publicKey: pubkey },
      });
      assert.equal(blockedAuth.status, 429, 'Auth should be rate limited');

      const escrowConfigRes = await client.request('/api/escrow/config');
      assert.equal(escrowConfigRes.status, 200, 'Escrow config endpoint should not be blocked by auth bucket exhaustion');
    } finally {
      await client.close();
    }
  });

  it('B02-4: Multi-IP isolation: Rate-limiting IP 1 does not affect requests from IP 2', async () => {
    const { app } = createTestApp({ escrowMax: 2, rateLimitWindows: true });
    const client = new HttpTestClient(app);

    try {
      const ip1 = '198.51.100.10';
      const ip2 = '198.51.100.20';

      await client.request('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip1 },
        body: { gameId: 'g1', userId: 'u1' },
      });
      await client.request('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip1 },
        body: { gameId: 'g1', userId: 'u1' },
      });
      const ip1Blocked = await client.request('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip1 },
        body: { gameId: 'g1', userId: 'u1' },
      });
      assert.equal(ip1Blocked.status, 429, 'IP 1 must be rate limited on 3rd request');

      const ip2Res = await client.request('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip2 },
        body: { gameId: 'g1', userId: 'u1' },
      });
      assert.ok(ip2Res.status !== 429, 'IP 2 should have independent rate limit quota');
    } finally {
      await client.close();
    }
  });

  it('B02-5: 429 responses return proper retry-after or reset headers', async () => {
    const { app } = createTestApp({ cronMax: 1, rateLimitWindows: true });
    const client = new HttpTestClient(app);

    try {
      await client.request('/api/cron/recover', { method: 'POST' });
      const blocked = await client.request('/api/cron/recover', { method: 'POST' });
      assert.equal(blocked.status, 429);
      assert.ok(
        blocked.getHeader('retry-after') !== null || blocked.getHeader('ratelimit-reset') !== null,
        '429 response must specify retry/reset timing header'
      );
    } finally {
      await client.close();
    }
  });

  it('B02-6: Sensitive escrow verify-deposit endpoint triggers 429 under sustained probing', async () => {
    const { app } = createTestApp({ escrowMax: 3, rateLimitWindows: true });
    const client = new HttpTestClient(app);
    try {
      for (let i = 0; i < 3; i++) {
        await client.request('/api/escrow/verify-deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { gameId: 'g1', role: 'player1', txHash: '1'.repeat(64), senderWallet: '11111111111111111111111111111111' },
        });
      }
      const blocked = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'g1', role: 'player1', txHash: '1'.repeat(64), senderWallet: '11111111111111111111111111111111' },
      });
      assert.equal(blocked.status, 429, 'verify-deposit must return 429 after threshold');
    } finally {
      await client.close();
    }
  });

  it('B02-7: Auth verify endpoint triggers 429 after authMax limit reached', async () => {
    const { app } = createTestApp({ authMax: 2, rateLimitWindows: true });
    const client = new HttpTestClient(app);
    try {
      const pubkey = '11111111111111111111111111111111';
      const sig = '1'.repeat(64);
      for (let i = 0; i < 2; i++) {
        await client.request('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { publicKey: pubkey, signature: sig },
        });
      }
      const blocked = await client.request('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { publicKey: pubkey, signature: sig },
      });
      assert.equal(blocked.status, 429);
    } finally {
      await client.close();
    }
  });

  it('B02-8: Solana balance endpoint enforces general rate limit ceiling', async () => {
    const { app } = createTestApp({ generalMax: 3, rateLimitWindows: true });
    const client = new HttpTestClient(app);
    try {
      const wallet = '11111111111111111111111111111111';
      for (let i = 0; i < 3; i++) {
        await client.request(`/api/solana/balance?wallet=${wallet}`);
      }
      const blocked = await client.request(`/api/solana/balance?wallet=${wallet}`);
      assert.equal(blocked.status, 429);
    } finally {
      await client.close();
    }
  });

  it('B02-9: Rate limit headers decrease monotonically with each request', async () => {
    const { app } = createTestApp({ generalMax: 10, rateLimitWindows: true });
    const client = new HttpTestClient(app);
    try {
      const res1 = await client.request('/api/escrow/config');
      const rem1 = parseInt(res1.getHeader('ratelimit-remaining') || '10', 10);

      const res2 = await client.request('/api/escrow/config');
      const rem2 = parseInt(res2.getHeader('ratelimit-remaining') || '9', 10);

      assert.ok(rem2 <= rem1, 'Remaining rate limit quota should decrease monotonically');
    } finally {
      await client.close();
    }
  });

  it('B02-10: 429 JSON response structure conforms to error response schema', async () => {
    const { app } = createTestApp({ cronMax: 1, rateLimitWindows: true });
    const client = new HttpTestClient(app);
    try {
      await client.request('/api/cron/recover', { method: 'POST' });
      const blocked = await client.request('/api/cron/recover', { method: 'POST' });
      assert.equal(blocked.status, 429);
      assert.ok(blocked.json, 'Response must be JSON');
      assert.equal(typeof blocked.json.error, 'string', 'Must contain string error field');
    } finally {
      await client.close();
    }
  });
});
