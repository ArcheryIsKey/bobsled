/**
 * Tier 4: Real-World Application & Attack Scenarios
 * End-to-end multi-step simulations of real-world adversarial attack vectors and exploits.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { createTestApp, HttpTestClient } from '../harness/mock-express.mjs';
import { FirestoreRulesEvaluator, MockFirestore } from '../harness/mock-firestore.mjs';

describe('Tier 4: Real-World Application & Attack Scenarios', () => {
  it('Scenario 1: [The Double-Spend Replay Attacker] Attempting to fund 5 matches with 1 deposit hash', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const attacker = solanaHarness.generateKeypair();
      const escrow = solanaHarness.escrowKeypair.publicKey.toBase58();
      const singleTxHash = 'real_solana_deposit_hash_single_use_' + '9'.repeat(40); // 76 chars (valid >=64)

      // Attacker actually deposits 0.5 SOL once on-chain
      solanaHarness.createMockParsedDepositTx({
        signature: singleTxHash,
        sourceWallet: attacker.publicKey,
        destinationWallet: escrow,
        lamports: 500_000_000,
        success: true,
      });

      // Attacker creates 5 different matches in Firestore
      for (let i = 1; i <= 5; i++) {
        await db.doc(`games/match_target_${i}`).set({
          player1: attacker.publicKey,
          wager: 0.5,
          wagerCurrency: 'SOL',
          status: 'waiting',
        });
      }

      // First verification on Match 1 succeeds
      const res1 = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          gameId: 'match_target_1',
          role: 'player1',
          txHash: singleTxHash,
          senderWallet: attacker.publicKey,
        },
      });
      assert.equal(res1.status, 200, 'First deposit verification must succeed');
      assert.equal(res1.json?.escrowStatus, 'p1_funded');

      // Subsequent 4 verification attempts on Match 2..5 MUST all fail
      for (let i = 2; i <= 5; i++) {
        const replayRes = await client.request('/api/escrow/verify-deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: {
            gameId: `match_target_${i}`,
            role: 'player1',
            txHash: singleTxHash,
            senderWallet: attacker.publicKey,
          },
        });
        assert.equal(replayRes.status, 400, `Replay verification on match ${i} must fail with 400`);
        assert.includes(replayRes.json?.error, 'already been registered');
      }

      // Verify that matches 2..5 remain unfunded
      for (let i = 2; i <= 5; i++) {
        const doc = await db.doc(`games/match_target_${i}`).get();
        assert.equal(doc.data().escrowStatus, undefined, `Match ${i} must not be marked funded`);
      }
    } finally {
      await client.close();
    }
  });

  it('Scenario 2: [The Settlement Race Condition Exploiter] Rapid 20-thread burst to double-settle pot', async () => {
    const { app, solanaHarness, db } = createTestApp({ escrowMax: 100 });
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();

      const gameId = 'high_stakes_race_match';
      await db.doc(`games/${gameId}`).set({
        player1: p1.publicKey,
        player2: p2.publicKey,
        wager: 5.0,
        wagerCurrency: 'SOL',
        status: 'finished',
        winner: p1.publicKey,
        escrowStatus: 'fully_funded',
      });

      // Attacker fires 20 settlement requests simultaneously
      const burstRequests = Array.from({ length: 20 }, () =>
        client.request('/api/escrow/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { gameId },
        })
      );

      const responses = await Promise.all(burstRequests);
      assert.ok(responses.every((r) => r.status === 200));

      const payoutTxs = responses.map((r) => r.json?.payoutTx).filter(Boolean);
      const uniquePayoutTxs = new Set(payoutTxs);

      assert.equal(
        uniquePayoutTxs.size,
        1,
        'CRITICAL: Exactly 1 unique payout transaction signature must exist across all 20 concurrent settlement attempts'
      );
    } finally {
      await client.close();
    }
  });

  it('Scenario 3: [The Fake Winner Wallet Injection Attack] Diverting escrow prize to third-party attacker wallet', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();
      const hacker = solanaHarness.generateKeypair();

      const gameId = 'tampered_winner_game';
      await db.doc(`games/${gameId}`).set({
        player1: p1.publicKey,
        player2: p2.publicKey,
        wager: 1.0,
        wagerCurrency: 'SOL',
        status: 'finished',
        winner: hacker.publicKey, // Injected attacker wallet
        escrowStatus: 'fully_funded',
      });

      const res = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId },
      });

      assert.equal(res.status, 400, 'Settlement with fake/injected winner wallet must be rejected');
      assert.includes(res.json?.error, 'Invalid match winner');

      // Verify no payout was disbursed
      const doc = await db.doc(`games/${gameId}`).get();
      assert.equal(doc.data().payoutTx, undefined, 'PayoutTx must not be generated for tampered winner');
    } finally {
      await client.close();
    }
  });

  it('Scenario 4: [The Privilege Escalation Admin Takeover] Malicious registration and privilege tampering', async () => {
    const db = new MockFirestore();
    const evaluator = new FirestoreRulesEvaluator(db);

    const attackerAuth = { uid: 'attacker_1337' };
    const attackerWallet = 'attacker_wallet_111111111111111111111111111111';

    // Step 1: Attacker attempts to register with isAdmin: true
    const createAttempt = await evaluator.evaluateUserCreate({
      auth: attackerAuth,
      userId: 'attacker_1337',
      incomingData: {
        walletAddress: attackerWallet,
        username: 'hacker1337',
        createdAt: '2026-08-22T00:00:00Z',
        isAdmin: true,
      },
    });
    assert.equal(createAttempt.allowed, false, 'Attacker signup with isAdmin:true blocked');

    // Step 2: Attacker registers legitimately as normal user
    const legitCreate = await evaluator.evaluateUserCreate({
      auth: attackerAuth,
      userId: 'attacker_1337',
      incomingData: {
        walletAddress: attackerWallet,
        username: 'hacker1337',
        createdAt: '2026-08-22T00:00:00Z',
      },
    });
    assert.equal(legitCreate.allowed, true);

    await db.doc('users/attacker_1337').set({
      walletAddress: attackerWallet,
      username: 'hacker1337',
      createdAt: '2026-08-22T00:00:00Z',
      isAdmin: false,
    });

    // Step 3: Attacker attempts to update document to set isAdmin: true
    const updateAttempt = await evaluator.evaluateUserUpdate({
      auth: attackerAuth,
      userId: 'attacker_1337',
      existingData: (await db.doc('users/attacker_1337').get()).data(),
      incomingData: {
        walletAddress: attackerWallet,
        username: 'hacker1337',
        isAdmin: true,
      },
    });
    assert.equal(updateAttempt.allowed, false, 'Attacker self-promotion on update blocked');
  });

  it('Scenario 5: [The Malicious Origin Phishing / CORS Bypass] Phishing domain attempting cross-origin data extraction', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const phishingOrigins = [
        'https://bobsled-gg-app.web.app.evil.com',
        'https://evil-bobsled.web.app',
        'https://bobsled-fake.firebaseapp.com',
        'https://phishing-solana-games.org',
      ];

      for (const origin of phishingOrigins) {
        const res = await client.request('/api/escrow/config', {
          headers: { Origin: origin },
        });
        assert.equal(
          res.getHeader('access-control-allow-origin'),
          null,
          `Phishing origin "${origin}" must be denied CORS headers`
        );
        assert.ok(res.status !== 500, 'Must not throw 500 error on CORS rejection');
      }
    } finally {
      await client.close();
    }
  });

  it('Scenario 6: [The Unfunded Refund Drain Attack] High stakes fake refund cancellation exploit', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const attacker = solanaHarness.generateKeypair();

      // Attacker creates match with 50 SOL wager
      await db.doc('games/unfunded_drain_game').set({
        player1: attacker.publicKey,
        wager: 50.0,
        wagerCurrency: 'SOL',
        status: 'waiting',
        escrowStatus: 'free', // Not funded in escrow
      });

      // Attacker immediately requests cancellation refund without ever depositing
      const res = await client.request('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'unfunded_drain_game', userId: attacker.publicKey },
      });

      assert.equal(res.status, 200);
      assert.equal(res.json?.refundTx, undefined, 'Must NOT generate refundTx for unfunded match');
      assert.includes(res.json?.message, 'deleted', 'Unfunded match should be cleaned up without refund');
    } finally {
      await client.close();
    }
  });

  it('Scenario 7: [The Flood & DoS Attack Resistance] Cascading rate limit defense under distributed stress', async () => {
    const { app } = createTestApp({ escrowMax: 4, authMax: 4, generalMax: 20, rateLimitWindows: true });
    const client = new HttpTestClient(app);

    try {
      // Attacker spams sensitive settlement endpoint
      for (let i = 0; i < 4; i++) {
        await client.request('/api/escrow/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { gameId: 'g1' },
        });
      }

      // 5th request is blocked by sensitive escrow limiter
      const blockedEscrow = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'g1' },
      });
      assert.equal(blockedEscrow.status, 429, 'Escrow spam blocked with 429');

      // General endpoint remains responsive under its own quota
      const generalRes = await client.request('/api/escrow/config');
      assert.equal(generalRes.status, 200, 'General route remains accessible within its quota');
    } finally {
      await client.close();
    }
  });
});
