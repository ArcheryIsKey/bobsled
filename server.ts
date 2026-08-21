import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  PublicKey,
  Connection,
  LAMPORTS_PER_SOL,
  Keypair,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import fs from 'fs';
import admin from 'firebase-admin';
import { cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

let firebaseConfig: any = null;
try {
  firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
} catch (e) {
  console.warn('Could not read firebase-applet-config.json');
}

// Initialize Firebase Admin
try {
  const serviceAccountPath = path.join(process.cwd(), 'service-account-key.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: cert(serviceAccount),
      projectId: firebaseConfig?.projectId,
    });
  } else if (firebaseConfig && firebaseConfig.projectId) {
    admin.initializeApp({ projectId: firebaseConfig.projectId });
  } else {
    admin.initializeApp();
  }
} catch (e) {
  console.error('Firebase Admin initialization failed:', e);
}

// -------------------------------------------------------------
// ESCROW VAULT & HOUSE TREASURY INITIALIZATION
// -------------------------------------------------------------
const HOUSE_WALLET_ADDRESS =
  process.env.HOUSE_WALLET_ADDRESS || '11111111111111111111111111111111';
const HOUSE_FEE_PERCENT = parseFloat(process.env.HOUSE_FEE_PERCENT || '3.5');
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'mainnet-beta';

let escrowKeypair: Keypair;

try {
  if (process.env.ESCROW_PRIVATE_KEY) {
    const rawKey = process.env.ESCROW_PRIVATE_KEY.trim();
    if (rawKey.startsWith('[')) {
      const secretBytes = Uint8Array.from(JSON.parse(rawKey));
      escrowKeypair = Keypair.fromSecretKey(secretBytes);
    } else {
      const decodeFn = (bs58 as any).decode || (bs58 as any).default?.decode;
      escrowKeypair = Keypair.fromSecretKey(decodeFn(rawKey));
    }
  } else {
    const keyPath = path.join(process.cwd(), 'escrow-keypair.json');
    if (fs.existsSync(keyPath)) {
      const secretBytes = Uint8Array.from(JSON.parse(fs.readFileSync(keyPath, 'utf8')));
      escrowKeypair = Keypair.fromSecretKey(secretBytes);
    } else {
      escrowKeypair = Keypair.generate();
      fs.writeFileSync(keyPath, JSON.stringify(Array.from(escrowKeypair.secretKey)), 'utf8');
      console.log('✨ [ESCROW VAULT GENERATED] Saved to escrow-keypair.json');
    }
  }
  console.log(`🔒 [ESCROW VAULT READY] Public Key: ${escrowKeypair.publicKey.toBase58()}`);
  console.log(`🏦 [HOUSE TREASURY] Wallet: ${HOUSE_WALLET_ADDRESS} (Rake: ${HOUSE_FEE_PERCENT}%)`);
} catch (err) {
  console.error('Failed to initialize Escrow Keypair, generating fallback in-memory keypair:', err);
  escrowKeypair = Keypair.generate();
}

function getSolanaConnection(): Connection {
  const rpc =
    process.env.SOLANA_RPC_URL ||
    (SOLANA_NETWORK === 'devnet'
      ? 'https://api.devnet.solana.com'
      : 'https://api.mainnet-beta.solana.com');
  return new Connection(rpc, 'confirmed');
}

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// In-memory store for nonces
const nonces = new Map<string, string>();

function generateNonce() {
  return Math.floor(Math.random() * 1000000).toString();
}

app.post('/api/auth/nonce', (req, res) => {
  const { publicKey } = req.body;
  if (!publicKey) {
    return res.status(400).json({ error: 'Public key is required' });
  }
  const nonce = generateNonce();
  nonces.set(publicKey, nonce);
  res.json({ nonce });
});

app.post('/api/auth/verify', async (req, res) => {
  const { publicKey, signature } = req.body;
  if (!publicKey || !signature) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const nonce = nonces.get(publicKey);
  if (!nonce) {
    return res.status(400).json({ error: 'Nonce not found or expired' });
  }

  try {
    const message = new TextEncoder().encode(`Sign in to bobsled.gg\n\nNonce: ${nonce}`);
    const decodeFn = (bs58 as any).decode || (bs58 as any).default?.decode;
    const signatureUint8 = decodeFn(signature);
    const pubKeyUint8 = new PublicKey(publicKey).toBytes();

    const isValid = nacl.sign.detached.verify(message, signatureUint8, pubKeyUint8);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    nonces.delete(publicKey);

    let token = null;
    try {
      let uid = publicKey;
      const db = getFirestore();
      const snapshot = await db.collection('users').where('walletAddress', '==', publicKey).limit(1).get();
      if (!snapshot.empty) {
        uid = snapshot.docs[0].id;
      }
      token = await getAuth().createCustomToken(uid);
    } catch (tokenErr) {
      console.error('Failed to create custom token:', tokenErr);
      return res.status(500).json({ error: 'Failed to create auth token' });
    }

    res.json({ success: true, token });
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// High-reliability Solana balance lookup
app.get('/api/solana/balance', async (req, res) => {
  const { wallet } = req.query;
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'Missing wallet query parameter' });
  }

  const rpcEndpoints = [
    process.env.SOLANA_RPC_URL,
    'https://api.mainnet-beta.solana.com',
    'https://rpc.ankr.com/solana',
    'https://solana.public-rpc.com',
  ].filter(Boolean) as string[];

  for (const rpc of rpcEndpoints) {
    try {
      const conn = new Connection(rpc, 'confirmed');
      const lamports = await conn.getBalance(new PublicKey(wallet));
      const sol = lamports / LAMPORTS_PER_SOL;
      return res.json({ success: true, balance: sol, sol, lamports });
    } catch (e: any) {
      console.warn(`RPC ${rpc} balance query failed:`, e?.message);
    }
  }

  res.status(500).json({ error: 'Failed to query balance from Solana network' });
});

