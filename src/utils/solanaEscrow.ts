import { Connection, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';

export const ESCROW_HOUSE_WALLET = '11111111111111111111111111111111';

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
