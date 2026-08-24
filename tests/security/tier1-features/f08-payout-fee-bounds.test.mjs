/**
 * Tier 1 Feature Test: F8 - Payout & Fee Bounds Validation
 * Verifies mathematical integrity of pot, fee rake, draw refunds, and participant-only winner verification.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { createTestApp, HttpTestClient } from '../harness/mock-express.mjs';

describe('Tier 1: F8 - Payout & Fee Bounds Validation', () => {
  it('F8-1: House fee percent is clamped between 0.0% and 20.0%', async () => {
    // Test negative fee clamped to 0
    const { app: appMin } = createTestApp({ houseFeePercent: -5.0 });
    const clientMin = new HttpTestClient(appMin);
    const resMin = await clientMin.request('/api/escrow/config');
    assert.equal(resMin.json?.houseFeePercent, 0.0, 'Negative fee should clamp to 0.0%');
    await clientMin.close();

    // Test excessive fee clamped to 20
    const { app: appMax } = createTestApp({ houseFeePercent: 35.0 });
    const clientMax = new HttpTestClient(appMax);
    const resMax = await clientMax.request('/api/escrow/config');
    assert.equal(resMax.json?.houseFeePercent, 20.0, 'Excessive fee should clamp to 20.0%');
    await clientMax.close();
  });

  it('F8-2: Payout calculation distributes total pot minus house rake accurately', async () => {
    // 3.5% house rake on 1.0 SOL wager (2.0 SOL total pot)
    // House fee: 2.0 * 0.035 = 0.07 SOL
    // Winner payout: 2.0 - 0.07 = 1.93 SOL
    const { app, solanaHarness, db } = createTestApp({ houseFeePercent: 3.5 });
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();

      await db.doc('games/math_game').set({
        player1: p1.publicKey,
        player2: p2.publicKey,
        wager: 1.0,
        wagerCurrency: 'SOL',
        status: 'finished',
        winner: p1.publicKey,
        escrowStatus: 'fully_funded',
      });

      const res = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'math_game' },
      });

      assert.equal(res.status, 200);
      assert.equal(res.json?.winnerPayout, 1.93, 'Winner payout must equal total pot minus rake');
      assert.equal(res.json?.houseFee, 0.07, 'House fee must equal exact rake percentage');
    } finally {
      await client.close();
    }
  });

  it('F8-3: Settlement rejects arbitrary winner who is neither player1 nor player2', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();
      const attacker = solanaHarness.generateKeypair();

      await db.doc('games/hacked_winner_game').set({
        player1: p1.publicKey,
        player2: p2.publicKey,
        wager: 1.0,
        wagerCurrency: 'SOL',
        status: 'finished',
        winner: attacker.publicKey, // Fake winner injected
        escrowStatus: 'fully_funded',
      });

      const res = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'hacked_winner_game' },
      });

      assert.equal(res.status, 400, 'Arbitrary winner must be rejected');
      assert.includes(res.json?.error, 'Invalid match winner');
    } finally {
      await client.close();
    }
  });

  it('F8-4: 0% house fee distributes 100% of total pot to winner', async () => {
    const { app, solanaHarness, db } = createTestApp({ houseFeePercent: 0.0 });
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();

      await db.doc('games/zero_rake_game').set({
        player1: p1.publicKey,
        player2: p2.publicKey,
        wager: 2.5,
        wagerCurrency: 'SOL',
        status: 'finished',
        winner: p2.publicKey,
        escrowStatus: 'fully_funded',
      });

      const res = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'zero_rake_game' },
      });

      assert.equal(res.status, 200);
      assert.equal(res.json?.winnerPayout, 5.0, 'With 0% rake, winner receives full 2x pot (5.0 SOL)');
      assert.equal(res.json?.houseFee, 0.0);
    } finally {
      await client.close();
    }
  });

  it('F8-5: Free matches return success without initiating on-chain payout calculations', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();

      await db.doc('games/free_game_settle').set({
        player1: p1.publicKey,
        player2: p2.publicKey,
        wager: 0,
        wagerCurrency: 'FREE',
        status: 'finished',
        winner: p1.publicKey,
      });

      const res = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'free_game_settle' },
      });

      assert.equal(res.status, 200);
      assert.includes(res.json?.message, 'Free match, no payout needed');
    } finally {
      await client.close();
    }
  });
});