// -------------------------------------------------------------
// ESCROW API ENDPOINTS
// -------------------------------------------------------------

// 1. Get Active Escrow Public Config
app.get('/api/escrow/config', (req, res) => {
  res.json({
    escrowPublicKey: escrowKeypair.publicKey.toBase58(),
    houseWalletPublicKey: HOUSE_WALLET_ADDRESS,
    houseFeePercent: HOUSE_FEE_PERCENT,
    network: SOLANA_NETWORK,
  });
});

// 2. Verify On-Chain Deposit for Match Creation or Join
app.post('/api/escrow/verify-deposit', async (req, res) => {
  const { gameId, role, txHash, senderWallet } = req.body;

  if (!gameId || !role || !txHash || !senderWallet) {
    return res.status(400).json({ error: 'Missing required deposit verification parameters' });
  }

  try {
    const db = getFirestore();
    const gameRef = db.collection('games').doc(gameId);
    const gameDoc = await gameRef.get();

    if (!gameDoc.exists) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const gameData = gameDoc.data() as any;
    const requiredLamports = Math.round((gameData.wager || 0) * LAMPORTS_PER_SOL);

    if (requiredLamports <= 0) {
      return res.status(400).json({ error: 'This match does not require a SOL stake' });
    }

    // Verify transaction on Solana
    const conn = getSolanaConnection();
    const parsedTx = await conn.getParsedTransaction(txHash, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });

    if (!parsedTx) {
      return res.status(400).json({ error: 'Transaction not found or not yet confirmed on Solana' });
    }

    if (parsedTx.meta?.err) {
      return res.status(400).json({ error: 'Transaction failed on-chain' });
    }

    // Check transfer instruction details
    const escrowPubkeyStr = escrowKeypair.publicKey.toBase58();
    let validTransfer = false;

    for (const ix of parsedTx.transaction.message.instructions as any[]) {
      if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
        const info = ix.parsed.info;
        if (
          info.source === senderWallet &&
          info.destination === escrowPubkeyStr &&
          info.lamports >= requiredLamports
        ) {
          validTransfer = true;
          break;
        }
      }
    }

    if (!validTransfer) {
      return res.status(400).json({
        error: `Deposit transaction did not transfer the required ${gameData.wager} SOL from ${senderWallet} to Escrow Vault`,
      });
    }

    // Update Firestore with verified deposit
    if (role === 'player1') {
      await gameRef.update({
        p1DepositTx: txHash,
        p1Wallet: senderWallet,
        escrowStatus: 'p1_funded',
        status: 'waiting',
        updatedAt: FieldValue.serverTimestamp(),
      });
      return res.json({ success: true, escrowStatus: 'p1_funded', txHash });
    } else {
      await gameRef.update({
        p2DepositTx: txHash,
        p2Wallet: senderWallet,
        escrowStatus: 'fully_funded',
        status: 'active',
        updatedAt: FieldValue.serverTimestamp(),
      });
      return res.json({ success: true, escrowStatus: 'fully_funded', txHash });
    }
  } catch (err: any) {
    console.error('Error verifying escrow deposit:', err);
    res.status(500).json({ error: err.message || 'Internal server error during deposit verification' });
  }
});

