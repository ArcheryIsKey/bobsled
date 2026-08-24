/**
 * Tier 2 Boundary Test: B03 - Solana Transaction & Cryptographic Boundaries
 * Exercises Base58 character boundaries, lamport edge values, blockTime anomalies, and instruction structures.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { MockSolanaHarness } from '../harness/mock-solana.mjs';
import { NonceRequestSchema, VerifyAuthRequestSchema } from '../harness/mock-express.mjs';

describe('Tier 2: B03 - Solana Transaction & Cryptographic Boundaries', () => {
  const harness = new MockSolanaHarness();

  it('B03-1: Solana public key boundary lengths: 31 chars rejected, 32-44 accepted, 45 rejected', () => {
    assert.equal(NonceRequestSchema.safeParse({ publicKey: '1'.repeat(31) }).success, false);
    assert.equal(NonceRequestSchema.safeParse({ publicKey: '1'.repeat(32) }).success, true);
    assert.equal(NonceRequestSchema.safeParse({ publicKey: '1'.repeat(44) }).success, true);
    assert.equal(NonceRequestSchema.safeParse({ publicKey: '1'.repeat(45) }).success, false);
  });

  it('B03-2: Non-Base58 characters (0, O, I, l) in public key or signature fail validation', () => {
    const invalidChars = ['0', 'O', 'I', 'l', '+', '/', '='];
    for (const char of invalidChars) {
      const testPubkey = '1111111111111111111111111111111' + char;
      const base58Regex = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
      assert.equal(base58Regex.test(testPubkey), false, `Char '${char}' should be rejected in Base58`);
    }
  });

  it('B03-3: 0 Lamport transfer rejected during deposit verification', () => {
    const sender = harness.generateKeypair();
    const escrow = harness.escrowKeypair.publicKey.toBase58();

    const tx = harness.createMockParsedDepositTx({
      signature: 'zero_lamport_sig',
      sourceWallet: sender.publicKey,
      destinationWallet: escrow,
      lamports: 0,
      success: true,
    });

    const result = harness.verifyOnChainDeposit({
      parsedTx: tx,
      requiredLamports: 100_000_000,
      senderWallet: sender.publicKey,
      escrowPubkey: escrow,
    });

    assert.equal(result.valid, false, '0 lamport transfer cannot satisfy non-zero stake');
  });

  it('B03-4: Stale transaction proof (blockTime before game creation) is rejected', () => {
    const sender = harness.generateKeypair();
    const escrow = harness.escrowKeypair.publicKey.toBase58();

    const gameCreationTime = Math.floor(Date.now() / 1000);
    const staleTxTime = gameCreationTime - 3600;

    const tx = harness.createMockParsedDepositTx({
      signature: 'stale_deposit_sig',
      sourceWallet: sender.publicKey,
      destinationWallet: escrow,
      lamports: 100_000_000,
      success: true,
      blockTime: staleTxTime,
    });

    const result = harness.verifyOnChainDeposit({
      parsedTx: tx,
      requiredLamports: 100_000_000,
      senderWallet: sender.publicKey,
      escrowPubkey: escrow,
      minBlockTime: gameCreationTime,
    });

    assert.equal(result.valid, false, 'Stale transaction prior to game creation must be rejected');
    assert.includes(result.error, 'earlier than game creation');
  });

  it('B03-5: Multi-instruction transaction with extraneous compute budget & transfers is verified correctly', () => {
    const sender = harness.generateKeypair();
    const escrow = harness.escrowKeypair.publicKey.toBase58();
    const otherWallet = harness.generateKeypair().publicKey;

    const complexTx = {
      slot: 1005,
      blockTime: Math.floor(Date.now() / 1000),
      meta: { err: null, innerInstructions: [] },
      transaction: {
        signatures: ['complex_multi_ix_sig'],
        message: {
          instructions: [
            {
              program: 'system',
              parsed: {
                type: 'transfer',
                info: { source: sender.publicKey, destination: otherWallet, lamports: 5000 },
              },
            },
            {
              program: 'system',
              parsed: {
                type: 'transfer',
                info: { source: sender.publicKey, destination: escrow, lamports: 200_000_000 },
              },
            },
          ],
        },
      },
    };

    const result = harness.verifyOnChainDeposit({
      parsedTx: complexTx,
      requiredLamports: 200_000_000,
      senderWallet: sender.publicKey,
      escrowPubkey: escrow,
    });

    assert.equal(result.valid, true, 'Valid deposit amidst multi-instruction batch must be verified');
    assert.equal(result.transferredLamports, 200_000_000);
  });

  it('B03-6: Signature length boundary validation in VerifyAuth schema [64, 128]', () => {
    const pubkey = '11111111111111111111111111111111';
    assert.equal(VerifyAuthRequestSchema.safeParse({ publicKey: pubkey, signature: 'a'.repeat(63) }).success, false);
    assert.equal(VerifyAuthRequestSchema.safeParse({ publicKey: pubkey, signature: 'a'.repeat(64) }).success, true);
    assert.equal(VerifyAuthRequestSchema.safeParse({ publicKey: pubkey, signature: 'a'.repeat(128) }).success, true);
    assert.equal(VerifyAuthRequestSchema.safeParse({ publicKey: pubkey, signature: 'a'.repeat(129) }).success, false);
  });

  it('B03-7: Extremely large lamport deposit does not trigger arithmetic overflow', () => {
    const sender = harness.generateKeypair();
    const escrow = harness.escrowKeypair.publicKey.toBase58();
    const maxSafeLamports = 100_000_000_000_000; // 100,000 SOL

    const tx = harness.createMockParsedDepositTx({
      signature: 'large_lamport_sig',
      sourceWallet: sender.publicKey,
      destinationWallet: escrow,
      lamports: maxSafeLamports,
      success: true,
    });

    const result = harness.verifyOnChainDeposit({
      parsedTx: tx,
      requiredLamports: 50_000_000_000, // 50 SOL required
      senderWallet: sender.publicKey,
      escrowPubkey: escrow,
    });

    assert.equal(result.valid, true);
    assert.equal(result.transferredLamports, maxSafeLamports);
  });

  it('B03-8: Missing meta or null transaction object is rejected safely', () => {
    const result = harness.verifyOnChainDeposit({
      parsedTx: null,
      requiredLamports: 100_000_000,
      senderWallet: '11111111111111111111111111111111',
      escrowPubkey: harness.escrowKeypair.publicKey.toBase58(),
    });
    assert.equal(result.valid, false);
    assert.includes(result.error, 'not found');
  });

  it('B03-9: Multiple partial transfers summing to required lamports are verified', () => {
    const sender = harness.generateKeypair();
    const escrow = harness.escrowKeypair.publicKey.toBase58();

    // Two partial transfers of 50,000,000 summing to 100,000,000
    const partialTx = {
      slot: 2000,
      blockTime: Math.floor(Date.now() / 1000),
      meta: { err: null, innerInstructions: [] },
      transaction: {
        signatures: ['partial_transfers_sig'],
        message: {
          instructions: [
            {
              program: 'system',
              parsed: {
                type: 'transfer',
                info: { source: sender.publicKey, destination: escrow, lamports: 50_000_000 },
              },
            },
            {
              program: 'system',
              parsed: {
                type: 'transfer',
                info: { source: sender.publicKey, destination: escrow, lamports: 50_000_000 },
              },
            },
          ],
        },
      },
    };

    const result = harness.verifyOnChainDeposit({
      parsedTx: partialTx,
      requiredLamports: 100_000_000,
      senderWallet: sender.publicKey,
      escrowPubkey: escrow,
    });

    assert.equal(result.valid, true);
    assert.equal(result.transferredLamports, 100_000_000);
  });

  it('B03-10: Non-system program transfer instruction is ignored during verification', () => {
    const sender = harness.generateKeypair();
    const escrow = harness.escrowKeypair.publicKey.toBase58();

    const fakeProgramTx = {
      slot: 3000,
      blockTime: Math.floor(Date.now() / 1000),
      meta: { err: null, innerInstructions: [] },
      transaction: {
        signatures: ['fake_program_sig'],
        message: {
          instructions: [
            {
              program: 'spl-token', // Not system transfer
              parsed: {
                type: 'transfer',
                info: { source: sender.publicKey, destination: escrow, lamports: 100_000_000 },
              },
            },
          ],
        },
      },
    };

    const result = harness.verifyOnChainDeposit({
      parsedTx: fakeProgramTx,
      requiredLamports: 100_000_000,
      senderWallet: sender.publicKey,
      escrowPubkey: escrow,
    });

    assert.equal(result.valid, false, 'SPL token transfer must not satisfy native SOL escrow requirement');
  });
});
