/**
 * Tier 1 Feature Test: F9 - Zod Payload Schema Validation
 * Verifies strict validation rules across all backend API request schemas.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import {
  NonceRequestSchema,
  VerifyAuthRequestSchema,
  BalanceQuerySchema,
  SolanaRpcRequestSchema,
  VerifyDepositRequestSchema,
  SettleRequestSchema,
  RefundCancelRequestSchema,
} from '../harness/mock-express.mjs';

describe('Tier 1: F9 - Zod Request Payload Schemas', () => {
  it('F9-1: NonceRequestSchema validates Solana public key length bounds [32, 44]', () => {
    // Valid 44-char pubkey
    const valid = NonceRequestSchema.safeParse({
      publicKey: '11111111111111111111111111111111',
    });
    assert.equal(valid.success, true);

    // Invalid: too short (<32)
    const tooShort = NonceRequestSchema.safeParse({ publicKey: 'short_key_123' });
    assert.equal(tooShort.success, false);

    // Invalid: wrong type
    const wrongType = NonceRequestSchema.safeParse({ publicKey: 123456789 });
    assert.equal(wrongType.success, false);
  });

  it('F9-2: VerifyAuthRequestSchema validates both publicKey and signature bounds', () => {
    const validPubkey = '11111111111111111111111111111111';
    const validSig = '3Y9x2B3V4C5X6Z7A8B9C0D1E2F3G4H5I6J7K8L9M0N1O2P3Q4R5S6T7U8V9W0X1Y2Z3A4B5C6D7E8F9G';

    const valid = VerifyAuthRequestSchema.safeParse({
      publicKey: validPubkey,
      signature: validSig,
    });
    assert.equal(valid.success, true);

    // Missing signature
    const missingSig = VerifyAuthRequestSchema.safeParse({
      publicKey: validPubkey,
    });
    assert.equal(missingSig.success, false);

    // Invalid signature length (<64)
    const shortSig = VerifyAuthRequestSchema.safeParse({
      publicKey: validPubkey,
      signature: 'tooshort',
    });
    assert.equal(shortSig.success, false);
  });

  it('F9-3: BalanceQuerySchema validates wallet address query parameter', () => {
    const valid = BalanceQuerySchema.safeParse({
      wallet: '11111111111111111111111111111111',
    });
    assert.equal(valid.success, true);

    const empty = BalanceQuerySchema.safeParse({ wallet: '' });
    assert.equal(empty.success, false);
  });

  it('F9-4: SolanaRpcRequestSchema validates RPC method string bounds [1, 100]', () => {
    const valid = SolanaRpcRequestSchema.safeParse({
      jsonrpc: '2.0',
      id: 1,
      method: 'getBalance',
      params: ['11111111111111111111111111111111'],
    });
    assert.equal(valid.success, true);

    // Empty method
    const emptyMethod = SolanaRpcRequestSchema.safeParse({ method: '' });
    assert.equal(emptyMethod.success, false);

    // Oversized method (>100 chars)
    const oversizedMethod = SolanaRpcRequestSchema.safeParse({ method: 'a'.repeat(101) });
    assert.equal(oversizedMethod.success, false);
  });

  it('F9-5: VerifyDeposit, Settle, and RefundCancel schemas enforce required fields and enum bounds', () => {
    // VerifyDepositSchema role enum check
    const validDeposit = VerifyDepositRequestSchema.safeParse({
      gameId: 'game_xyz',
      role: 'player1',
      txHash: '5x1y2z3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z9a0b1c2d3e4f5g6h7i8j9k',
      senderWallet: '11111111111111111111111111111111',
    });
    assert.equal(validDeposit.success, true);

    const invalidRole = VerifyDepositRequestSchema.safeParse({
      gameId: 'game_xyz',
      role: 'spectator', // invalid role
      txHash: '5x1y2z3a4b5c6d7e8f9g0h1i2j3k4l5m6n7o8p9q0r1s2t3u4v5w6x7y8z9a0b1c2d3e4f5g6h7i8j9k',
      senderWallet: '11111111111111111111111111111111',
    });
    assert.equal(invalidRole.success, false);

    // SettleRequestSchema
    assert.equal(SettleRequestSchema.safeParse({ gameId: 'g1' }).success, true);
    assert.equal(SettleRequestSchema.safeParse({ gameId: '' }).success, false);

    // RefundCancelRequestSchema
    assert.equal(RefundCancelRequestSchema.safeParse({ gameId: 'g1', userId: 'u1' }).success, true);
    assert.equal(RefundCancelRequestSchema.safeParse({ gameId: 'g1' }).success, false);
  });
});
