/**
 * Tier 1 Feature Test: F5 - Escrow Idempotency & Signature Deduplication
 * Verifies escrow_signatures collection atomic checking and replay attack mitigation.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { createTestApp, HttpTestClient } from '../harness/mock-express.mjs';

describe('Tier 1: F5 - Escrow Idempotency & Signature Deduplication', () => {
  it('F5-1: First deposit verification registers signature in escrow_signatures collection', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const player1 = solanaHarness.generateKeypair();
      const escrow = solanaHarness.escrowKeypair.publicKey.toBase58();
      const txHash = 'test_sig_unique_1_' + '1'.repeat(50); // 68 chars

      // Setup game in DB
      await db.doc('games/game_100').set({
        player1: player1.publicKey,
        wager: 0.2,
        wagerCurrency: 'SOL',
        status: 'waiting',
      });

      // Mock valid on-chain transfer
      solanaHarness.createMockParsedDepositTx({
        signature: txHash,
        sourceWallet: player1.publicKey,
        destinationWallet: escrow,
        lamports: 200_000_000,
        success: true,
      });

      const res = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          gameId: 'game_100',
          role: 'player1',
          txHash,
          senderWallet: player1.publicKey,
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.json?.success, true);
      assert.equal(res.json?.escrowStatus, 'p1_funded');

      // Verify record in escrow_signatures
      const sigDoc = await db.doc(`escrow_signatures/${txHash}`).get();
      assert.ok(sigDoc.exists, 'Signature must be recorded in escrow_signatures collection');
      assert.equal(sigDoc.data().gameId, 'game_100');
    } finally {
      await client.close();
    }
  });

  it('F5-2: Replaying the same txHash on a different match is rejected with 400 Bad Request', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const player1 = solanaHarness.generateKeypair();
      const escrow = solanaHarness.escrowKeypair.publicKey.toBase58();
      const txHash = 'test_sig_reused_2_' + '2'.repeat(50);

      // Setup 2 matches
      await db.doc('games/game_A').set({
        player1: player1.publicKey,
        wager: 0.1,
        wagerCurrency: 'SOL',
        status: 'waiting',
      });
      await db.doc('games/game_B').set({
        player1: player1.publicKey,
        wager: 0.1,
        wagerCurrency: 'SOL',
        status: 'waiting',
      });

      solanaHarness.createMockParsedDepositTx({
        signature: txHash,
        sourceWallet: player1.publicKey,
        destinationWallet: escrow,
        lamports: 100_000_000,
        success: true,
      });

      // Verify on Game A
      const resA = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'game_A', role: 'player1', txHash, senderWallet: player1.publicKey },
      });
      assert.equal(resA.status, 200);

      // Replay attempt on Game B
      const resB = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'game_B', role: 'player1', txHash, senderWallet: player1.publicKey },
      });
      assert.equal(resB.status, 400, 'Replayed signature must be rejected');
      assert.includes(resB.json?.error, 'already been registered');
    } finally {
      await client.close();
    }
  });

  it('F5-3: Replaying player 1 signature for player 2 in the same match is blocked', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();
      const escrow = solanaHarness.escrowKeypair.publicKey.toBase58();
      const txHash = 'shared_sig_replay_3_' + '3'.repeat(50);

      await db.doc('games/game_P1P2').set({
        player1: p1.publicKey,
        wager: 0.1,
        wagerCurrency: 'SOL',
        status: 'waiting',
      });

      solanaHarness.createMockParsedDepositTx({
        signature: txHash,
        sourceWallet: p1.publicKey,
        destinationWallet: escrow,
        lamports: 100_000_000,
        success: true,
      });

      // P1 deposit succeeds
      await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'game_P1P2', role: 'player1', txHash, senderWallet: p1.publicKey },
      });

      // P2 attempts to use same signature
      const resP2 = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'game_P1P2', role: 'player2', txHash, senderWallet: p2.publicKey },
      });

      assert.equal(resP2.status, 400, 'P2 cannot reuse P1 deposit signature');
    } finally {
      await client.close();
    }
  });

  it('F5-4: Verification fails gracefully if gameId does not exist', async () => {
    const { app, solanaHarness } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const res = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          gameId: 'non_existent_game_999',
          role: 'player1',
          txHash: 'any_valid_format_signature_111111111111111111111111111111111111111111111111111111',
          senderWallet: p1.publicKey,
        },
      });
      assert.equal(res.status, 404, 'Non-existent gameId must return 404');
    } finally {
      await client.close();
    }
  });

  it('F5-5: Zero-wager free match rejects deposit verification calls', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      await db.doc('games/game_free').set({
        player1: p1.publicKey,
        wager: 0,
        wagerCurrency: 'FREE',
        status: 'waiting',
      });

      const res = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          gameId: 'game_free',
          role: 'player1',
          txHash: 'free_game_dummy_sig_111111111111111111111111111111111111111111111111111111111111',
          senderWallet: p1.publicKey,
        },
      });
      assert.equal(res.status, 400);
      assert.includes(res.json?.error, 'does not require a SOL stake');
    } finally {
      await client.close();
    }
  });
});