// 3. Settle Match Payout to Winner & House Treasury
app.post('/api/escrow/settle', async (req, res) => {
  const { gameId } = req.body;

  if (!gameId) {
    return res.status(400).json({ error: 'Missing gameId' });
  }

  try {
    const db = getFirestore();
    const gameRef = db.collection('games').doc(gameId);
    const gameDoc = await gameRef.get();

    if (!gameDoc.exists) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const game = gameDoc.data() as any;

    if (game.status !== 'finished') {
      return res.status(400).json({ error: 'Game is not finished yet' });
    }

    if (!game.wager || game.wager <= 0 || game.wagerCurrency === 'FREE') {
      return res.json({ success: true, message: 'Free match, no payout needed' });
    }

    // Idempotency: prevent double payouts
    if (game.payoutTx) {
      return res.json({ success: true, payoutTx: game.payoutTx, message: 'Payout already disbursed' });
    }

    if (game.escrowStatus !== 'fully_funded') {
      return res.status(400).json({ error: 'Match was not fully funded in escrow' });
    }

    const conn = getSolanaConnection();
    const totalPotLamports = Math.round(game.wager * 2 * LAMPORTS_PER_SOL);
    const houseFeeLamports = Math.round(totalPotLamports * (HOUSE_FEE_PERCENT / 100));
    const winnerPayoutLamports = totalPotLamports - houseFeeLamports;

    // A. Handle Match Draw -> Refund Both Players
    if (game.winner === 'draw') {
      const p1WalletStr = game.p1Wallet;
      const p2WalletStr = game.p2Wallet;

      if (!p1WalletStr || !p2WalletStr) {
        return res.status(400).json({ error: 'Missing player wallet addresses for draw refund' });
      }

      const singleRefundLamports = Math.round(game.wager * LAMPORTS_PER_SOL);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: escrowKeypair.publicKey,
          toPubkey: new PublicKey(p1WalletStr),
          lamports: singleRefundLamports,
        }),
        SystemProgram.transfer({
          fromPubkey: escrowKeypair.publicKey,
          toPubkey: new PublicKey(p2WalletStr),
          lamports: singleRefundLamports,
        })
      );

      const signature = await sendAndConfirmTransaction(conn, tx, [escrowKeypair], {
        commitment: 'confirmed',
      });

      await gameRef.update({
        payoutTx: signature,
        payoutStatus: 'draw_refunded',
        updatedAt: FieldValue.serverTimestamp(),
      });

      return res.json({ success: true, payoutTx: signature, result: 'draw_refunded' });
    }

    // B. Handle Winner Payout + House Rake
    let winnerWalletStr = game.winner === game.player1 ? game.p1Wallet : game.p2Wallet;

    if (!winnerWalletStr) {
      // Fallback: look up user document
      const userDoc = await db.collection('users').doc(game.winner).get();
      winnerWalletStr = userDoc.data()?.walletAddress;
    }

    if (!winnerWalletStr) {
      return res.status(400).json({ error: 'Could not resolve winner wallet address' });
    }

    const winnerPubkey = new PublicKey(winnerWalletStr);
    const housePubkey = new PublicKey(HOUSE_WALLET_ADDRESS);

    const tx = new Transaction().add(
      // 1. Transfer prize to winner
      SystemProgram.transfer({
        fromPubkey: escrowKeypair.publicKey,
        toPubkey: winnerPubkey,
        lamports: winnerPayoutLamports,
      }),
      // 2. Transfer house rake to treasury
      SystemProgram.transfer({
        fromPubkey: escrowKeypair.publicKey,
        toPubkey: housePubkey,
        lamports: houseFeeLamports,
      })
    );

    const signature = await sendAndConfirmTransaction(conn, tx, [escrowKeypair], {
      commitment: 'confirmed',
    });

    await gameRef.update({
      payoutTx: signature,
      payoutStatus: 'completed',
      payoutAmount: winnerPayoutLamports / LAMPORTS_PER_SOL,
      houseFeeAmount: houseFeeLamports / LAMPORTS_PER_SOL,
      updatedAt: FieldValue.serverTimestamp(),
    });

    res.json({
      success: true,
      payoutTx: signature,
      winnerPayout: winnerPayoutLamports / LAMPORTS_PER_SOL,
      houseFee: houseFeeLamports / LAMPORTS_PER_SOL,
    });
  } catch (err: any) {
    console.error('Error settling match payout:', err);
    res.status(500).json({ error: err.message || 'Internal server error during settlement' });
  }
});

// 4. Refund Host on Waiting Match Cancellation
app.post('/api/escrow/refund-cancel', async (req, res) => {
  const { gameId, userId } = req.body;

  if (!gameId || !userId) {
    return res.status(400).json({ error: 'Missing gameId or userId' });
  }

  try {
    const db = getFirestore();
    const gameRef = db.collection('games').doc(gameId);
    const gameDoc = await gameRef.get();

    if (!gameDoc.exists) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const game = gameDoc.data() as any;

    if (game.player1 !== userId) {
      return res.status(403).json({ error: 'Only the host can cancel and claim a refund' });
    }

    if (game.status !== 'waiting') {
      return res.status(400).json({ error: 'Cannot cancel a match that is active or finished' });
    }

    if (game.wager > 0 && game.escrowStatus === 'p1_funded' && !game.refundTx) {
      const p1WalletStr = game.p1Wallet;
      if (!p1WalletStr) {
        return res.status(400).json({ error: 'Host wallet address not found' });
      }

      const conn = getSolanaConnection();
      const refundLamports = Math.round(game.wager * LAMPORTS_PER_SOL);

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: escrowKeypair.publicKey,
          toPubkey: new PublicKey(p1WalletStr),
          lamports: refundLamports,
        })
      );

      const signature = await sendAndConfirmTransaction(conn, tx, [escrowKeypair], {
        commitment: 'confirmed',
      });

      await gameRef.delete();
      return res.json({ success: true, refundTx: signature });
    }

    // Free game or unfunded game cancellation
    await gameRef.delete();
    res.json({ success: true, message: 'Match deleted' });
  } catch (err: any) {
    console.error('Error processing cancellation refund:', err);
    res.status(500).json({ error: err.message || 'Internal server error during refund' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
