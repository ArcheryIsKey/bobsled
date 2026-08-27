import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { ESCROW_HOUSE_WALLET, SOLANA_RPC_URL } from '../constants';
import { logWarn } from './logger';

export const SOLANA_RPC_FALLBACKS = [
  (import.meta as any).env?.VITE_SOLANA_RPC_URL,
  SOLANA_RPC_URL,
  'https://api.devnet.solana.com',
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

let cachedEscrowPublicKey: string | null = null;

export async function getEscrowPublicKey(): Promise<string> {
  if (cachedEscrowPublicKey && cachedEscrowPublicKey.length >= 32) {
    return cachedEscrowPublicKey;
  }
  if (ESCROW_HOUSE_WALLET && ESCROW_HOUSE_WALLET.length >= 32) {
    cachedEscrowPublicKey = ESCROW_HOUSE_WALLET;
    return cachedEscrowPublicKey;
  }
  try {
    const res = await fetch('/api/escrow/config');
    if (res.ok) {
      const data = await res.json();
      if (data.escrowPublicKey && typeof data.escrowPublicKey === 'string' && data.escrowPublicKey.length >= 32) {
        cachedEscrowPublicKey = data.escrowPublicKey;
        return cachedEscrowPublicKey;
      }
    }
  } catch (e: any) {
    logWarn('Failed to fetch escrow config from server:', e?.message);
  }
  throw new Error('Escrow vault public key is unavailable. Please try again.');
}

export const MIN_TX_FEE_BUFFER_SOL = 0.005;
export const MIN_WAGER_SOL = 0.001;
export const MAX_WAGER_SOL = 100.0;

export interface BalanceValidationResult {
  valid: boolean;
  currentBalance: number;
  requiredBalance: number;
  buffer: number;
  error?: string;
  faucetUrl: string;
}

export async function validateSolBalance(
  connection: Connection,
  publicKey: PublicKey,
  amountSol: number,
  bufferSol: number = MIN_TX_FEE_BUFFER_SOL
): Promise<BalanceValidationResult> {
  const faucetUrl = 'https://faucet.solana.com';
  const requiredBalance = amountSol + bufferSol;

  try {
    const lamports = await connection.getBalance(publicKey, 'confirmed');
    const currentBalance = lamports / LAMPORTS_PER_SOL;

    if (currentBalance < requiredBalance) {
      return {
        valid: false,
        currentBalance,
        requiredBalance,
        buffer: bufferSol,
        error: `Insufficient SOL balance. You have ${currentBalance.toFixed(4)} SOL, but need at least ${requiredBalance.toFixed(4)} SOL (${amountSol} wager + ${bufferSol} SOL network fee reserve). Request test SOL from the Solana Devnet Faucet.`,
        faucetUrl,
      };
    }

    return {
      valid: true,
      currentBalance,
      requiredBalance,
      buffer: bufferSol,
      faucetUrl,
    };
  } catch (err: any) {
    logWarn('Failed to fetch SOL balance for validation:', err?.message);
    return {
      valid: true,
      currentBalance: 0,
      requiredBalance,
      buffer: bufferSol,
      faucetUrl,
    };
  }
}

export async function depositMatchStake({
  connection,
  signTransaction,
  publicKey,
  amountSol,
  onSigned,
}: {
  connection: Connection;
  signTransaction: (transaction: Transaction) => Promise<Transaction>;
  publicKey: PublicKey;
  amountSol: number;
  onSigned?: (signature: string) => Promise<void>;
}): Promise<string> {
  if (typeof amountSol !== 'number' || isNaN(amountSol) || amountSol < MIN_WAGER_SOL || amountSol > MAX_WAGER_SOL) {
    throw new Error(`Wager amount must be between ${MIN_WAGER_SOL} and ${MAX_WAGER_SOL} SOL.`);
  }

  // Pre-validate balance before prompting wallet
  const balanceCheck = await validateSolBalance(connection, publicKey, amountSol);
  if (!balanceCheck.valid && balanceCheck.error) {
    throw new Error(balanceCheck.error);
  }

  const escrowKeyStr = await getEscrowPublicKey();
  const escrowPubkey = new PublicKey(escrowKeyStr);
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

  const { blockhash, connection: activeConn } = await getReliableBlockhash(connection);
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

  if (onSigned) {
    await onSigned(signature);
  }

  // Confirm via HTTP polling without WebSocket dependency
  try {
    await waitForConfirmation(activeConn, signature);
  } catch (err: any) {
    logWarn('Confirmation notice:', err?.message);
    // Even if confirmation polling times out, the tx might succeed.
    // The backend's recovery job will verify its final status.
  }

  return signature;
}


