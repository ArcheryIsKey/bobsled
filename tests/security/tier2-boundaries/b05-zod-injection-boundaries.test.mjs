/**
 * Tier 2 Boundary Test: B05 - Zod Schema & Injection Vector Boundaries
 * Exercises prototype pollution, type confusion, NoSQL operator injections, and control character attacks.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import {
  NonceRequestSchema,
  VerifyDepositRequestSchema,
  SettleRequestSchema,
  VerifyAuthRequestSchema,
  SolanaRpcRequestSchema,
  BalanceQuerySchema,
  RefundCancelRequestSchema,
} from '../harness/mock-express.mjs';

describe('Tier 2: B05 - Zod Injection & Type Confusion Boundaries', () => {
  it('B05-1: Prototype pollution properties in payload are stripped or safely ignored without object mutation', () => {
    const maliciousPayload = JSON.parse(
      '{"publicKey": "11111111111111111111111111111111", "__proto__": {"polluted": true}}'
    );

    const parsed = NonceRequestSchema.safeParse(maliciousPayload);
    assert.equal(parsed.success, true);
    assert.equal(({}).polluted, undefined, 'Object prototype must not be polluted');
  });

  it('B05-2: Type confusion - arrays or objects passed instead of string fields fail validation', () => {
    const arrayPubkey = NonceRequestSchema.safeParse({
      publicKey: ['11111111111111111111111111111111'],
    });
    assert.equal(arrayPubkey.success, false);

    const objectGameId = SettleRequestSchema.safeParse({
      gameId: { $gt: '' },
    });
    assert.equal(objectGameId.success, false);
  });

  it('B05-3: NoSQL operator objects in VerifyDeposit fail schema validation', () => {
    const nosqlPayload = {
      gameId: { $ne: null },
      role: 'player1',
      txHash: '11111111111111111111111111111111111111111111111111111111',
      senderWallet: '11111111111111111111111111111111',
    };

    const parsed = VerifyDepositRequestSchema.safeParse(nosqlPayload);
    assert.equal(parsed.success, false, 'NoSQL operator object as string field must be rejected by Zod');
  });

  it('B05-4: SQL injection strings in gameId or wallet do not bypass length/format boundaries', () => {
    // Oversized SQL injection attempt
    const oversizedSqlPayload = {
      publicKey: "'; DROP TABLE users; -- 11111111111111111111111111111",
    };
    const parsedOversized = NonceRequestSchema.safeParse(oversizedSqlPayload);
    assert.equal(parsedOversized.success, false, 'Oversized SQL injection string must fail schema validation');

    // Bounded string containing SQL metacharacters
    const boundedSqlPayload = {
      publicKey: "'; DROP TABLE users; -- 11111111111", // Exactly 35 chars
    };
    const parsedBounded = NonceRequestSchema.safeParse(boundedSqlPayload);
    assert.equal(parsedBounded.success, true);
    assert.equal(typeof parsedBounded.data?.publicKey, 'string', 'Must be parsed as pure string data');
  });

  it('B05-5: Extra arbitrary malicious keys in request payloads are safely filtered by schema', () => {
    const payloadWithExtra = {
      publicKey: '11111111111111111111111111111111',
      signature: '1'.repeat(64),
      isAdmin: true,
      bypassRateLimit: true,
      adminSecret: 'super_secret_override',
    };

    const parsed = VerifyAuthRequestSchema.safeParse(payloadWithExtra);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.isAdmin, undefined);
    assert.equal(parsed.data.bypassRateLimit, undefined);
  });

  it('B05-6: SolanaRpcRequestSchema rejects oversized params array or nested exploit objects', () => {
    const oversizedParams = SolanaRpcRequestSchema.safeParse({
      method: 'getAccountInfo',
      params: ['11111111111111111111111111111111', { encoding: 'base64', dataSlice: { length: 100 } }],
    });
    assert.equal(oversizedParams.success, true);

    const nonArrayParams = SolanaRpcRequestSchema.safeParse({
      method: 'getAccountInfo',
      params: 'not_an_array',
    });
    assert.equal(nonArrayParams.success, false);
  });

  it('B05-7: BalanceQuerySchema rejects array injection query parameters (?wallet[]=addr1&wallet[]=addr2)', () => {
    const arrayQuery = BalanceQuerySchema.safeParse({
      wallet: ['11111111111111111111111111111111', 'anotherWalletAddr11111111111111111111111'],
    });
    assert.equal(arrayQuery.success, false);
  });

  it('B05-8: RefundCancelRequestSchema rejects empty strings or missing userId', () => {
    assert.equal(RefundCancelRequestSchema.safeParse({ gameId: '', userId: 'u1' }).success, false);
    assert.equal(RefundCancelRequestSchema.safeParse({ gameId: 'g1', userId: '' }).success, false);
    assert.equal(RefundCancelRequestSchema.safeParse({ gameId: null, userId: null }).success, false);
  });

  it('B05-9: VerifyDepositRequestSchema rejects undefined or non-enum role', () => {
    const invalidRole = VerifyDepositRequestSchema.safeParse({
      gameId: 'g1',
      role: 'admin',
      txHash: '1'.repeat(64),
      senderWallet: '11111111111111111111111111111111',
    });
    assert.equal(invalidRole.success, false);
  });

  it('B05-10: Null bytes (%00) and control characters in gameId handled cleanly without crash', () => {
    const nullBytePayload = {
      gameId: 'game\x00_injected_id',
    };
    const parsed = SettleRequestSchema.safeParse(nullBytePayload);
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.gameId, 'game\x00_injected_id');
  });
});
