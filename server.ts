import { z } from 'zod';
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
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

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
const HOUSE_WALLET_ADDRESS = (process.env.HOUSE_WALLET_ADDRESS || '').trim();
const rawHouseFee = parseFloat(process.env.HOUSE_FEE_PERCENT || '3.5');
const HOUSE_FEE_PERCENT = Math.min(Math.max(isNaN(rawHouseFee) ? 3.5 : rawHouseFee, 0.0), 20.0);
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';

let escrowKeypair!: Keypair;

try {
  let rawKey = (process.env.ESCROW_PRIVATE_KEY || '').trim();

  // For local development, allow loading from local gitignored keypair file if env var is not set
  if (!rawKey) {
    const keyPath = path.join(process.cwd(), 'escrow-keypair.json');
    if (fs.existsSync(keyPath)) {
      try {
        rawKey = fs.readFileSync(keyPath, 'utf8').trim();
      } catch (e) {
        console.warn('Could not read local escrow-keypair.json:', e);
      }
    }
  }

  // Handle accidental concatenation/whitespace in env var
  if (rawKey.includes(' ') || rawKey.includes('\n')) {
    const tokens = rawKey.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (!token.includes('=')) {
        rawKey = token;
        break;
      }
    }
  }

  if (!rawKey) {
    if (process.env.NODE_ENV === 'production') {
      console.error('FATAL: ESCROW_PRIVATE_KEY environment variable is required in production.');
      process.exit(1);
    } else {
      console.warn('ESCROW_PRIVATE_KEY not set in non-production. Generating temporary ephemeral keypair.');
      escrowKeypair = Keypair.generate();
    }
  } else {
    const decodeFn = (bs58 as any).decode || (bs58 as any).default?.decode;
    let secretBytes: Uint8Array;
    if (rawKey.startsWith('[')) {
      secretBytes = Uint8Array.from(JSON.parse(rawKey));
    } else {
      secretBytes = decodeFn(rawKey);
    }

    if (!secretBytes || secretBytes.length !== 64) {
      throw new Error('Invalid keypair length: expected 64-byte secret key.');
    }

    escrowKeypair = Keypair.fromSecretKey(secretBytes);
  }

  if (escrowKeypair) {
    console.log(`🔒 [ESCROW VAULT READY] Public Key: ${escrowKeypair.publicKey.toBase58()}`);
    console.log(`🏦 [HOUSE TREASURY] Wallet: ${HOUSE_WALLET_ADDRESS} (Rake: ${HOUSE_FEE_PERCENT}%)`);
  }
} catch (err: any) {
  console.error('CRITICAL ESCROW CONFIGURATION ERROR: Failed to initialize escrow keypair', err);
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

function getSolanaConnection(): Connection {
  const rpc =
    process.env.SOLANA_RPC_URL ||
    (SOLANA_NETWORK === 'devnet'
      ? 'https://api.devnet.solana.com'
      : 'https://api.mainnet-beta.solana.com');
  return new Connection(rpc, 'confirmed');
}

export interface VerifyDepositOptions {
  parsedTx: any;
  requiredLamports: number;
  senderWallet: string;
  escrowPubkey: string;
  minBlockTime?: number;
}

export interface VerifyDepositResult {
  valid: boolean;
  error?: string;
  transferredLamports?: number;
}

export function verifyOnChainDeposit({
  parsedTx,
  requiredLamports,
  senderWallet,
  escrowPubkey,
  minBlockTime = 0,
}: VerifyDepositOptions): VerifyDepositResult {
  if (!parsedTx) {
    return { valid: false, error: 'Transaction not found or not yet confirmed on Solana' };
  }

  if (parsedTx.meta?.err) {
    return { valid: false, error: 'Transaction failed on-chain' };
  }

  if (minBlockTime > 0 && parsedTx.blockTime && parsedTx.blockTime < minBlockTime) {
    return { valid: false, error: 'Transaction blockTime is earlier than match creation' };
  }

  let transferredLamports = 0;

  // Check outer instructions
  const outerIxs = parsedTx.transaction?.message?.instructions || [];
  for (const ix of outerIxs) {
    if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
      const info = ix.parsed.info;
      if (info?.source === senderWallet && info?.destination === escrowPubkey) {
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
        if (info?.source === senderWallet && info?.destination === escrowPubkey) {
          transferredLamports += info.lamports || 0;
        }
      }
    }
  }

  if (transferredLamports < requiredLamports || requiredLamports <= 0) {
    return {
      valid: false,
      error: `Deposit transaction did not transfer the required ${requiredLamports / LAMPORTS_PER_SOL} SOL from ${senderWallet} to Escrow Vault`,
    };
  }

  return { valid: true, transferredLamports };
}

// -------------------------------------------------------------
// SERVER-AUTHORITATIVE ADMIN HISTORY & SOLSCAN LOGGING
// -------------------------------------------------------------

export type AdminHistoryEventType =
  | 'created'
  | 'deposit_p1'
  | 'deposit_p2'
  | 'match_started'
  | 'resigned'
  | 'timeout_win'
  | 'game_finished'
  | 'paid_out'
  | 'refunded'
  | 'draw_refunded'
  | 'cancelled'
  | 'cron_recovery';

