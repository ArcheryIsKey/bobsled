/**
 * Mock Solana & Cryptographic Test Harness
 * Deterministic generation of Solana keypairs, transactions, and parsed instruction logs.
 */

import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';

export class MockSolanaHarness {
  constructor() {
    this.escrowKeypair = Keypair.generate();
    this.houseWalletPubkey = '11111111111111111111111111111111';
    this.transactions = new Map();
  }

  generateKeypair() {
    const kp = Keypair.generate();
    const encodeFn = bs58.encode || bs58.default?.encode;
    return {
      keypair: kp,
      publicKey: kp.publicKey.toBase58(),
      secretKeyBase58: encodeFn(kp.secretKey),
      secretKeyArray: Array.from(kp.secretKey),
    };
  }

  signAuthNonce(nonce, keypair) {
    const message = new TextEncoder().encode(`Sign in to bobsled.gg\n\nNonce: ${nonce}`);
    const signatureUint8 = nacl.sign.detached(message, keypair.secretKey);
    const encodeFn = bs58.encode || bs58.default?.encode;
    return encodeFn(signatureUint8);
  }

  createMockParsedDepositTx({
    signature,
    sourceWallet,
    destinationWallet,
    lamports,
    success = true,
    slot = 1000,
    blockTime = Math.floor(Date.now() / 1000),
    isInnerInstruction = false,
  }) {
    const tx = {
      slot,
      blockTime,
      meta: {
        err: success ? null : { InstructionError: [0, 'CustomError'] },
        fee: 5000,
        innerInstructions: isInnerInstruction
          ? [
              {
                index: 0,
                instructions: [
                  {
                    program: 'system',
                    programId: '11111111111111111111111111111111',
                    parsed: {
                      type: 'transfer',
                      info: {
                        source: sourceWallet,
                        destination: destinationWallet,
                        lamports,
                      },
                    },
                  },
                ],
              },
            ]
          : [],
      },
      transaction: {
        signatures: [signature],
        message: {
          instructions: isInnerInstruction
            ? [
                {
                  programId: 'SomeSmartContract1111111111111111111111111111',
                  accounts: [sourceWallet, destinationWallet],
                  data: 'cpi_invocation',
                },
              ]
            : [
                {
                  program: 'system',
                  programId: '11111111111111111111111111111111',
                  parsed: {
                    type: 'transfer',
                    info: {
                      source: sourceWallet,
                      destination: destinationWallet,
                      lamports,
                    },
                  },
                },
              ],
        },
      },
    };

    this.transactions.set(signature, tx);
    return tx;
  }

  getParsedTransaction(signature) {
    return this.transactions.get(signature) || null;
  }

  /**
   * Deterministic verifyOnChainDeposit reference implementation
   */
  verifyOnChainDeposit({
    parsedTx,
    requiredLamports,
    senderWallet,
    escrowPubkey,
    minBlockTime = 0,
  }) {
    if (!parsedTx) {
      return { valid: false, error: 'Transaction not found on Solana' };
    }

    if (parsedTx.meta?.err) {
      return { valid: false, error: 'Transaction failed on-chain' };
    }

    if (minBlockTime > 0 && parsedTx.blockTime && parsedTx.blockTime < minBlockTime) {
      return { valid: false, error: 'Transaction blockTime is earlier than game creation' };
    }

    let transferFound = false;
    let transferredLamports = 0;

    // Check outer instructions
    const outerIxs = parsedTx.transaction?.message?.instructions || [];
    for (const ix of outerIxs) {
      if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
        const info = ix.parsed.info;
        if (info.source === senderWallet && info.destination === escrowPubkey) {
          transferredLamports += info.lamports || 0;
        }
      }
    }

    // Check inner instructions (CPI)
    const innerIxGroups = parsedTx.meta?.innerInstructions || [];
    for (const group of innerIxGroups) {
      for (const ix of group.instructions || []) {
        if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
          const info = ix.parsed.info;
          if (info.source === senderWallet && info.destination === escrowPubkey) {
            transferredLamports += info.lamports || 0;
          }
        }
      }
    }

    if (transferredLamports >= requiredLamports && requiredLamports > 0) {
      transferFound = true;
    }

    if (!transferFound) {
      return {
        valid: false,
        error: `Deposit transaction did not transfer required ${requiredLamports} lamports from ${senderWallet} to Escrow Vault`,
      };
    }

    return { valid: true, transferredLamports };
  }
}
