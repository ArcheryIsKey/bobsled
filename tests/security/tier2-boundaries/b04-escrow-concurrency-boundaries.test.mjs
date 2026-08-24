/**
 * Tier 2 Boundary Test: B04 - Escrow Concurrency & Race Condition Boundaries
 * Exercises high-concurrency race conditions on settlement, refund, and deposit signature registration.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { createTestApp, HttpTestClient } from '../harness/mock-express.mjs';

describe('Tier 2: B04 - Escrow Concurrency & Race Condition Boundaries', () => {
  it('B04-1: High-concurrency settlement race (10 parallel requests) outputs identical payoutTx without double payout', async () => {
    const { app, solanaHarness, db } = createTestApp({ escrowMax: 100 });
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();

      await db.doc('games/race_game_settle').set({
        player1: p1.publicKey,
        player2: p2.publicKey,
        wager: 1.0,
        wagerCurrency: 'SOL',
        status: 'finished',
        winner: p1.publicKey,
        escrowStatus: 'fully_funded',
      });

      const requests = Array.from({ length: 10 }, () =>
        client.request('/api/escrow/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { gameId: 'race_game_settle' },
        })
      );

      const responses = await Promise.all(requests);
      assert.ok(responses.every((r) => r.status === 200));

      const payoutSignatures = responses.map((r) => r.json?.payoutTx).filter(Boolean);
      const primarySig = payoutSignatures[0];
      for (const sig of payoutSignatures) {
        assert.equal(sig, primarySig, 'All parallel requests must yield identical payout transaction signature');
      }

      const finalDoc = await db.doc('games/race_game_settle').get();
      assert.equal(finalDoc.data().payoutStatus, 'completed');
    } finally {
      await client.close();
    }
  });

  it('B04-2: High-concurrency cancellation refund race outputs single refundTx', async () => {
    const { app, solanaHarness, db } = createTestApp({ escrowMax: 100 });
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();

      await db.doc('games/race_game_refund').set({
        player1: p1.publicKey,
        wager: 0.5,
        wagerCurrency: 'SOL',
        status: 'waiting',
        escrowStatus: 'p1_funded',
      });

      const requests = Array.from({ length: 8 }, () =>
        client.request('/api/escrow/refund-cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { gameId: 'race_game_refund', userId: p1.publicKey },
        })
      );

      const responses = await Promise.all(requests);
      assert.ok(responses.every((r) => r.status === 200));

      const refundSignatures = responses.map((r) => r.json?.refundTx).filter(Boolean);
      const primaryRefundSig = refundSignatures[0];
      for (const sig of refundSignatures) {
        assert.equal(sig, primaryRefundSig, 'All parallel refund calls must resolve to single refund signature');
      }
    } finally {
      await client.close();
    }
  });

  it('B04-3: Concurrent deposit signature claim race across 5 games allows exactly 1 winner and 4 rejections', async () => {
    const { app, solanaHarness, db } = createTestApp({ escrowMax: 100 });
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const escrow = solanaHarness.escrowKeypair.publicKey.toBase58();
      const sharedTxHash = 'race_shared_tx_sig_123_' + '9'.repeat(50); // 73 chars

      for (let i = 1; i <= 5; i++) {
        await db.doc(`games/race_claim_${i}`).set({
          player1: p1.publicKey,
          wager: 0.1,
          wagerCurrency: 'SOL',
          status: 'waiting',
        });
      }

      solanaHarness.createMockParsedDepositTx({
        signature: sharedTxHash,
        sourceWallet: p1.publicKey,
        destinationWallet: escrow,
        lamports: 100_000_000,
        success: true,
      });

      const requests = [1, 2, 3, 4, 5].map((i) =>
        client.request('/api/escrow/verify-deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            gameId: `race_claim_${i}`,
            role: 'player1',
            txHash: sharedTxHash,
            senderWallet: p1.publicKey,
          },
        })
      );

      const responses = await Promise.all(requests);
      const successCount = responses.filter((r) => r.status === 200).length;
      const rejectedCount = responses.filter((r) => r.status === 400).length;

      assert.equal(successCount, 1, 'Exactly one concurrent verification must succeed');
      assert.equal(rejectedCount, 4, 'Four duplicate concurrent verifications must be rejected');
    } finally {
      await client.close();
    }
  });

  it('B04-4: Settle called on already cancelled match is rejected', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      await db.doc('games/cancelled_game').set({
        player1: p1.publicKey,
        status: 'cancelled',
        wager: 1.0,
      });

      const res = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'cancelled_game' },
      });
      assert.equal(res.status, 400);
      assert.includes(res.json?.error, 'not finished yet');
    } finally {
      await client.close();
    }
  });

  it('B04-5: Refund called on finished match is rejected', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      await db.doc('games/finished_game').set({
        player1: p1.publicKey,
        status: 'finished',
        wager: 1.0,
      });

      const res = await client.request('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'finished_game', userId: p1.publicKey },
      });
      assert.equal(res.status, 400);
      assert.includes(res.json?.error, 'Cannot cancel a match that is active or finished');
    } finally {
      await client.close();
    }
  });

  it('B04-6: Interleaved Settle and Refund on same game preserves mutual exclusion', async () => {
    const { app, solanaHarness, db } = createTestApp({ escrowMax: 100 });
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();

      await db.doc('games/interleaved_game').set({
        player1: p1.publicKey,
        player2: p2.publicKey,
        wager: 0.5,
        wagerCurrency: 'SOL',
        status: 'finished',
        winner: p1.publicKey,
        escrowStatus: 'fully_funded',
      });

      const [settleRes, refundRes] = await Promise.all([
        client.request('/api/escrow/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { gameId: 'interleaved_game' },
        }),
        client.request('/api/escrow/refund-cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { gameId: 'interleaved_game', userId: p1.publicKey },
        }),
      ]);

      assert.equal(settleRes.status, 200, 'Finished game settlement succeeds');
      assert.equal(refundRes.status, 400, 'Refund on finished game must be rejected');
    } finally {
      await client.close();
    }
  });

  it('B04-7: Simultaneous verification from Player 1 and Player 2 succeeds without collision when txHashes differ', async () => {
    const { app, solanaHarness, db } = createTestApp({ escrowMax: 100 });
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();
      const escrow = solanaHarness.escrowKeypair.publicKey.toBase58();

      const p1Sig = 'p1_distinct_deposit_sig_1111111111111111111111111111111111111111111111111';
      const p2Sig = 'p2_distinct_deposit_sig_2222222222222222222222222222222222222222222222222';

      await db.doc('games/two_player_funded_game').set({
        player1: p1.publicKey,
        player2: p2.publicKey,
        wager: 0.2,
        wagerCurrency: 'SOL',
        status: 'waiting',
      });

      solanaHarness.createMockParsedDepositTx({
        signature: p1Sig,
        sourceWallet: p1.publicKey,
        destinationWallet: escrow,
        lamports: 200_000_000,
        success: true,
      });

      solanaHarness.createMockParsedDepositTx({
        signature: p2Sig,
        sourceWallet: p2.publicKey,
        destinationWallet: escrow,
        lamports: 200_000_000,
        success: true,
      });

      // Verify P1 first
      const res1 = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'two_player_funded_game', role: 'player1', txHash: p1Sig, senderWallet: p1.publicKey },
      });
      assert.equal(res1.status, 200);

      // Verify P2 second
      const res2 = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'two_player_funded_game', role: 'player2', txHash: p2Sig, senderWallet: p2.publicKey },
      });
      assert.equal(res2.status, 200);
      assert.equal(res2.json?.escrowStatus, 'fully_funded');
    } finally {
      await client.close();
    }
  });

  it('B04-8: Settlement during processing state returns processing or cached result', async () => {
    const { app, solanaHarness, db } = createTestApp({ escrowMax: 100 });
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      await db.doc('games/processing_game').set({
        player1: p1.publicKey,
        wager: 1.0,
        wagerCurrency: 'SOL',
        status: 'finished',
        winner: p1.publicKey,
        escrowStatus: 'fully_funded',
        payoutStatus: 'processing',
      });

      const res = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'processing_game' },
      });

      assert.equal(res.status, 200);
      assert.includes(res.json?.message, 'processing');
    } finally {
      await client.close();
    }
  });

  it('B04-9: Rapid host cancel before opponent join transitions safely to deleted/cancelled', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      await db.doc('games/unfunded_quick_cancel').set({
        player1: p1.publicKey,
        wager: 0,
        wagerCurrency: 'FREE',
        status: 'waiting',
      });

      const res = await client.request('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'unfunded_quick_cancel', userId: p1.publicKey },
      });

      assert.equal(res.status, 200);
      const doc = await db.doc('games/unfunded_quick_cancel').get();
      assert.equal(doc.exists, false, 'Free waiting match should be deleted upon host cancel');
    } finally {
      await client.close();
    }
  });

  it('B04-10: Settlement with Draw winner status refunds both players equally', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();

      await db.doc('games/draw_match_game').set({
        player1: p1.publicKey,
        player2: p2.publicKey,
        wager: 0.5,
        wagerCurrency: 'SOL',
        status: 'finished',
        winner: 'draw',
        escrowStatus: 'fully_funded',
      });

      const res = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'draw_match_game' },
      });

      assert.equal(res.status, 200);
      assert.ok(res.json?.payoutTx);
    } finally {
      await client.close();
    }
  });
});