export interface AdminHistoryLogEntry {
  eventType: AdminHistoryEventType | string;
  eventLabel: string;
  gameId: string;
  userId: string;
  username?: string;
  walletAddress?: string | null;
  role?: 'player1' | 'player2' | 'system' | 'admin' | string;
  targetUserId?: string | null;
  targetUsername?: string | null;
  targetWallet?: string | null;
  wager?: number;
  wagerCurrency?: 'SOL' | 'FREE';
  totalPot?: number | null;
  amountSol?: number | null;
  houseFeeSol?: number | null;
  txSignature?: string | null;
  status?: 'confirmed' | 'processing' | 'failed';
  metadata?: Record<string, any>;
}

export function constructSolscanTxUrl(txSignature: string, network = SOLANA_NETWORK): string {
  return `https://solscan.io/tx/${txSignature}?cluster=${network}`;
}

export function constructSolscanAccountUrl(walletAddress: string, network = SOLANA_NETWORK): string {
  return `https://solscan.io/account/${walletAddress}?cluster=${network}`;
}

export async function logAdminHistory(entry: AdminHistoryLogEntry) {
  try {
    const db = getFirestore();
    const solscanUrl = entry.txSignature
      ? constructSolscanTxUrl(entry.txSignature, SOLANA_NETWORK)
      : null;

    const record = {
      timestamp: FieldValue.serverTimestamp(),
      isoTimestamp: new Date().toISOString(),
      eventType: entry.eventType,
      eventLabel: entry.eventLabel,
      status: entry.status || 'confirmed',
      gameId: entry.gameId,
      gameType: 'connect4' as const,
      wager: typeof entry.wager === 'number' ? entry.wager : 0,
      wagerCurrency: entry.wagerCurrency || (entry.wager && entry.wager > 0 ? 'SOL' : 'FREE'),
      totalPot: entry.totalPot !== undefined && entry.totalPot !== null
        ? entry.totalPot
        : (typeof entry.wager === 'number' ? entry.wager * 2 : 0),
      userId: entry.userId || 'system',
      username: entry.username || 'Anonymous',
      walletAddress: entry.walletAddress || null,
      role: entry.role || 'system',
      targetUserId: entry.targetUserId || null,
      targetUsername: entry.targetUsername || null,
      targetWallet: entry.targetWallet || null,
      amountSol: entry.amountSol !== undefined ? entry.amountSol : null,
      houseFeeSol: entry.houseFeeSol !== undefined ? entry.houseFeeSol : null,
      txSignature: entry.txSignature || null,
      solscanUrl,
      network: SOLANA_NETWORK,
      metadata: entry.metadata || {},
    };

    const docRef = await db.collection('admin_history').add(record);
    return { id: docRef.id, ...record };
  } catch (logErr) {
    console.error('Failed to write admin history log:', logErr);
    return null;
  }
}

const app = express();

// Trust reverse proxy for Cloud Run
app.set('trust proxy', 1);

// Standard HTTP Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: [
          "'self'",
          'https://bobsled-gg-app.firebaseapp.com',
          'https://*.firebaseio.com',
          'wss://*.firebaseio.com',
          'https://*.googleapis.com',
          'https://identitytoolkit.googleapis.com',
          'https://securetoken.googleapis.com',
          'https://firestore.googleapis.com',
          'https://api.mainnet-beta.solana.com',
          'https://api.devnet.solana.com',
          'https://api.coinbase.com',
          'https://api.coingecko.com',
          'https://api.binance.com',
          'https://solscan.io',
        ],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    xContentTypeOptions: true,
    crossOriginEmbedderPolicy: false,
  })
);

// Explicit Security Headers Middleware
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

// Restricted CORS Configuration
const configuredOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = new Set<string>([
  'https://bobsled-gg-app.web.app',
  'https://bobsled-gg-app.firebaseapp.com',
  ...configuredOrigins,
  ...(process.env.NODE_ENV !== 'production'
    ? ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173']
    : []),
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || ALLOWED_ORIGINS.has(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Idempotency-Key'],
    maxAge: 86400,
  })
);

// 1. General Rate Limiter (200 requests / 5 min per IP on /api/)
const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 200,
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', generalLimiter);

// 2. Auth Limiter (15 requests / 1 min per IP on /api/auth/)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 15,
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded for authentication, please slow down.' },
});
app.use('/api/auth/', authLimiter);

// 3. Sensitive Settlement & Escrow Limiter (10 requests / 1 min per IP)
const settlementLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded for sensitive operation, please slow down.' },
});
app.use('/api/escrow/settle', settlementLimiter);
app.use('/api/escrow/refund-cancel', settlementLimiter);
app.use('/api/escrow/verify-deposit', settlementLimiter);

// 4. Cron Recovery Limiter (5 requests / 1 min per IP on /api/cron/)
const cronLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  statusCode: 429,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded for maintenance cron, please slow down.' },
});
app.use('/api/cron/', cronLimiter);

app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3000;

// In-memory store for nonces
const nonces = new Map<string, string>();

