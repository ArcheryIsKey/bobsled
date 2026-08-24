/**
 * Tier 1 Feature Test: F11 - Firestore Security Rules & Access Boundaries
 * Verifies privilege escalation blocks on users, immutable fields on games, and participant message security.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { FirestoreRulesEvaluator, MockFirestore } from '../harness/mock-firestore.mjs';

describe('Tier 1: F11 - Firestore Security Rules & Access Boundaries', () => {
  const db = new MockFirestore();
  const evaluator = new FirestoreRulesEvaluator(db);

  it('F11-1: Privilege Escalation Blocked - user create with isAdmin or role rejected', async () => {
    const auth = { uid: 'attacker_uid' };

    // Attacker tries to inject isAdmin: true during signup
    const maliciousPayload = {
      walletAddress: '11111111111111111111111111111111',
      username: 'attacker',
      createdAt: '2026-08-22T00:00:00Z',
      isAdmin: true, // Privilege injection attempt
    };

    const res = await evaluator.evaluateUserCreate({
      auth,
      userId: 'attacker_uid',
      incomingData: maliciousPayload,
    });

    assert.equal(res.allowed, false, 'User creation with isAdmin must be blocked');
    assert.includes(res.reason, 'keys.hasOnly');
  });

  it('F11-2: Legitimate user creation with permitted keys succeeds', async () => {
    const auth = { uid: 'valid_uid' };
    const validPayload = {
      walletAddress: '11111111111111111111111111111111',
      username: 'alice_good',
      createdAt: '2026-08-22T00:00:00Z',
      avatarUrl: 'https://example.com/avatar.jpg',
    };

    const res = await evaluator.evaluateUserCreate({
      auth,
      userId: 'valid_uid',
      incomingData: validPayload,
    });

    assert.equal(res.allowed, true, 'Valid user document creation should be allowed');
  });

  it('F11-3: Standard user cannot update isAdmin or role on their user document', async () => {
    const auth = { uid: 'normal_user' };
    const existing = {
      walletAddress: 'wallet_1',
      username: 'normal_user',
      isAdmin: false,
    };
    const updatePayload = {
      walletAddress: 'wallet_1',
      username: 'normal_user',
      isAdmin: true, // Attempting self-promotion
    };

    const res = await evaluator.evaluateUserUpdate({
      auth,
      userId: 'normal_user',
      existingData: existing,
      incomingData: updatePayload,
    });

    assert.equal(res.allowed, false, 'Self-promotion to admin on update must be blocked');
    assert.includes(res.reason, 'privileged');
  });

  it('F11-4: Joiner cannot tamper with wager, player1, or p1DepositTx during game join', async () => {
    const hostAuth = { uid: 'host_p1' };
    const joinerAuth = { uid: 'joiner_p2' };

    const initialGame = {
      player1: 'host_p1',
      player1Name: 'Host',
      wager: 10.0,
      wagerCurrency: 'SOL',
      p1DepositTx: 'host_valid_deposit_sig',
      status: 'waiting',
    };

    // Joiner attempts to lower wager to 0.01 SOL while joining
    const maliciousJoin = {
      ...initialGame,
      wager: 0.01, // TAMPERING ATTEMPT
      player2: 'joiner_p2',
      status: 'active',
    };

    const res = await evaluator.evaluateGameUpdate({
      auth: joinerAuth,
      gameId: 'game_stake',
      existingData: initialGame,
      incomingData: maliciousJoin,
    });

    assert.equal(res.allowed, false, 'Tampering with wager during join must be rejected');
    assert.includes(res.reason, 'mutate wager');
  });

  it('F11-5: Non-participants cannot send messages in a game chat', async () => {
    const outsiderAuth = { uid: 'outsider_user' };
    const gameData = { player1: 'p1_user', player2: 'p2_user' };

    const res = await evaluator.evaluateMessageCreate({
      auth: outsiderAuth,
      gameId: 'match_123',
      gameData,
      messageData: { senderId: 'outsider_user', text: 'Hello players!' },
    });

    assert.equal(res.allowed, false, 'Outsider message in private match must be blocked');
    assert.includes(res.reason, 'participants');
  });
});
