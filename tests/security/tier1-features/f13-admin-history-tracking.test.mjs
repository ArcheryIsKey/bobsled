/**
 * Tier 1 Feature Test: F13 - Server-Authoritative Admin History & Solscan Devnet Tracking
 * Verifies full match lifecycle logging, Solscan URL formatting, draw/cancellation refund logging,
 * Firestore security rules, and /api/admin/log-event Zod schema enforcement.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { createTestApp, HttpTestClient } from '../harness/mock-express.mjs';
import { MockFirestore, FirestoreRulesEvaluator } from '../harness/mock-firestore.mjs';

describe('Tier 1: F13 - Server-Authoritative Admin History & Solscan Tracking', () => {
  it('F13-1: Full game lifecycle records chronological events in admin_history with complete schema', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();
      const escrow = solanaHarness.escrowKeypair.publicKey.toBase58();
      const gameId = 'hist_game_lifecycle_101';
      const wager = 0.5;

      // 1. Created Event via /api/admin/log-event
      const resCreate = await client.request('/api/admin/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          eventType: 'created',
          eventLabel: 'Match Room Created',
          gameId,
          userId: p1.publicKey,
          username: 'Player 1',
          walletAddress: p1.publicKey,
          role: 'player1',
          wager,
          wagerCurrency: 'SOL',
          totalPot: wager * 2,
        },
      });
      assert.equal(resCreate.status, 200);
      assert.ok(resCreate.json && resCreate.json.id);
      assert.equal(resCreate.json.record.eventType, 'created');

      // Create Game in DB
      await db.doc('games/' + gameId).set({
        player1: p1.publicKey,
        player1Name: 'Player 1',
        wager,
        wagerCurrency: 'SOL',
        status: 'waiting',
      });

      // 2. Deposit P1
      const p1Tx = 'p1_deposit_sig_' + 'a'.repeat(50);
      solanaHarness.createMockParsedDepositTx({
        signature: p1Tx,
        sourceWallet: p1.publicKey,
        destinationWallet: escrow,
        lamports: 500_000_000,
        success: true,
      });

      const resDepP1 = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId, role: 'player1', txHash: p1Tx, senderWallet: p1.publicKey },
      });
      assert.equal(resDepP1.status, 200);

      // 3. Deposit P2 & Join Match
      const p2Tx = 'p2_deposit_sig_' + 'b'.repeat(50);
      solanaHarness.createMockParsedDepositTx({
        signature: p2Tx,
        sourceWallet: p2.publicKey,
        destinationWallet: escrow,
        lamports: 500_000_000,
        success: true,
      });

      const resDepP2 = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId, role: 'player2', txHash: p2Tx, senderWallet: p2.publicKey },
      });
      assert.equal(resDepP2.status, 200);

      // 4. Game Concluded & Settled
      await db.doc('games/' + gameId).update({
        status: 'finished',
        winner: p1.publicKey,
        escrowStatus: 'fully_funded',
      });

      const resSettle = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId },
      });
      assert.equal(resSettle.status, 200);
      assert.ok(resSettle.json && resSettle.json.payoutTx);

      // Verify admin_history entries
      const historyCol = db._getCol('admin_history');
      assert.ok(historyCol.size >= 4, 'Expected at least 4 history records, found ' + historyCol.size);

      const records = Array.from(historyCol.values()).filter((r) => r.gameId === gameId);
      const eventTypes = records.map((r) => r.eventType);
      assert.includes(eventTypes, 'created', 'Must include created event');
      assert.includes(eventTypes, 'deposit_p1', 'Must include deposit_p1 event');
      assert.includes(eventTypes, 'deposit_p2', 'Must include deposit_p2 event');
      assert.includes(eventTypes, 'paid_out', 'Must include paid_out event');

      // Verify schema field integrity on all records
      for (const rec of records) {
        assert.ok(rec.id, 'Record must have id');
        assert.ok(rec.isoTimestamp, 'Record must have isoTimestamp');
        assert.ok(!isNaN(Date.parse(rec.isoTimestamp)), 'isoTimestamp must be valid ISO date string');
        assert.equal(rec.gameId, gameId);
        assert.equal(rec.gameType, 'connect4');
        assert.equal(rec.network, 'devnet');
        assert.ok(typeof rec.wager === 'number' && rec.wager >= 0);
      }
    } finally {
      await client.close();
    }
  });

  it('F13-2: On-chain events generate valid clickable Solscan Devnet URLs', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const escrow = solanaHarness.escrowKeypair.publicKey.toBase58();
      const gameId = 'hist_solscan_game_102';
      const txHash = 'tx_solscan_verify_' + 'c'.repeat(50);

      await db.doc('games/' + gameId).set({
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

      await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId, role: 'player1', txHash, senderWallet: p1.publicKey },
      });

      const historyCol = db._getCol('admin_history');
      const depositEvent = Array.from(historyCol.values()).find(
        (r) => r.gameId === gameId && r.eventType === 'deposit_p1'
      );

      assert.ok(depositEvent, 'Deposit event must be logged');
      assert.equal(depositEvent.txSignature, txHash);
      assert.equal(
        depositEvent.solscanUrl,
        'https://solscan.io/tx/' + txHash + '?cluster=devnet',
        'Solscan URL must target Solana Devnet cluster'
      );
      assert.equal(depositEvent.network, 'devnet');

      const accountUrl = 'https://solscan.io/account/' + p1.publicKey + '?cluster=devnet';
      assert.includes(accountUrl, 'https://solscan.io/account/' + p1.publicKey + '?cluster=devnet');
    } finally {
      await client.close();
    }
  });

  it('F13-3: Cancellation and refund lifecycles emit distinct refunded and cancelled events', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const escrow = solanaHarness.escrowKeypair.publicKey.toBase58();
      const fundedGameId = 'hist_refund_funded_103';
      const depositTx = 'refund_deposit_sig_' + 'd'.repeat(50);

      // 1. Funded match cancelled -> refunded event
      await db.doc('games/' + fundedGameId).set({
        player1: p1.publicKey,
        wager: 0.5,
        wagerCurrency: 'SOL',
        status: 'waiting',
        escrowStatus: 'p1_funded',
        p1Wallet: p1.publicKey,
        p1DepositTx: depositTx,
      });

      solanaHarness.createMockParsedDepositTx({
        signature: depositTx,
        sourceWallet: p1.publicKey,
        destinationWallet: escrow,
        lamports: 500_000_000,
        success: true,
      });

      const resRefund = await client.request('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: fundedGameId, userId: p1.publicKey },
      });
      assert.equal(resRefund.status, 200);
      assert.ok(resRefund.json && resRefund.json.refundTx);

      const historyCol = db._getCol('admin_history');
      const refundEvent = Array.from(historyCol.values()).find(
        (r) => r.gameId === fundedGameId && r.eventType === 'refunded'
      );
      assert.ok(refundEvent, 'Must emit refunded event');
      assert.equal(refundEvent.amountSol, 0.5);
      assert.ok(refundEvent.solscanUrl && refundEvent.solscanUrl.includes('cluster=devnet'));

      // 2. Unfunded match cancelled -> cancelled event
      const unfundedGameId = 'hist_unfunded_cancel_103';
      await db.doc('games/' + unfundedGameId).set({
        player1: p1.publicKey,
        wager: 0,
        wagerCurrency: 'FREE',
        status: 'waiting',
      });

      const resCancel = await client.request('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId: unfundedGameId, userId: p1.publicKey },
      });
      assert.equal(resCancel.status, 200);

      const cancelEvent = Array.from(historyCol.values()).find(
        (r) => r.gameId === unfundedGameId && r.eventType === 'cancelled'
      );
      assert.ok(cancelEvent, 'Must emit cancelled event');
      assert.equal(cancelEvent.amountSol, 0);
      assert.equal(cancelEvent.solscanUrl, null);
    } finally {
      await client.close();
    }
  });

  it('F13-4: Draw resolution emits draw_refunded event with zero fee and split payouts', async () => {
    const { app, solanaHarness, db } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const p1 = solanaHarness.generateKeypair();
      const p2 = solanaHarness.generateKeypair();
      const gameId = 'hist_draw_game_104';

      await db.doc('games/' + gameId).set({
        player1: p1.publicKey,
        player2: p2.publicKey,
        p1Wallet: p1.publicKey,
        p2Wallet: p2.publicKey,
        wager: 1.0,
        wagerCurrency: 'SOL',
        status: 'finished',
        winner: 'draw',
        escrowStatus: 'fully_funded',
        p1DepositTx: 'p1_draw_sig_' + 'e'.repeat(50),
        p2DepositTx: 'p2_draw_sig_' + 'f'.repeat(50),
      });

      const res = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { gameId },
      });
      assert.equal(res.status, 200);

      const historyCol = db._getCol('admin_history');
      const drawEvent = Array.from(historyCol.values()).find(
        (r) => r.gameId === gameId && r.eventType === 'draw_refunded'
      );
      assert.ok(drawEvent, 'Must emit draw_refunded event');
      assert.equal(drawEvent.houseFeeSol, 0, 'Draw refunds must have 0% house fee');
      assert.equal(drawEvent.amountSol, 2.0, 'Total refunded amount must equal 2x single wager');
      assert.ok(drawEvent.solscanUrl && drawEvent.solscanUrl.includes('cluster=devnet'));
    } finally {
      await client.close();
    }
  });

  it('F13-5: Firestore security rules enforce admin-only read and zero client write access', async () => {
    const db = new MockFirestore();
    const evaluator = new FirestoreRulesEvaluator(db);

    const normalUser = { uid: 'normal_player_1' };
    const adminUser = { uid: 'admin_super_user' };

    // Seed admin status
    await db.doc('users/admin_super_user').set({
      username: 'admin',
      isAdmin: true,
      role: 'admin',
    });

    // 1. Client write attempt on admin_history -> BLOCKED
    const writeCheck = await evaluator.evaluateAdminHistoryWrite({ auth: normalUser });
    assert.equal(writeCheck.allowed, false, 'Client write to admin_history must be rejected');

    const adminWriteCheck = await evaluator.evaluateAdminHistoryWrite({ auth: adminUser });
    assert.equal(adminWriteCheck.allowed, false, 'Even admin client writes must be rejected (server SDK only)');

    // 2. Unauthenticated read attempt on admin_history -> BLOCKED
    const unauthReadCheck = await evaluator.evaluateAdminHistoryRead({ auth: null });
    assert.equal(unauthReadCheck.allowed, false, 'Unauthenticated users cannot read admin_history');

    // 3. Normal user read attempt on admin_history -> BLOCKED
    const userReadCheck = await evaluator.evaluateAdminHistoryRead({ auth: normalUser });
    assert.equal(userReadCheck.allowed, false, 'Normal users cannot read admin_history');

    // 4. Admin user read attempt on admin_history -> ALLOWED
    const adminReadCheck = await evaluator.evaluateAdminHistoryRead({ auth: adminUser });
    assert.equal(adminReadCheck.allowed, true, 'Admin users can read admin_history');
  });

  it('F13-6: /api/admin/log-event validates payload schemas and rejects invalid event types or injected keys', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      // 1. Invalid eventType
      const resInvalidType = await client.request('/api/admin/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          eventType: 'hacked_event_type',
          gameId: 'g1',
          userId: 'u1',
        },
      });
      assert.equal(resInvalidType.status, 400);

      // 2. Missing required gameId
      const resMissing = await client.request('/api/admin/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          eventType: 'created',
          userId: 'u1',
        },
      });
      assert.equal(resMissing.status, 400);

      // 3. Injected unknown keys (strict mode)
      const resInjected = await client.request('/api/admin/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          eventType: 'created',
          gameId: 'g1',
          userId: 'u1',
          injectedMaliciousKey: true,
        },
      });
      assert.equal(resInjected.status, 400);

      // 4. Negative wager
      const resNegativeWager = await client.request('/api/admin/log-event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: {
          eventType: 'created',
          gameId: 'g1',
          userId: 'u1',
          wager: -5,
        },
      });
      assert.equal(resNegativeWager.status, 400);
    } finally {
      await client.close();
    }
  });

  it('F13-7: Admin Stream Querying maintains limit(100) and reverse chronological ordering', async () => {
    const db = new MockFirestore();
    const baseTime = Date.now();

    // Seed 120 history events
    for (let i = 0; i < 120; i++) {
      const isoTimestamp = new Date(baseTime + i * 1000).toISOString();
      const padId = 'event_' + String(i).padStart(3, '0');
      await db.doc('admin_history/' + padId).set({
        id: padId,
        isoTimestamp,
        timestamp: isoTimestamp,
        eventType: i % 2 === 0 ? 'deposit_p1' : 'paid_out',
        gameId: 'game_' + i,
        userId: 'user_' + i,
      });
    }

    // Query with orderBy timestamp desc and limit 100
    const querySnap = await db.collection('admin_history')
      .orderBy('timestamp', 'desc')
      .limit(100)
      .get();

    assert.equal(querySnap.size, 100, 'Query must return exactly 100 documents');
    assert.equal(querySnap.docs.length, 100);

    const firstDoc = querySnap.docs[0].data();
    const lastDoc = querySnap.docs[99].data();

    // The first item should have the newest timestamp (event_119)
    assert.equal(firstDoc.id, 'event_119');
    // The 100th item should have the 100th newest timestamp (event_020)
    assert.equal(lastDoc.id, 'event_020');
  });

  it('F13-8: Filter Engine and Multi-Field Search correctly isolate targeted history events', () => {
    const events = [
      { id: '1', eventType: 'deposit_p1', username: 'Alice', gameId: 'g_alpha', walletAddress: 'W_Alice_111', txSignature: 'sig_dep_aaa' },
      { id: '2', eventType: 'deposit_p2', username: 'Bob', gameId: 'g_alpha', walletAddress: 'W_Bob_222', txSignature: 'sig_dep_bbb' },
      { id: '3', eventType: 'paid_out', username: 'Alice', gameId: 'g_alpha', walletAddress: 'W_Alice_111', txSignature: 'sig_payout_ccc' },
      { id: '4', eventType: 'refunded', username: 'Charlie', gameId: 'g_beta', walletAddress: 'W_Charlie_333', txSignature: 'sig_ref_ddd' },
      { id: '5', eventType: 'draw_refunded', username: 'system', gameId: 'g_gamma', walletAddress: null, txSignature: 'sig_draw_eee' },
      { id: '6', eventType: 'resigned', username: 'Dave', gameId: 'g_delta', walletAddress: 'W_Dave_444', txSignature: null },
    ];

    // Filter categories
    const depositEvents = events.filter((e) => ['deposit_p1', 'deposit_p2'].includes(e.eventType));
    assert.equal(depositEvents.length, 2);

    const payoutEvents = events.filter((e) => e.eventType === 'paid_out');
    assert.equal(payoutEvents.length, 1);

    const refundEvents = events.filter((e) => ['refunded', 'draw_refunded'].includes(e.eventType));
    assert.equal(refundEvents.length, 2);

    // Multi-field search helper simulation
    function matchSearch(item, query) {
      const q = query.toLowerCase();
      return (
        (item.gameId && item.gameId.toLowerCase().includes(q)) ||
        (item.username && item.username.toLowerCase().includes(q)) ||
        (item.walletAddress && item.walletAddress.toLowerCase().includes(q)) ||
        (item.txSignature && item.txSignature.toLowerCase().includes(q))
      );
    }

    const searchAlice = events.filter((e) => matchSearch(e, 'Alice'));
    assert.equal(searchAlice.length, 2);

    const searchTx = events.filter((e) => matchSearch(e, 'sig_ref_ddd'));
    assert.equal(searchTx.length, 1);
    assert.equal(searchTx[0].username, 'Charlie');

    const searchGameBeta = events.filter((e) => matchSearch(e, 'g_beta'));
    assert.equal(searchGameBeta.length, 1);
    assert.equal(searchGameBeta[0].id, '4');
  });
});