const crypto = require('crypto');
function generateNonce() {
  return crypto.randomBytes(32).toString('base64url');
}

const NonceSchema = z.object({ publicKey: z.string().min(32).max(44) }).strict();
app.post('/api/auth/nonce', (req, res) => {
  const parseResult = NonceSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.issues });
  }
  const { publicKey } = parseResult.data;
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
    SOLANA_NETWORK === 'devnet'
      ? 'https://api.devnet.solana.com'
      : 'https://api.mainnet-beta.solana.com',
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

// JSON-RPC Proxy for Solana Web3 client requests (CORS-free, high-reliability)
const RpcSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string().max(50), z.number()]).optional(),
  method: z.string().min(1).max(50),
  params: z.array(z.any()).max(10).optional(),
}).strict();
app.post('/api/solana/rpc', async (req, res) => {
  const parseResult = RpcSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: req.body?.id || null });
  }
  const rpcEndpoints = [
    process.env.SOLANA_RPC_URL,
    SOLANA_NETWORK === 'devnet'
      ? 'https://api.devnet.solana.com'
      : 'https://api.mainnet-beta.solana.com',
  ].filter(Boolean) as string[];

  for (const rpc of rpcEndpoints) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      return res.json(data);
    } catch (e: any) {
      console.warn(`RPC proxy to ${rpc} failed:`, e?.message);
    }
  }

  res.status(502).json({ jsonrpc: '2.0', error: { code: -32603, message: 'All RPC endpoints failed' }, id: req.body?.id });
});

// -------------------------------------------------------------
// ESCROW API ENDPOINTS
// -------------------------------------------------------------

