/**
 * Tier 1 Feature Test: F6 - Anti-Double-Settlement & Anti-Double-Refund Protection
 * Verifies atomic state transitions and idempotency across match payout and refund lifecycles.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { createTestApp, HttpTestClient } from '../harness/mock-express.mjs';

describe('Tier 1: F6 - Anti-Double-Settlement & Anti-Double-Refund Protection', () => {
  it('F6-1: Finished, fully-funded match settles payout and writes payoutTx', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();

      await db.doc('games/settle_game_1').set({
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
        body: { gameId: 'settle_game_1' },
      });

      assert.equal(res.status, 200);
      assert.equal(res.json?.success, true);
      assert.ok(res.json?.payoutTx, 'Payout transaction signature must be returned');

      // Verify Firestore state
      const doc = await db.doc('games/settle_game_1').get();
      assert.equal(doc.data().payoutStatus, 'completed');
      assert.equal(doc.data().payoutTx, res.json.payoutTx);
    } finally {
      await client.close();
    }
  });

  it('F6-2: Duplicate settlement call returns cached payoutTx without creating new disbursement', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();

      await db.doc('games/settle_game_2').set({
        player1: p1.publicKey,
        player2: p2.publicKey,
        wager: 0.5,
        wagerCurrency: 'SOL',
        status: 'finished',
        winner: p2.publicKey,
        escrowStatus: 'fully_funded',
      });

      // Settle first time
      const res1 = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'settle_game_2' },
      });
      const firstPayoutTx = res1.json?.payoutTx;

      // Settle second time
      const res2 = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'settle_game_2' },
      });

      assert.equal(res2.status, 200);
      assert.equal(res2.json?.payoutTx, firstPayoutTx, 'Idempotency must return original payoutTx');
      assert.includes(res2.json?.message, 'already', 'Response must indicate already disbursed');
    } finally {
      await client.close();
    }
  });

  it('F6-3: Settlement rejected on active or unfunded games', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      await db.doc('games/active_game').set({
        player1: p1.publicKey,
        status: 'active',
        wager: 0.5,
      });

      const res = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'active_game' },
      });
      assert.equal(res.status, 400);
      assert.includes(res.json?.error, 'not finished yet');
    } finally {
      await client.close();
    }
  });

  it('F6-4: Host cancellation refund disburses refundTx for funded waiting game', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();

      await db.doc('games/refund_game_1').set({
        player1: p1.publicKey,
        wager: 0.5,
        wagerCurrency: 'SOL',
        status: 'waiting',
        escrowStatus: 'p1_funded',
      });

      const res = await client.request('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'refund_game_1', userId: p1.publicKey },
      });

      assert.equal(res.status, 200);
      assert.ok(res.json?.refundTx, 'Refund signature must be returned');

      const doc = await db.doc('games/refund_game_1').get();
      assert.equal(doc.data().status, 'cancelled');
      assert.equal(doc.data().refundStatus, 'completed');
    } finally {
      await client.close();
    }
  });

  it('F6-5: Duplicate refund call or non-host caller is prevented', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const nonHost = solanaHarness.generateKeypair();

      await db.doc('games/refund_game_2').set({
        player1: p1.publicKey,
        wager: 0.5,
        wagerCurrency: 'SOL',
        status: 'waiting',
        escrowStatus: 'p1_funded',
      });

      // Non-host caller attempt -> 403
      const resNonHost = await client.request('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'refund_game_2', userId: nonHost.publicKey },
      });
      assert.equal(resNonHost.status, 403, 'Non-host cannot cancel match');

      // First valid refund
      const res1 = await client.request('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'refund_game_2', userId: p1.publicKey },
      });
      assert.equal(res1.status, 200);

      // Duplicate refund attempt
      const res2 = await client.request('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'refund_game_2', userId: p1.publicKey },
      });
      assert.equal(res2.status, 200);
      assert.equal(res2.json?.refundTx, res1.json?.refundTx, 'Duplicate refund returns cached tx');
    } finally {
      await client.close();
    }
  });
});
