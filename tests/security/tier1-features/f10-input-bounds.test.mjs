/**
 * Tier 1 Feature Test: F10 - Client/Server Chat, Username & Wager Input Bounds
 * Verifies input length limits, regex patterns, numerical bounds, and sanitization constraints.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { FirestoreRulesEvaluator, MockFirestore } from '../harness/mock-firestore.mjs';

describe('Tier 1: F10 - Chat, Username & Wager Input Bounds', () => {
  const db = new MockFirestore();
  const evaluator = new FirestoreRulesEvaluator(db);

  it('F10-1: Chat message length bounds (1 to 200 chars)', async () => {
    const auth = { uid: 'user_123' };
    const gameData = { player1: 'user_123', player2: 'user_456' };

    // Exactly 200 chars passes
    const msg200 = 'x'.repeat(200);
    const res200 = await evaluator.evaluateMessageCreate({
      auth,
      gameId: 'g1',
      gameData,
      messageData: { senderId: 'user_123', text: msg200 },
    });
    assert.equal(res200.allowed, true, '200 character message should be allowed');

    // 201 chars fails
    const msg201 = 'x'.repeat(201);
    const res201 = await evaluator.evaluateMessageCreate({
      auth,
      gameId: 'g1',
      gameData,
      messageData: { senderId: 'user_123', text: msg201 },
    });
    assert.equal(res201.allowed, false, '201 character message must be rejected');
    assert.includes(res201.reason, 'between 1 and 200');
  });

  it('F10-2: Empty or whitespace-only chat message is rejected', async () => {
    const auth = { uid: 'user_123' };
    const gameData = { player1: 'user_123', player2: 'user_456' };

    const resEmpty = await evaluator.evaluateMessageCreate({
      auth,
      gameId: 'g1',
      gameData,
      messageData: { senderId: 'user_123', text: '   ' },
    });
    assert.equal(resEmpty.allowed, false, 'Whitespace-only message must be rejected');
  });

  it('F10-3: Username validation enforces 3-15 chars and ^[a-zA-Z0-9_]{3,15}$ regex', () => {
    // Valid usernames
    assert.equal(evaluator.isValidUsername('alice'), true);
    assert.equal(evaluator.isValidUsername('bob_123'), true);
    assert.equal(evaluator.isValidUsername('a'.repeat(15)), true);
    assert.equal(evaluator.isValidUsername('sol_player_1'), true);

    // Invalid usernames
    assert.equal(evaluator.isValidUsername('ab'), false, 'Too short (<3 chars)');
    assert.equal(evaluator.isValidUsername('a'.repeat(16)), false, 'Too long (>15 chars)');
    assert.equal(evaluator.isValidUsername('bad user'), false, 'Spaces not allowed');
    assert.equal(evaluator.isValidUsername('user@domain'), false, 'Special chars not allowed');
    assert.equal(evaluator.isValidUsername('<script>'), false, 'HTML tags not allowed');
  });

  it('F10-4: Wager range validation enforces 0.0 to 100.0 SOL', async () => {
    const auth = { uid: 'player_1' };

    // Valid wagers
    const validWagers = [0, 0.1, 1.0, 50.0, 100.0];
    for (const wager of validWagers) {
      const res = await evaluator.evaluateGameCreate({
        auth,
        gameId: 'game_wager',
        incomingData: { player1: 'player_1', wager, wagerCurrency: 'SOL', status: 'waiting' },
      });
      assert.equal(res.allowed, true, `Wager ${wager} SOL should be allowed`);
    }

    // Invalid wagers
    const invalidWagers = [-0.1, -10, 100.01, 500, NaN, 'one_sol'];
    for (const wager of invalidWagers) {
      const res = await evaluator.evaluateGameCreate({
        auth,
        gameId: 'game_wager',
        incomingData: { player1: 'player_1', wager, wagerCurrency: 'SOL', status: 'waiting' },
      });
      assert.equal(res.allowed, false, `Wager ${wager} should be rejected`);
    }
  });

  it('F10-5: Free match must have wager strictly equal to 0', async () => {
    const auth = { uid: 'player_1' };

    const validFree = await evaluator.evaluateGameCreate({
      auth,
      gameId: 'game_free',
      incomingData: { player1: 'player_1', wager: 0, wagerCurrency: 'FREE', status: 'waiting' },
    });
    assert.equal(validFree.allowed, true);

    const invalidFree = await evaluator.evaluateGameCreate({
      auth,
      gameId: 'game_free',
      incomingData: { player1: 'player_1', wager: 5, wagerCurrency: 'FREE', status: 'waiting' },
    });
    assert.equal(invalidFree.allowed, false, 'FREE currency with non-zero wager must be rejected');
  });
});