// 1. Get Active Escrow Public Config
app.get('/api/escrow/config', (req, res) => {
  res.json({
    escrowPublicKey: escrowKeypair ? escrowKeypair.publicKey.toBase58() : '',
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

  if (role !== 'player1' && role !== 'player2') {
    return res.status(400).json({ error: 'Invalid role for deposit verification' });
  }

  try {
    const db = getFirestore();
    const gameRef = db.collection('games').doc(gameId);
    const gameDoc = await gameRef.get();

    if (!gameDoc.exists) {
      return res.status(404).json({ error: 'Game not found' });
    }

    const gameData = gameDoc.data() as any;
    if (!gameData.wager || gameData.wager <= 0 || gameData.wagerCurrency === 'FREE') {
      return res.status(400).json({ error: 'This match does not require a SOL stake' });
    }

    if (typeof gameData.wager !== 'number' || !isFinite(gameData.wager) || gameData.wager < 0.001 || gameData.wager > 100.0) {
      return res.status(400).json({ error: 'Wager outside allowed limits' });
    }

    const requiredLamports = Math.round(gameData.wager * LAMPORTS_PER_SOL);

    // 1. Verify transaction on Solana
    const conn = getSolanaConnection();
    let parsedTx: any = null;
    try {
      parsedTx = await conn.getParsedTransaction(txHash, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed',
      });
    } catch (rpcErr) {
      console.warn('Solana RPC getParsedTransaction failed:', rpcErr);
    }

    const minBlockTime = gameData.createdAt?.toMillis ? Math.floor(gameData.createdAt.toMillis() / 1000) - 300 : 0;
    const verification = verifyOnChainDeposit({
      parsedTx,
      requiredLamports,
      senderWallet,
      escrowPubkey: escrowKeypair.publicKey.toBase58(),
      minBlockTime,
    });

    if (!verification.valid) {
      return res.status(400).json({ error: verification.error });
    }

    // 2. Atomic Signature Deduplication & Game Update
    const sigRef = db.collection('escrow_signatures').doc(txHash);

    await db.runTransaction(async (t) => {
      const sigDoc = await t.get(sigRef);
      if (sigDoc.exists) {
        throw new Error('SIGNATURE_ALREADY_REGISTERED');
      }

      const currentGameDoc = await t.get(gameRef);
      if (!currentGameDoc.exists) {
        throw new Error('GAME_NOT_FOUND');
      }

      t.set(sigRef, {
        txHash,
        gameId,
        role,
        senderWallet,
        lamports: verification.transferredLamports,
        registeredAt: FieldValue.serverTimestamp(),
      });

      if (role === 'player1') {
        t.update(gameRef, {
          p1DepositTx: txHash,
          p1Wallet: senderWallet,
          escrowStatus: 'p1_funded',
          status: 'waiting',
          updatedAt: FieldValue.serverTimestamp(),
        });
      } else {
        const gameData = currentGameDoc.data() as any;
        const updates: any = {
          p2DepositTx: txHash,
          p2Wallet: senderWallet,
          escrowStatus: 'fully_funded',
          status: 'active',
          updatedAt: FieldValue.serverTimestamp(),
        };
        if (req.body.userId) {
          updates.player2 = req.body.userId;
          updates.players = [gameData.player1, req.body.userId];
        }
        if (req.body.username) updates.player2Name = req.body.username;
        if (req.body.avatarUrl) updates.player2Avatar = req.body.avatarUrl;
        if (!gameData.turn) {
          updates.turn = Math.random() > 0.5 ? gameData.player1 : (req.body.userId || senderWallet);
        }
        t.update(gameRef, updates);
      }
    });

    // 3. Emit Administrative History Log Event
    if (role === 'player1') {
      await logAdminHistory({
        eventType: 'deposit_p1',
        eventLabel: 'Host Escrow Deposit',
        gameId,
        userId: req.body.userId || senderWallet,
        username: req.body.username || gameData.player1Name || 'Host',
        walletAddress: senderWallet,
        role: 'player1',
        wager: gameData.wager,
        wagerCurrency: 'SOL',
        totalPot: gameData.wager * 2,
        amountSol: verification.transferredLamports / LAMPORTS_PER_SOL,
        txSignature: txHash,
        status: 'confirmed',
        metadata: { role: 'player1', transferredLamports: verification.transferredLamports },
      });
    } else {
      await logAdminHistory({
        eventType: 'deposit_p2',
        eventLabel: 'Opponent Escrow Deposit & Match Active',
        gameId,
        userId: req.body.userId || senderWallet,
        username: req.body.username || 'Player 2',
        walletAddress: senderWallet,
        role: 'player2',
        targetUserId: gameData.player1,
        targetUsername: gameData.player1Name || 'Host',
        targetWallet: gameData.p1Wallet || null,
        wager: gameData.wager,
        wagerCurrency: 'SOL',
        totalPot: gameData.wager * 2,
        amountSol: verification.transferredLamports / LAMPORTS_PER_SOL,
        txSignature: txHash,
        status: 'confirmed',
        metadata: { role: 'player2', transferredLamports: verification.transferredLamports },
      });
    }

    return res.json({
      success: true,
      escrowStatus: role === 'player1' ? 'p1_funded' : 'fully_funded',
      txHash,
    });
  } catch (err: any) {
    if (err?.message === 'SIGNATURE_ALREADY_REGISTERED') {
      return res.status(400).json({
        error: 'This Solana transaction signature has already been registered for another match.',
      });
    }
    if (err?.message === 'GAME_NOT_FOUND') {
      return res.status(404).json({ error: 'Game not found' });
    }
    console.error('Error verifying escrow deposit:', err);
    return res.status(500).json({ error: 'Internal server error during deposit verification' });
  }
});

async function settleGameInternal(gameId: string): Promise<any> {
  const db = getFirestore();
  const gameRef = db.collection('games').doc(gameId);
  const gameDoc = await gameRef.get();

  if (!gameDoc.exists) {
    return { status: 404, error: 'Game not found' };
  }

  const game = gameDoc.data() as any;

  if (game.status !== 'finished') {
    return { status: 400, error: 'Game is not finished yet' };
  }

  if (!game.wager || game.wager <= 0 || game.wagerCurrency === 'FREE') {
    return { status: 200, success: true, message: 'Free match, no payout needed' };
  }

  // Idempotency: prevent double payouts
  if (game.payoutTx || game.payoutStatus === 'completed' || game.payoutStatus === 'processing') {
    return {
      status: 200,
      success: true,
      payoutTx: game.payoutTx || 'processing',
      message: 'Payout already disbursed or currently processing',
    };
  }

  if (game.escrowStatus !== 'fully_funded') {
    return { status: 400, error: 'Match was not fully funded in escrow' };
  }

  // Validate game winner strictly
  if (game.winner !== game.player1 && game.winner !== game.player2 && game.winner !== 'draw') {
    return { status: 400, error: 'Invalid match winner' };
  }

  // Validate wager bounds
  if (typeof game.wager !== 'number' || !isFinite(game.wager) || game.wager < 0.001 || game.wager > 100.0) {
    return { status: 400, error: 'Invalid match wager amount' };
  }

  const conn = getSolanaConnection();
  const requiredLamports = Math.round(game.wager * LAMPORTS_PER_SOL);
  const escrowPubkeyStr = escrowKeypair.publicKey.toBase58();

  // Verify deposits on-chain
  if (game.p1DepositTx) {
    const p1Tx = await conn.getParsedTransaction(game.p1DepositTx, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
    const p1Verif = verifyOnChainDeposit({
      parsedTx: p1Tx,
      requiredLamports,
      senderWallet: game.p1Wallet,
      escrowPubkey: escrowPubkeyStr,
    });
    if (!p1Verif.valid) {
      return { status: 400, error: 'Deposit transactions could not be verified on-chain' };
    }
  } else {
    return { status: 400, error: 'Deposit transactions could not be verified on-chain' };
  }

  if (game.p2DepositTx) {
    const p2Tx = await conn.getParsedTransaction(game.p2DepositTx, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed',
    });
    const p2Verif = verifyOnChainDeposit({
      parsedTx: p2Tx,
      requiredLamports,
      senderWallet: game.p2Wallet,
      escrowPubkey: escrowPubkeyStr,
    });
    if (!p2Verif.valid) {
      return { status: 400, error: 'Deposit transactions could not be verified on-chain' };
    }
  } else {
    return { status: 400, error: 'Deposit transactions could not be verified on-chain' };
  }

  const totalPotLamports = Math.round(game.wager * 2 * LAMPORTS_PER_SOL);
  const houseFeeLamports = Math.round(totalPotLamports * (HOUSE_FEE_PERCENT / 100));
  const winnerPayoutLamports = totalPotLamports - houseFeeLamports;

  // Check Escrow Vault balance
  const vaultBalance = await conn.getBalance(escrowKeypair.publicKey);
  if (vaultBalance < totalPotLamports + 10000) {
    return { status: 500, error: 'Escrow vault has insufficient funds for disbursement' };
  }

  // Atomic transition to processing
  let canProceed = false;
  await db.runTransaction(async (t) => {
    const freshDoc = await t.get(gameRef);
    if (!freshDoc.exists) throw new Error('GAME_NOT_FOUND');
    const freshData = freshDoc.data() as any;
    if (freshData.payoutTx || freshData.payoutStatus === 'completed' || freshData.payoutStatus === 'processing') {
      return;
    }
    t.update(gameRef, {
      payoutStatus: 'processing',
      updatedAt: FieldValue.serverTimestamp(),
    });
    canProceed = true;
  });

  if (!canProceed) {
    const latestDoc = await gameRef.get();
    const latestData = latestDoc.data() as any;
    return {
      status: 200,
      success: true,
      payoutTx: latestData?.payoutTx || 'processing',
      message: 'Payout already disbursed or currently processing',
    };
  }

  // A. Handle Match Draw -> Refund Both Players
  if (game.winner === 'draw') {
    const p1WalletStr = game.p1Wallet;
    const p2WalletStr = game.p2Wallet;

    if (!p1WalletStr || !p2WalletStr) {
      return { status: 400, error: 'Missing player wallet addresses for draw refund' };
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
      payoutStatus: 'completed',
      payoutAmount: singleRefundLamports / LAMPORTS_PER_SOL,
      houseFeeAmount: 0,
      updatedAt: FieldValue.serverTimestamp(),
    });

    // Emit admin history for draw refund
    await logAdminHistory({
      eventType: 'draw_refunded',
      eventLabel: 'Match Draw 50/50 Refund',
      gameId,
      userId: game.player1,
      username: game.player1Name || 'Player 1',
      walletAddress: game.p1Wallet,
      targetUserId: game.player2,
      targetUsername: game.player2Name || 'Player 2',
      targetWallet: game.p2Wallet,
      wager: game.wager,
      wagerCurrency: 'SOL',
      totalPot: game.wager * 2,
      amountSol: (singleRefundLamports * 2) / LAMPORTS_PER_SOL,
      houseFeeSol: 0,
      txSignature: signature,
      status: 'confirmed',
      role: 'system',
      metadata: { winner: 'draw', refundPerPlayer: singleRefundLamports / LAMPORTS_PER_SOL },
    });

    return { status: 200, success: true, payoutTx: signature, result: 'draw_refunded' };
  }

  // B. Handle Winner Payout + House Rake
  const winnerWalletStr = game.winner === game.player1 ? game.p1Wallet : game.p2Wallet;

  if (!winnerWalletStr) {
    return { status: 400, error: 'Could not resolve winner wallet address' };
  }

  const winnerPubkey = new PublicKey(winnerWalletStr);
  const houseWallet = HOUSE_WALLET_ADDRESS && HOUSE_WALLET_ADDRESS.length >= 32 ? HOUSE_WALLET_ADDRESS : null;
  const housePubkey = houseWallet ? new PublicKey(houseWallet) : null;

  const tx = new Transaction().add(
    // 1. Transfer prize to winner
    SystemProgram.transfer({
      fromPubkey: escrowKeypair.publicKey,
      toPubkey: winnerPubkey,
      lamports: winnerPayoutLamports,
    })
  );

  // 2. Transfer house rake to treasury if > 0 and not transferring to self
  if (houseFeeLamports > 0 && housePubkey && houseWallet !== escrowKeypair.publicKey.toBase58()) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey: escrowKeypair.publicKey,
        toPubkey: housePubkey,
        lamports: houseFeeLamports,
      })
    );
  }

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

  // Emit admin history for winner payout
  await logAdminHistory({
    eventType: 'paid_out',
    eventLabel: 'Escrow Winner Payout',
    gameId,
    userId: game.winner,
    username: game.winner === game.player1 ? (game.player1Name || 'Player 1') : (game.player2Name || 'Player 2'),
    walletAddress: winnerWalletStr,
    targetUserId: game.winner === game.player1 ? game.player2 : game.player1,
    targetUsername: game.winner === game.player1 ? (game.player2Name || 'Player 2') : (game.player1Name || 'Player 1'),
    targetWallet: game.winner === game.player1 ? game.p2Wallet : game.p1Wallet,
    wager: game.wager,
    wagerCurrency: 'SOL',
    totalPot: game.wager * 2,
    amountSol: winnerPayoutLamports / LAMPORTS_PER_SOL,
    houseFeeSol: houseFeeLamports / LAMPORTS_PER_SOL,
    txSignature: signature,
    status: 'confirmed',
    role: 'system',
    metadata: {
      totalPot: game.wager * 2,
      winnerPayout: winnerPayoutLamports / LAMPORTS_PER_SOL,
      houseFee: houseFeeLamports / LAMPORTS_PER_SOL,
    },
  });

  return {
    status: 200,
    success: true,
    payoutTx: signature,
    winnerPayout: winnerPayoutLamports / LAMPORTS_PER_SOL,
    houseFee: houseFeeLamports / LAMPORTS_PER_SOL,
  };
}

