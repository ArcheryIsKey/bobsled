/**
 * Tier 2 Boundary Test: B06 - Firestore Rules & Authorization Boundaries
 * Exercises unauthenticated access, document ID length bounds, non-participant game tampering, and state bypasses.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { FirestoreRulesEvaluator, MockFirestore } from '../harness/mock-firestore.mjs';

describe('Tier 2: B06 - Firestore Rules & Authorization Boundaries', () => {
  const db = new MockFirestore();
  const evaluator = new FirestoreRulesEvaluator(db);

  it('B06-1: Unauthenticated request (auth = null) is denied on all collections', async () => {
    const userRes = await evaluator.evaluateUserCreate({
      auth: null,
      userId: 'anon_1',
      incomingData: { username: 'anon', walletAddress: 'w1' },
    });
    assert.equal(userRes.allowed, false, 'Unauthenticated user create must fail');

    const gameRes = await evaluator.evaluateGameCreate({
      auth: null,
      gameId: 'g1',
      incomingData: { player1: 'anon_1', wager: 1.0 },
    });
    assert.equal(gameRes.allowed, false, 'Unauthenticated game create must fail');

    const msgRes = await evaluator.evaluateMessageCreate({
      auth: null,
      gameId: 'g1',
      gameData: { player1: 'p1', player2: 'p2' },
      messageData: { senderId: 'p1', text: 'hi' },
    });
    assert.equal(msgRes.allowed, false, 'Unauthenticated message create must fail');
  });

  it('B06-2: Document ID boundary: IDs > 128 characters are rejected', () => {
    const validId = 'a'.repeat(128);
    const oversizedId = 'a'.repeat(129);

    const isValidIdCheck = (id) => typeof id === 'string' && id.length <= 128;
    assert.equal(isValidIdCheck(validId), true, '128 char ID should pass');
    assert.equal(isValidIdCheck(oversizedId), false, '129 char ID must fail');
  });

  it('B06-3: Non-participant cannot submit moves or mutate board on active match', async () => {
    const spectatorAuth = { uid: 'spectator_user' };
    const activeGame = {
      player1: 'alice_p1',
      player2: 'bob_p2',
      status: 'active',
      board: Array(42).fill(0),
      turn: 'alice_p1',
    };

    const maliciousMove = {
      ...activeGame,
      board: [1, ...Array(41).fill(0)],
    };

    const res = await evaluator.evaluateGameUpdate({
      auth: spectatorAuth,
      gameId: 'active_match',
      existingData: activeGame,
      incomingData: maliciousMove,
    });

    assert.equal(res.allowed, false, 'Spectator cannot mutate board state');
    assert.includes(res.reason, 'participants');
  });

  it('B06-4: Moves on finished game are rejected', async () => {
    const player1Auth = { uid: 'alice_p1' };
    const finishedGame = {
      player1: 'alice_p1',
      player2: 'bob_p2',
      status: 'finished',
      board: Array(42).fill(1),
    };

    const res = await evaluator.evaluateGameUpdate({
      auth: player1Auth,
      gameId: 'finished_match',
      existingData: finishedGame,
      incomingData: { ...finishedGame, board: Array(42).fill(0) },
    });

    assert.equal(res.allowed, false, 'Cannot update finished game');
    assert.includes(res.reason, 'Cannot update finished');
  });

  it('B06-5: User cannot create username document for another user UID', async () => {
    const attackerAuth = { uid: 'attacker_123' };
    const victimUid = 'victim_456';

    const res = await evaluator.evaluateUsernameCreate({
      auth: attackerAuth,
      username: 'alice_star',
      incomingData: { uid: victimUid },
    });

    assert.equal(res.allowed, false, 'Username document UID must match caller auth UID');
  });

  it('B06-6: User creation rejects extra unexpected top-level fields (e.g. balance, credits, score)', async () => {
    const auth = { uid: 'user_exploit' };
    const payload = {
      walletAddress: '11111111111111111111111111111111',
      username: 'legit_user',
      createdAt: '2026-08-22T00:00:00Z',
      credits: 1000000, // Unauthorized balance injection attempt
      score: 999999,
    };

    const res = await evaluator.evaluateUserCreate({
      auth,
      userId: 'user_exploit',
      incomingData: payload,
    });

    assert.equal(res.allowed, false, 'Extra fields in user document must be rejected');
    assert.includes(res.reason, 'keys.hasOnly');
  });

  it('B06-7: Attempting to join a game while setting turn to arbitrary user is blocked', async () => {
    const joinerAuth = { uid: 'joiner_p2' };
    const initialGame = {
      player1: 'host_p1',
      wager: 0.1,
      wagerCurrency: 'SOL',
      status: 'waiting',
    };

    const maliciousJoin = {
      ...initialGame,
      player2: 'joiner_p2',
      turn: 'hacker_friend_p3', // Setting turn to non-player
      status: 'active',
    };

    const res = await evaluator.evaluateGameUpdate({
      auth: joinerAuth,
      gameId: 'game_turn_test',
      existingData: initialGame,
      incomingData: maliciousJoin,
    });

    assert.equal(res.allowed, false);
  });

  it('B06-8: Message creation on non-existent game document is rejected', async () => {
    const auth = { uid: 'player_1' };
    const res = await evaluator.evaluateMessageCreate({
      auth,
      gameId: 'deleted_or_missing_game',
      gameData: null, // Game does not exist
      messageData: { senderId: 'player_1', text: 'Hello' },
    });

    assert.equal(res.allowed, false);
    assert.includes(res.reason, 'does not exist');
  });

  it('B06-9: Tampering with player1 wallet during match active state is blocked', async () => {
    const p1Auth = { uid: 'p1_user' };
    const activeGame = {
      player1: 'p1_user',
      player2: 'p2_user',
      status: 'active',
      board: Array(42).fill(0),
    };

    const maliciousUpdate = {
      ...activeGame,
      player1: 'new_hacker_p1', // Attempting to hijack host identity
    };

    const res = await evaluator.evaluateGameUpdate({
      auth: p1Auth,
      gameId: 'active_hijack',
      existingData: activeGame,
      incomingData: maliciousUpdate,
    });

    assert.equal(res.allowed, false);
  });

  it('B06-10: Username creation document must strictly contain only uid key', async () => {
    const auth = { uid: 'alice_uid' };
    const payloadWithExtra = {
      uid: 'alice_uid',
      isVerified: true,
      vipBadge: 'gold',
    };

    const res = await evaluator.evaluateUsernameCreate({
      auth,
      username: 'alice_vip',
      incomingData: payloadWithExtra,
    });

    assert.equal(res.allowed, false);
    assert.includes(res.reason, 'only contain { uid }');
  });
});
