import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ESCROW_HOUSE_WALLET, SOLANA_RPC_URL } from '../constants';
import { logWarn } from './logger';

export const SOLANA_RPC_FALLBACKS = [
  (import.meta as any).env?.VITE_SOLANA_RPC_URL,
  SOLANA_RPC_URL,
  'https://api.mainnet-beta.solana.com',
].filter(Boolean) as string[];

export async function getReliableBlockhash(primaryConnection?: Connection): Promise<{
  blockhash: string;
  lastValidBlockHeight: number;
  connection: Connection;
}> {
  // Try primary connection first if provided
  if (primaryConnection) {
    try {
      const bh = await primaryConnection.getLatestBlockhash('confirmed');
      return { ...bh, connection: primaryConnection };
    } catch (e: any) {
      logWarn('Primary connection getLatestBlockhash failed, falling back:', e?.message);
    }
  }

  // Fallback to pool of public RPCs
  for (const rpc of SOLANA_RPC_FALLBACKS) {
    try {
      const conn = new Connection(rpc, 'confirmed');
      const bh = await conn.getLatestBlockhash('confirmed');
      return { ...bh, connection: conn };
    } catch (e: any) {
      logWarn(`RPC ${rpc} failed for blockhash:`, e?.message);
    }
  }

  throw new Error('Failed to retrieve recent blockhash from Solana network. Please try again.');
}

export async function waitForConfirmation(
  connection: Connection,
  signature: string,
  maxWaitMs = 15000
): Promise<string> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    try {
      const response = await connection.getSignatureStatuses([signature]);
      const status = response?.value?.[0];
      if (status) {
        if (status.err) {
          throw new Error(`Transaction failed on Solana: ${JSON.stringify(status.err)}`);
        }
        if (
          status.confirmationStatus === 'confirmed' ||
          status.confirmationStatus === 'finalized' ||
          status.confirmationStatus === 'processed'
        ) {
          return signature;
        }
      }
    } catch (err: any) {
      if (err.message && err.message.includes('Transaction failed on Solana')) {
        throw err;
      }
      logWarn('Polling signature status notice:', err?.message);
    }
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }
  return signature;
}

export async function depositMatchStake({
  connection,
  signTransaction,
  publicKey,
  amountSol,
}: {
  connection: Connection;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  publicKey: PublicKey;
  amountSol: number;
}): Promise<string> {
  const escrowPubkey = new PublicKey(ESCROW_HOUSE_WALLET);
  const lamports = Math.round(amountSol * LAMPORTS_PER_SOL);

  if (lamports <= 0) {
    throw new Error('Invalid stake amount');
  }

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: publicKey,
      toPubkey: escrowPubkey,
      lamports,
    })
  );

  const { blockhash, lastValidBlockHeight, connection: activeConn } = await getReliableBlockhash(connection);
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = publicKey;

  // Sign the transaction via wallet adapter
  const signedTx = await signTransaction(transaction);

  // Send the signed raw transaction to Solana network
  const rawTx = signedTx.serialize();
  const signature = await activeConn.sendRawTransaction(rawTx, {
    skipPreflight: false,
    preflightCommitment: 'confirmed',
  });

  // Confirm via HTTP polling without WebSocket dependency
  try {
    await waitForConfirmation(activeConn, signature);
  } catch (err: any) {
    logWarn('Confirmation notice:', err?.message);
  }

  return signature;
}