// 3. Settle Match Payout to Winner & House Treasury
app.post('/api/escrow/settle', async (req, res) => {
  const { gameId } = req.body;

  if (!gameId) {
    return res.status(400).json({ error: 'Missing gameId' });
  }

  try {
    const result = await settleGameInternal(gameId);
    return res.status(result.status || 200).json(result);
  } catch (err: any) {
    console.error('Error settling match payout:', err);
    return res.status(500).json({ error: 'Internal server error during settlement' });
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

    // Idempotency: Anti-double-refund check
    if (game.refundTx || game.refundStatus === 'completed' || game.refundStatus === 'processing') {
      return res.json({
        success: true,
        refundTx: game.refundTx || 'processing',
        message: 'Refund already processed',
      });
    }

    if (game.status !== 'waiting') {
      return res.status(400).json({ error: 'Cannot cancel a match that is active or finished' });
    }

    const hasP1Deposit =
      game.wager > 0 &&
      (game.escrowStatus === 'p1_funded' ||
        game.escrowStatus === 'verifying_deposit' ||
        !!game.p1DepositTx ||
        !!req.body.txHash);

    if (hasP1Deposit) {
      const p1WalletStr = game.p1Wallet || req.body.walletAddress;
      const txHash = game.p1DepositTx || req.body.txHash;

      if (!p1WalletStr || !txHash) {
        // No deposit was broadcast or no wallet registered, safe to delete
        await logAdminHistory({
          eventType: 'cancelled',
          eventLabel: 'Match Cancelled & Room Closed',
          gameId,
          userId,
          username: game.player1Name || 'Host',
          walletAddress: null,
          role: 'player1',
          wager: game.wager || 0,
          wagerCurrency: game.wagerCurrency || 'SOL',
          totalPot: 0,
          amountSol: 0,
          status: 'confirmed',
          metadata: { reason: 'cancelled_unfunded_waiting_game' },
        });

        await gameRef.delete();
        return res.json({ success: true, message: 'Match deleted' });
      }

      const conn = getSolanaConnection();
      const requiredLamports = Math.round(game.wager * LAMPORTS_PER_SOL);
      const escrowPubkeyStr = escrowKeypair.publicKey.toBase58();

      // Verify on-chain deposit for p1
      let p1Tx: any = null;
      try {
        p1Tx = await conn.getParsedTransaction(txHash, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed',
        });
      } catch (rpcErr) {
        console.warn('RPC lookup failed during refund verify:', rpcErr);
      }

      const minBlockTime = game.createdAt?.toMillis ? Math.floor(game.createdAt.toMillis() / 1000) - 300 : 0;
      const p1Verif = verifyOnChainDeposit({
        parsedTx: p1Tx,
        requiredLamports,
        senderWallet: p1WalletStr,
        escrowPubkey: escrowPubkeyStr,
        minBlockTime,
      });

      if (!p1Verif.valid) {
        // If deposit was never sent/confirmed on chain, safe to delete/cancel without refund
        await logAdminHistory({
          eventType: 'cancelled',
          eventLabel: 'Unconfirmed Match Cancelled & Deleted',
          gameId,
          userId,
          username: game.player1Name || 'Host',
          walletAddress: p1WalletStr,
          role: 'player1',
          wager: game.wager || 0,
          wagerCurrency: game.wagerCurrency || 'SOL',
          totalPot: 0,
          amountSol: 0,
          status: 'confirmed',
          metadata: { reason: 'deposit_unconfirmed' },
        });

        await gameRef.delete();
        return res.json({ success: true, message: 'Unconfirmed match deleted' });
      }

      const refundLamports = Math.round(game.wager * LAMPORTS_PER_SOL);

      // Check Escrow Vault balance
      const vaultBalance = await conn.getBalance(escrowKeypair.publicKey);
      if (vaultBalance < refundLamports + 5000) {
        return res.status(500).json({ error: 'Escrow vault has insufficient funds for refund' });
      }

      // Atomic transition to processing & cancelling
      let canProceed = false;
      await db.runTransaction(async (t) => {
        const freshDoc = await t.get(gameRef);
        if (!freshDoc.exists) throw new Error('GAME_NOT_FOUND');
        const freshData = freshDoc.data() as any;
        if (freshData.refundTx || freshData.refundStatus === 'completed' || freshData.refundStatus === 'processing') {
          return;
        }
        t.update(gameRef, {
          refundStatus: 'processing',
          status: 'cancelling',
          p1DepositTx: txHash,
          p1Wallet: p1WalletStr,
          updatedAt: FieldValue.serverTimestamp(),
        });
        canProceed = true;
      });

      if (!canProceed) {
        const latestDoc = await gameRef.get();
        const latestData = latestDoc.data() as any;
        return res.json({
          success: true,
          refundTx: latestData?.refundTx || 'processing',
          message: 'Refund already processed',
        });
      }

      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: escrowKeypair.publicKey,
          toPubkey: new PublicKey(p1WalletStr),
          lamports: refundLamports,
        })
      );

      const { blockhash } = await conn.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
      tx.feePayer = escrowKeypair.publicKey;
      tx.sign(escrowKeypair);

      const encodeFn = (bs58 as any).encode || (bs58 as any).default?.encode;
      const signature = encodeFn(tx.signature!);

      const rawTx = tx.serialize();
      await conn.sendRawTransaction(rawTx, { skipPreflight: false });

      // Wait for confirmation
      const startTime = Date.now();
      while (Date.now() - startTime < 15000) {
        const response = await conn.getSignatureStatuses([signature]);
        const status = response?.value?.[0];
        if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      await gameRef.update({
        status: 'cancelled',
        refundTx: signature,
        refundStatus: 'completed',
        refundAmount: refundLamports / LAMPORTS_PER_SOL,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // Emit admin history for refunded cancellation
      await logAdminHistory({
        eventType: 'refunded',
        eventLabel: 'Match Cancelled & Host Refunded',
        gameId,
        userId,
        username: game.player1Name || 'Host',
        walletAddress: p1WalletStr,
        role: 'player1',
        wager: game.wager,
        wagerCurrency: 'SOL',
        totalPot: game.wager * 2,
        amountSol: refundLamports / LAMPORTS_PER_SOL,
        txSignature: signature,
        status: 'confirmed',
        metadata: { reason: 'host_cancelled_waiting_game', refundLamports },
      });

      return res.json({ success: true, refundTx: signature });
    }

    // Free game or unfunded game cancellation
    await logAdminHistory({
      eventType: 'cancelled',
      eventLabel: 'Match Cancelled & Room Closed',
      gameId,
      userId,
      username: game.player1Name || 'Host',
      walletAddress: game.p1Wallet || null,
      role: 'player1',
      wager: game.wager || 0,
      wagerCurrency: game.wagerCurrency || 'FREE',
      totalPot: 0,
      amountSol: 0,
      status: 'confirmed',
      metadata: { reason: 'cancelled_before_funding' },
    });

    await gameRef.delete();
    return res.json({ success: true, message: 'Match deleted' });
  } catch (err: any) {
    console.error('Error processing cancellation refund:', err);
    return res.status(500).json({ error: 'Internal server error during refund' });
  }
});

