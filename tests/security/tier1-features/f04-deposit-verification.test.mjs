/**
 * Tier 1 Feature Test: F4 - On-Chain Deposit Verification Engine
 * Verifies on-chain transaction validation: outer/inner instructions, lamport amounts, wallets, and tx status.
 */

import { describe, it, assert } from '../harness/test-runner.mjs';
import { MockSolanaHarness } from '../harness/mock-solana.mjs';

describe('Tier 1: F4 - On-Chain Deposit Verification Engine', () => {
  it('F4-1: Valid outer instruction transfer to escrow vault succeeds', () => {
    const harness = new MockSolanaHarness();
    const sender = harness.generateKeypair();
    const escrow = harness.escrowKeypair.publicKey.toBase58();
    const requiredLamports = 100_000_000; // 0.1 SOL

    const tx = harness.createMockParsedDepositTx({
      signature: 'valid_outer_sig_1',
      sourceWallet: sender.publicKey,
      destinationWallet: escrow,
      lamports: requiredLamports,
      success: true,
    });

    const result = harness.verifyOnChainDeposit({
      parsedTx: tx,
      requiredLamports,
      senderWallet: sender.publicKey,
      escrowPubkey: escrow,
    });

    assert.equal(result.valid, true, 'Valid outer deposit should pass verification');
    assert.equal(result.transferredLamports, requiredLamports);
  });

  it('F4-2: Valid inner instruction (CPI) transfer to escrow vault succeeds', () => {
    const harness = new MockSolanaHarness();
    const sender = harness.generateKeypair();
    const escrow = harness.escrowKeypair.publicKey.toBase58();
    const requiredLamports = 500_000_000; // 0.5 SOL

    const tx = harness.createMockParsedDepositTx({
      signature: 'valid_inner_sig_1',
      sourceWallet: sender.publicKey,
      destinationWallet: escrow,
      lamports: requiredLamports,
      success: true,
      isInnerInstruction: true,
    });

    const result = harness.verifyOnChainDeposit({
      parsedTx: tx,
      requiredLamports,
      senderWallet: sender.publicKey,
      escrowPubkey: escrow,
    });

    assert.equal(result.valid, true, 'Valid inner CPI deposit should pass verification');
    assert.equal(result.transferredLamports, requiredLamports);
  });

  it('F4-3: Transaction with on-chain error (meta.err != null) is rejected', () => {
    const harness = new MockSolanaHarness();
    const sender = harness.generateKeypair();
    const escrow = harness.escrowKeypair.publicKey.toBase58();

    const tx = harness.createMockParsedDepositTx({
      signature: 'failed_tx_sig',
      sourceWallet: sender.publicKey,
      destinationWallet: escrow,
      lamports: 100_000_000,
      success: false,
    });

    const result = harness.verifyOnChainDeposit({
      parsedTx: tx,
      requiredLamports: 100_000_000,
      senderWallet: sender.publicKey,
      escrowPubkey: escrow,
    });

    assert.equal(result.valid, false, 'Failed Solana transaction must be rejected');
    assert.includes(result.error, 'failed on-chain');
  });

  it('F4-4: Transaction with insufficient lamports is rejected', () => {
    const harness = new MockSolanaHarness();
    const sender = harness.generateKeypair();
    const escrow = harness.escrowKeypair.publicKey.toBase58();

    const tx = harness.createMockParsedDepositTx({
      signature: 'underfunded_sig',
      sourceWallet: sender.publicKey,
      destinationWallet: escrow,
      lamports: 50_000_000, // 0.05 SOL deposited
      success: true,
    });

    const result = harness.verifyOnChainDeposit({
      parsedTx: tx,
      requiredLamports: 100_000_000, // 0.1 SOL required
      senderWallet: sender.publicKey,
      escrowPubkey: escrow,
    });

    assert.equal(result.valid, false, 'Deposit with insufficient lamports must be rejected');
    assert.includes(result.error, 'did not transfer required');
  });

  it('F4-5: Transfer to wrong destination wallet or wrong sender is rejected', () => {
    const harness = new MockSolanaHarness();
    const sender = harness.generateKeypair();
    const attackerWallet = harness.generateKeypair().publicKey;
    const escrow = harness.escrowKeypair.publicKey.toBase58();

    // Deposit went to attacker wallet instead of escrow vault
    const tx = harness.createMockParsedDepositTx({
      signature: 'wrong_dest_sig',
      sourceWallet: sender.publicKey,
      destinationWallet: attackerWallet,
      lamports: 100_000_000,
      success: true,
    });

    const result = harness.verifyOnChainDeposit({
      parsedTx: tx,
      requiredLamports: 100_000_000,
      senderWallet: sender.publicKey,
      escrowPubkey: escrow,
    });

    assert.equal(result.valid, false, 'Transfer to incorrect destination must be rejected');
  });
});
