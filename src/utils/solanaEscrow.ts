import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

export interface EscrowConfig {
  escrowPublicKey: string;
  houseWalletPublicKey: string;
  houseFeePercent: number;
  network: string;
}

let cachedConfig: EscrowConfig | null = null;

export async function getEscrowConfig(): Promise<EscrowConfig> {
  if (cachedConfig) return cachedConfig;
  const res = await fetch('/api/escrow/config');
  if (!res.ok) {
    throw new Error('Failed to fetch escrow configuration from server');
  }
  const data = await res.json();
  cachedConfig = data;
  return data;
}

export async function depositMatchStake({
  connection,
  sendTransaction,
  publicKey,
  amountSol,
}: {
  connection: Connection;
  sendTransaction: (transaction: Transaction, connection: Connection) => Promise<string>;
  publicKey: PublicKey;
  amountSol: number;
}): Promise<string> {
  const config = await getEscrowConfig();
  const escrowPubkey = new PublicKey(config.escrowPublicKey);
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

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = publicKey;

  const signature = await sendTransaction(transaction, connection);

  // Wait for confirmation on Solana network
  await connection.confirmTransaction(
    {
      signature,
      blockhash,
      lastValidBlockHeight,
    },
    'confirmed'
  );

  return signature;
}

export async function verifyDepositOnServer({
  gameId,
  role,
  txHash,
  senderWallet,
}: {
  gameId: string;
  role: 'player1' | 'player2';
  txHash: string;
  senderWallet: string;
}) {
  const res = await fetch('/api/escrow/verify-deposit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      gameId,
      role,
      txHash,
      senderWallet,
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to verify deposit on server');
  }

  return await res.json();
}

export async function settleMatchOnServer(gameId: string) {
  const res = await fetch('/api/escrow/settle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to settle match payout on server');
  }

  return await res.json();
}

export async function refundCancelOnServer(gameId: string, userId: string) {
  const res = await fetch('/api/escrow/refund-cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameId, userId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to process cancellation refund on server');
  }

  return await res.json();
}