// 5. Lifecycle Event Ingestion & Tracking Endpoint
const LogEventSchema = z.object({
  eventType: z.enum([
    'created',
    'deposit_p1',
    'deposit_p2',
    'match_started',
    'resigned',
    'timeout_win',
    'game_finished',
    'paid_out',
    'refunded',
    'draw_refunded',
    'cancelled',
    'cron_recovery',
  ]),
  eventLabel: z.string().min(1).max(100).optional(),
  gameId: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
  username: z.string().max(100).optional(),
  walletAddress: z.string().max(100).nullable().optional(),
  role: z.enum(['player1', 'player2', 'system', 'admin']).optional(),
  targetUserId: z.string().max(128).nullable().optional(),
  targetUsername: z.string().max(100).nullable().optional(),
  targetWallet: z.string().max(100).nullable().optional(),
  wager: z.number().min(0).max(100).optional(),
  wagerCurrency: z.enum(['SOL', 'FREE']).optional(),
  totalPot: z.number().nullable().optional(),
  amountSol: z.number().nullable().optional(),
  houseFeeSol: z.number().nullable().optional(),
  txSignature: z.string().max(128).nullable().optional(),
  status: z.enum(['confirmed', 'processing', 'failed']).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
}).strict();

app.post('/api/admin/log-event', async (req, res) => {
  const parseResult = LogEventSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.issues });
  }

  const data = parseResult.data;
  const defaultLabels: Record<string, string> = {
    created: 'Match Room Created',
    deposit_p1: 'Host Escrow Deposit',
    deposit_p2: 'Opponent Escrow Deposit',
    match_started: 'Match Started',
    resigned: 'Player Forfeited Match',
    timeout_win: 'AFK Timeout Victory Claimed',
    game_finished: 'Match Concluded Normally',
    paid_out: 'Prize Disbursed to Winner',
    refunded: 'Host Deposit Refunded',
    draw_refunded: 'Match Draw 50/50 Refunded',
    cancelled: 'Match Room Cancelled',
    cron_recovery: 'Cron Reconciled Match',
  };

  const eventLabel = data.eventLabel || defaultLabels[data.eventType] || data.eventType;

  const result = await logAdminHistory({
    ...data,
    eventLabel,
  });

  if (!result) {
    return res.status(500).json({ error: 'Failed to record administrative history log' });
  }

  return res.json({ success: true, id: result.id, record: result });
});

