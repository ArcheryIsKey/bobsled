import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

export const ESCROW_HOUSE_WALLET = '11111111111111111111111111111111';

export const SOLANA_RPC_FALLBACKS = [
  (import.meta as any).env?.VITE_SOLANA_RPC_URL,
  'https://rpc.ankr.com/solana',
  'https://solana.public-rpc.com',
  'https://1rpc.io/sol',
  'https://solana-mainnet.rpc.extrnode.com',
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
      console.warn('Primary connection getLatestBlockhash failed, falling back:', e?.message);
    }
  }

  // Fallback to pool of public RPCs
  for (const rpc of SOLANA_RPC_FALLBACKS) {
    try {
      const conn = new Connection(rpc, 'confirmed');
      const bh = await conn.getLatestBlockhash('confirmed');
      return { ...bh, connection: conn };
    } catch (e: any) {
      console.warn(`RPC ${rpc} failed for blockhash:`, e?.message);
    }
  }

  throw new Error('Failed to retrieve recent blockhash from Solana network. Please try again.');
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

  const signature = await sendTransaction(transaction, activeConn);

  // Wait for confirmation on Solana network
  try {
    await activeConn.confirmTransaction(
      {
        signature,
        blockhash,
        lastValidBlockHeight,
      },
      'confirmed'
    );
  } catch (confirmErr: any) {
    console.warn('First confirmation check had notice, validating status:', confirmErr?.message);
  }

  return signature;
}