// 6. Cron Job to Recover Pending Transactions
app.post('/api/cron/recover', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const db = getFirestore();
    const conn = getSolanaConnection();
    
    // Find games stuck in pending deposits
    const pendingDeposits = await db.collection('games').where('escrowStatus', 'in', ['verifying_deposit', 'verifying_p2']).get();
    
    for (const doc of pendingDeposits.docs) {
      const game = doc.data() as any;
      const isP1 = game.escrowStatus === 'verifying_deposit';
      const sig = isP1 ? game.p1DepositTx : game.p2DepositTx;
      
      if (sig) {
        try {
          const response = await conn.getSignatureStatuses([sig]);
          const status = response?.value?.[0];
          
          if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
            if (status.err) {
              await doc.ref.update({ escrowStatus: isP1 ? 'free' : 'p1_funded' });
              await logAdminHistory({
                eventType: 'cron_recovery',
                eventLabel: 'Cron Recovery: Deposit Failed',
                gameId: doc.id,
                userId: isP1 ? game.player1 : (game.player2 || 'unknown'),
                walletAddress: isP1 ? game.p1Wallet : game.p2Wallet,
                txSignature: sig,
                status: 'failed',
                metadata: { action: 'recover_deposit_err', isP1, err: status.err },
              });
            } else {
              await doc.ref.update({ 
                escrowStatus: isP1 ? 'p1_funded' : 'fully_funded',
                ...(isP1 ? {} : { status: 'active' })
              });
              await logAdminHistory({
                eventType: 'cron_recovery',
                eventLabel: 'Cron Recovery: Deposit Confirmed',
                gameId: doc.id,
                userId: isP1 ? game.player1 : (game.player2 || 'unknown'),
                walletAddress: isP1 ? game.p1Wallet : game.p2Wallet,
                txSignature: sig,
                status: 'confirmed',
                metadata: { action: 'recover_deposit_confirmed', isP1 },
              });
            }
          }
        } catch (e) {
           console.error('Error recovering deposit', e);
        }
      }
    }
    
    // Find games stuck in pending payouts
    const pendingPayouts = await db.collection('games').where('payoutStatus', '==', 'pending').get();
    for (const doc of pendingPayouts.docs) {
      const game = doc.data() as any;
      if (game.payoutTx) {
        try {
          const response = await conn.getSignatureStatuses([game.payoutTx]);
          const status = response?.value?.[0];
          
          if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
            await doc.ref.update({ payoutStatus: 'completed' });
            await logAdminHistory({
              eventType: 'cron_recovery',
              eventLabel: 'Cron Recovery: Payout Completed',
              gameId: doc.id,
              userId: game.winner || 'system',
              txSignature: game.payoutTx,
              status: 'confirmed',
              metadata: { action: 'recover_payout_completed' },
            });
          } else if (!status) {
            await doc.ref.update({ payoutStatus: 'failed' });
            await logAdminHistory({
              eventType: 'cron_recovery',
              eventLabel: 'Cron Recovery: Payout Marked Failed',
              gameId: doc.id,
              userId: game.winner || 'system',
              txSignature: game.payoutTx,
              status: 'failed',
              metadata: { action: 'recover_payout_failed' },
            });
          }
        } catch (e) {
           console.error('Error recovering payout', e);
        }
      }
    }

    // Find games stuck in pending refunds
    const pendingRefunds = await db.collection('games').where('refundStatus', '==', 'pending').get();
    for (const doc of pendingRefunds.docs) {
      const game = doc.data() as any;
      if (game.refundTx) {
        try {
          const response = await conn.getSignatureStatuses([game.refundTx]);
          const status = response?.value?.[0];
          
          if (status && (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized')) {
            await doc.ref.update({ refundStatus: 'completed' });
            await logAdminHistory({
              eventType: 'cron_recovery',
              eventLabel: 'Cron Recovery: Refund Completed',
              gameId: doc.id,
              userId: game.player1 || 'system',
              txSignature: game.refundTx,
              status: 'confirmed',
              metadata: { action: 'recover_refund_completed' },
            });
          } else if (!status) {
            await doc.ref.update({ refundStatus: 'failed' });
            await logAdminHistory({
              eventType: 'cron_recovery',
              eventLabel: 'Cron Recovery: Refund Marked Failed',
              gameId: doc.id,
              userId: game.player1 || 'system',
              txSignature: game.refundTx,
              status: 'failed',
              metadata: { action: 'recover_refund_failed' },
            });
          }
        } catch (e) {
           console.error('Error recovering refund', e);
        }
      }
    }

    // Auto-settle any finished games that have fully funded escrow but no payoutTx
    const unsettledFinished = await db.collection('games')
      .where('status', '==', 'finished')
      .where('escrowStatus', '==', 'fully_funded')
      .get();
      
    for (const doc of unsettledFinished.docs) {
      const g = doc.data() as any;
      if (!g.payoutTx && g.payoutStatus !== 'completed' && g.payoutStatus !== 'processing' && g.wager > 0 && g.wagerCurrency !== 'FREE') {
        try {
          await settleGameInternal(doc.id);
        } catch (e) {
          console.error(`Error in cron settling game ${doc.id}:`, e);
        }
      }
    }
    
    res.json({ success: true, message: 'Recovery complete' });
  } catch (err: any) {
    console.error('Error in cron job', err);
    res.status(500).json({ error: 'Internal server error during recovery' });
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

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.env.SKIP_SERVER_START) {
  startServer();
}
