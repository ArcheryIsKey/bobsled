/**
 * Mock Express Server Harness for Bobsled Security Testing
 * Configures Helmet, CORS, Rate Limiters, Zod validation, and Routes for end-to-end HTTP verification.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import http from 'node:http';
import { z } from 'zod';
import { MockSolanaHarness } from './mock-solana.mjs';
import { MockFirestore } from './mock-firestore.mjs';

// Define authoritative Zod Schemas
export const NonceRequestSchema = z.object({
  publicKey: z.string().min(32).max(44),
});

export const VerifyAuthRequestSchema = z.object({
  publicKey: z.string().min(32).max(44),
  signature: z.string().min(64).max(128),
});

export const BalanceQuerySchema = z.object({
  wallet: z.string().min(32).max(44),
});

export const SolanaRpcRequestSchema = z.object({
  jsonrpc: z.string().optional(),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().min(1).max(100),
  params: z.array(z.any()).optional(),
});

export const VerifyDepositRequestSchema = z.object({
  gameId: z.string().min(1).max(128),
  role: z.enum(['player1', 'player2']),
  txHash: z.string().min(64).max(128),
  senderWallet: z.string().min(32).max(44),
});

export const SettleRequestSchema = z.object({
  gameId: z.string().min(1).max(128),
});

export const RefundCancelRequestSchema = z.object({
  gameId: z.string().min(1).max(128),
  userId: z.string().min(1).max(128),
});

export const LogEventSchema = z.object({
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

export function createTestApp(options = {}) {
  const app = express();
  const solanaHarness = options.solanaHarness || new MockSolanaHarness();
  const db = options.db || new MockFirestore();

  const HOUSE_WALLET = '11111111111111111111111111111111';
  let rawHouseFee = options.houseFeePercent !== undefined ? options.houseFeePercent : 3.5;
  // Clamping house fee to [0%, 20%]
  const HOUSE_FEE_PERCENT = Math.min(Math.max(isNaN(rawHouseFee) ? 3.5 : rawHouseFee, 0.0), 20.0);

  // In-memory nonces
  const nonces = new Map();

  // 1. Helmet Security Headers
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "blob:", "https:"],
          connectSrc: [
            "'self'",
            "https://bobsled-gg-app.firebaseapp.com",
            "https://*.firebaseio.com",
            "wss://*.firebaseio.com",
            "https://*.googleapis.com",
            "https://identitytoolkit.googleapis.com",
            "https://securetoken.googleapis.com",
            "https://firestore.googleapis.com",
            "https://api.mainnet-beta.solana.com",
            "https://api.devnet.solana.com",
            "https://api.coinbase.com",
            "https://api.coingecko.com",
            "https://api.binance.com",
            "https://solscan.io",
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

  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // 2. Strict CORS Whitelist
  const ALLOWED_ORIGINS = new Set([
    'https://bobsled-gg-app.web.app',
    'https://bobsled-gg-app.firebaseapp.com',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
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

  app.set('trust proxy', 1);

  const ipKeyGenerator = (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || '127.0.0.1';
  };

  // 3. Multi-Tiered Rate Limiters
  const generalLimiter = rateLimit({
    windowMs: options.rateLimitWindows ? 1000 : 5 * 60 * 1000,
    max: options.generalMax !== undefined ? options.generalMax : 200,
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
    validate: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use('/api/', generalLimiter);

  const authLimiter = rateLimit({
    windowMs: options.rateLimitWindows ? 1000 : 60 * 1000,
    max: options.authMax !== undefined ? options.authMax : 15,
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
    validate: false,
    message: { error: 'Rate limit exceeded for authentication, please slow down.' },
  });
  app.use('/api/auth/', authLimiter);

  const sensitiveLimiter = rateLimit({
    windowMs: options.rateLimitWindows ? 1000 : 60 * 1000,
    max: options.escrowMax !== undefined ? options.escrowMax : 10,
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
    validate: false,
    message: { error: 'Rate limit exceeded for settlement operation, please slow down.' },
  });
  app.use('/api/escrow/settle', sensitiveLimiter);
  app.use('/api/escrow/refund-cancel', sensitiveLimiter);
  app.use('/api/escrow/verify-deposit', sensitiveLimiter);

  const cronLimiter = rateLimit({
    windowMs: options.rateLimitWindows ? 1000 : 60 * 1000,
    max: options.cronMax !== undefined ? options.cronMax : 5,
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: ipKeyGenerator,
    validate: false,
    message: { error: 'Rate limit exceeded for maintenance cron, please slow down.' },
  });
  app.use('/api/cron/', cronLimiter);

  app.use(express.json({ limit: '1mb' }));

  // Helper middleware for Zod validation
  const validateBody = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues || result.error.errors || [];
      return res.status(400).json({
        error: 'Invalid request payload',
        details: issues.map((e) => ({ path: Array.isArray(e.path) ? e.path.join('.') : String(e.path), message: e.message })),
      });
    }
    req.body = result.data;
    next();
  };

  const validateQuery = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const issues = result.error.issues || result.error.errors || [];
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: issues.map((e) => ({ path: Array.isArray(e.path) ? e.path.join('.') : String(e.path), message: e.message })),
      });
    }
    req.query = result.data;
    next();
  };

  // Helper for server-authoritative admin history logging in test app
  async function logAdminHistory(entry) {
    const solscanUrl = entry.txSignature
      ? `https://solscan.io/tx/${entry.txSignature}?cluster=devnet`
      : null;
    const docId = `hist_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      id: docId,
      timestamp: new Date().toISOString(),
      isoTimestamp: new Date().toISOString(),
      eventType: entry.eventType,
      eventLabel: entry.eventLabel || entry.eventType,
      status: entry.status || 'confirmed',
      gameId: entry.gameId,
      gameType: 'connect4',
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
      network: 'devnet',
      metadata: entry.metadata || {},
    };
    await db.doc(`admin_history/${docId}`).set(record);
    return record;
  }

  // 4. API Endpoints
  app.post('/api/auth/nonce', validateBody(NonceRequestSchema), (req, res) => {
    const { publicKey } = req.body;
    const nonce = Math.floor(Math.random() * 1000000).toString();
    nonces.set(publicKey, nonce);
    res.json({ nonce });
  });

  app.post('/api/auth/verify', validateBody(VerifyAuthRequestSchema), async (req, res) => {
    const { publicKey, signature } = req.body;
    const nonce = nonces.get(publicKey);
    if (!nonce) {
      return res.status(400).json({ error: 'Nonce not found or expired' });
    }
    nonces.delete(publicKey);
    res.json({ success: true, token: `mock_jwt_token_${publicKey}` });
  });

  app.get('/api/solana/balance', validateQuery(BalanceQuerySchema), (req, res) => {
    const { wallet } = req.query;
    res.json({ success: true, sol: 5.5, lamports: 5500000000, wallet });
  });

  app.post('/api/solana/rpc', validateBody(SolanaRpcRequestSchema), (req, res) => {
    const { method, id } = req.body;
    res.json({ jsonrpc: '2.0', result: { value: 123 }, id: id || 1 });
  });

  app.get('/api/escrow/config', (req, res) => {
    res.json({
      escrowPublicKey: solanaHarness.escrowKeypair.publicKey.toBase58(),
      houseWalletPublicKey: HOUSE_WALLET,
      houseFeePercent: HOUSE_FEE_PERCENT,
      network: 'devnet',
    });
  });

  app.post('/api/escrow/verify-deposit', validateBody(VerifyDepositRequestSchema), async (req, res) => {
    const { gameId, role, txHash, senderWallet } = req.body;

    try {
      // 1. Transactional Signature Deduplication Check
      const sigRef = db.doc(`escrow_signatures/${txHash}`);
      const sigDoc = await sigRef.get();
      if (sigDoc.exists) {
        return res.status(400).json({
          error: 'This Solana transaction signature has already been registered for another match.',
        });
      }

      const gameRef = db.doc(`games/${gameId}`);
      const gameDoc = await gameRef.get();
      if (!gameDoc.exists) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const gameData = gameDoc.data();
      const requiredLamports = Math.round((gameData.wager || 0) * 1e9);

      if (requiredLamports <= 0) {
        return res.status(400).json({ error: 'This match does not require a SOL stake' });
      }

      // 2. On-Chain Deposit Verification
      const parsedTx = solanaHarness.getParsedTransaction(txHash);
      const verification = solanaHarness.verifyOnChainDeposit({
        parsedTx,
        requiredLamports,
        senderWallet,
        escrowPubkey: solanaHarness.escrowKeypair.publicKey.toBase58(),
      });

      if (!verification.valid) {
        return res.status(400).json({ error: verification.error });
      }

      // Atomically register signature and update game
      await db.runTransaction(async (t) => {
        await sigRef.set({
          txHash,
          gameId,
          role,
          senderWallet,
          registeredAt: new Date().toISOString(),
        });

        if (role === 'player1') {
          await gameRef.update({
            p1DepositTx: txHash,
            p1Wallet: senderWallet,
            escrowStatus: 'p1_funded',
            status: 'waiting',
          });
        } else {
          await gameRef.update({
            p2DepositTx: txHash,
            p2Wallet: senderWallet,
            escrowStatus: 'fully_funded',
            status: 'active',
          });
        }
      });

      // Log admin history for deposit event
      await logAdminHistory({
        eventType: role === 'player1' ? 'deposit_p1' : 'deposit_p2',
        eventLabel: role === 'player1' ? 'Host Escrow Deposit' : 'Opponent Escrow Deposit',
        gameId,
        userId: senderWallet,
        walletAddress: senderWallet,
        role,
        wager: gameData.wager,
        wagerCurrency: gameData.wagerCurrency || 'SOL',
        amountSol: gameData.wager,
        txSignature: txHash,
      });

      return res.json({
        success: true,
        escrowStatus: role === 'player1' ? 'p1_funded' : 'fully_funded',
        txHash,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error during deposit verification' });
    }
  });

  app.post('/api/escrow/settle', validateBody(SettleRequestSchema), async (req, res) => {
    const { gameId } = req.body;

    try {
      const gameRef = db.doc(`games/${gameId}`);
      const gameDoc = await gameRef.get();
      if (!gameDoc.exists) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const game = gameDoc.data();
      if (game.status !== 'finished') {
        return res.status(400).json({ error: 'Game is not finished yet' });
      }

      if (!game.wager || game.wager <= 0 || game.wagerCurrency === 'FREE') {
        return res.json({ success: true, message: 'Free match, no payout needed' });
      }

      // Anti-double-settlement: Idempotency check
      if (game.payoutTx || game.payoutStatus === 'completed' || game.payoutStatus === 'processing') {
        return res.json({
          success: true,
          payoutTx: game.payoutTx || 'processing',
          message: 'Payout already disbursed or currently processing',
        });
      }

      if (game.escrowStatus !== 'fully_funded') {
        return res.status(400).json({ error: 'Match was not fully funded in escrow' });
      }

      // Validate game winner
      if (game.winner !== game.player1 && game.winner !== game.player2 && game.winner !== 'draw') {
        return res.status(400).json({ error: 'Invalid match winner' });
      }

      // Atomic transition to processing
      await gameRef.update({ payoutStatus: 'processing' });

      // Handle Draw 50/50 refund with 0% fee
      if (game.winner === 'draw') {
        const totalPotSol = (game.wager || 0) * 2;
        const refundTx1 = `draw_p1_refund_sig_${Math.random().toString(36).slice(2)}`;
        const refundTx2 = `draw_p2_refund_sig_${Math.random().toString(36).slice(2)}`;

        await gameRef.update({
          payoutTx: refundTx1,
          payoutStatus: 'completed',
          payoutAmount: totalPotSol,
          houseFeeAmount: 0,
        });

        await logAdminHistory({
          eventType: 'draw_refunded',
          eventLabel: 'Match Draw 50/50 Refund',
          gameId,
          userId: 'system',
          role: 'system',
          wager: game.wager,
          totalPot: totalPotSol,
          amountSol: totalPotSol,
          houseFeeSol: 0,
          txSignature: refundTx1,
          metadata: { refundP1: refundTx1, refundP2: refundTx2, winner: 'draw' },
        });

        return res.json({
          success: true,
          payoutTx: refundTx1,
          refundP1Tx: refundTx1,
          refundP2Tx: refundTx2,
          winnerPayout: totalPotSol / 2,
          houseFee: 0,
        });
      }

      // Calculate standard winner payout
      const totalPotLamports = Math.round(game.wager * 2 * 1e9);
      const houseFeeLamports = Math.round(totalPotLamports * (HOUSE_FEE_PERCENT / 100));
      const winnerPayoutLamports = totalPotLamports - houseFeeLamports;

      const payoutSignature = `payout_sig_${Math.random().toString(36).slice(2)}`;

      await gameRef.update({
        payoutTx: payoutSignature,
        payoutStatus: 'completed',
        payoutAmount: winnerPayoutLamports / 1e9,
        houseFeeAmount: houseFeeLamports / 1e9,
      });

      await logAdminHistory({
        eventType: 'paid_out',
        eventLabel: 'Escrow Winner Payout',
        gameId,
        userId: game.winner,
        walletAddress: game.winner === game.player1 ? game.p1Wallet : game.p2Wallet,
        role: game.winner === game.player1 ? 'player1' : 'player2',
        wager: game.wager,
        totalPot: game.wager * 2,
        amountSol: winnerPayoutLamports / 1e9,
        houseFeeSol: houseFeeLamports / 1e9,
        txSignature: payoutSignature,
        metadata: { winner: game.winner },
      });

      return res.json({
        success: true,
        payoutTx: payoutSignature,
        winnerPayout: winnerPayoutLamports / 1e9,
        houseFee: houseFeeLamports / 1e9,
      });
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error during settlement' });
    }
  });

  app.post('/api/escrow/refund-cancel', validateBody(RefundCancelRequestSchema), async (req, res) => {
    const { gameId, userId } = req.body;

    try {
      const gameRef = db.doc(`games/${gameId}`);
      const gameDoc = await gameRef.get();
      if (!gameDoc.exists) {
        return res.status(404).json({ error: 'Game not found' });
      }

      const game = gameDoc.data();
      if (game.player1 !== userId) {
        return res.status(403).json({ error: 'Only the host can cancel and claim a refund' });
      }

      // Anti-double-refund
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

      if (game.wager > 0 && game.escrowStatus === 'p1_funded') {
        await gameRef.update({ refundStatus: 'processing' });
        const refundSignature = `refund_sig_${Math.random().toString(36).slice(2)}`;

        await gameRef.update({
          status: 'cancelled',
          refundTx: refundSignature,
          refundStatus: 'completed',
        });

        await logAdminHistory({
          eventType: 'refunded',
          eventLabel: 'Match Cancelled & Host Refunded',
          gameId,
          userId,
          walletAddress: game.p1Wallet || null,
          role: 'player1',
          wager: game.wager,
          amountSol: game.wager,
          txSignature: refundSignature,
        });

        return res.json({ success: true, refundTx: refundSignature });
      }

      await logAdminHistory({
        eventType: 'cancelled',
        eventLabel: 'Match Cancelled & Room Closed',
        gameId,
        userId,
        role: 'player1',
        wager: game.wager || 0,
        amountSol: 0,
      });

      await gameRef.delete();
      return res.json({ success: true, message: 'Match deleted' });
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error during refund' });
    }
  });

  app.post('/api/admin/log-event', validateBody(LogEventSchema), async (req, res) => {
    try {
      const data = req.body;
      const defaultLabels = {
        created: 'Match Room Created',
        deposit_p1: 'Host Escrow Deposit',
        deposit_p2: 'Opponent Escrow Deposit',
        match_started: 'Match Started',
        resigned: 'Player Forfeited Match',
        timeout_win: 'AFK Timeout Victory Claimed',
        game_finished: 'Match Concluded Normally',
        paid_out: 'Escrow Winner Payout',
        refunded: 'Match Cancelled & Host Refunded',
        draw_refunded: 'Match Draw 50/50 Refund',
        cancelled: 'Match Cancelled & Room Closed',
        cron_recovery: 'Cron Reconciled Match',
      };

      const eventLabel = data.eventLabel || defaultLabels[data.eventType] || data.eventType;
      const record = await logAdminHistory({
        ...data,
        eventLabel,
      });

      return res.json({ success: true, id: record.id, record });
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error logging event' });
    }
  });

  app.post('/api/cron/recover', async (req, res) => {
    if (options.cronSecret || process.env.CRON_SECRET) {
      const expectedSecret = options.cronSecret || process.env.CRON_SECRET;
      const authHeader = req.headers.authorization;
      if (authHeader !== `Bearer ${expectedSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }

    let processed = 0;
    let settled = 0;
    let refunded = 0;

    const gamesCol = db._getCol('games');
    for (const [gameId, gameData] of gamesCol.entries()) {
      if (gameData.escrowStatus === 'verifying_deposit' && gameData.p1DepositTx) {
        gameData.escrowStatus = 'p1_funded';
        processed++;
        await logAdminHistory({
          eventType: 'cron_recovery',
          eventLabel: 'Cron Reconciled Match',
          gameId,
          userId: gameData.player1 || 'system',
          status: 'confirmed',
          metadata: { action: 'recovered_p1_deposit' },
        });
      }
    }

    res.json({ success: true, processed, settled, refunded });
  });

  // Catch-all error handler for Express body-parser SyntaxErrors and PayloadTooLargeErrors
  app.use((err, _req, res, next) => {
    if (err instanceof SyntaxError && (err.status === 400 || err.statusCode === 400) && 'body' in err) {
      return res.status(400).json({ error: 'Malformed JSON payload' });
    }
    if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
      return res.status(413).json({ error: 'Payload entity too large' });
    }
    return res.status(err.status || err.statusCode || 500).json({ error: err.message || 'Internal Server Error' });
  });

  return { app, solanaHarness, db };
}

/**
 * Ephemeral HTTP Test Client using native node http & fetch
 */
export class HttpTestClient {
  constructor(app) {
    this.app = app;
    this.server = null;
    this.baseUrl = null;
    this.startPromise = null;
  }

  async start() {
    if (this.startPromise) return this.startPromise;
    this.startPromise = new Promise((resolve) => {
      this.server = http.createServer(this.app);
      this.server.listen(0, '127.0.0.1', () => {
        const port = this.server.address().port;
        this.baseUrl = `http://127.0.0.1:${port}`;
        resolve(this.baseUrl);
      });
    });
    return this.startPromise;
  }

  async close() {
    if (this.server) {
      return new Promise((resolve) => this.server.close(resolve));
    }
  }

  async request(path, options = {}) {
    await this.start();
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body !== undefined ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
    });

    let json = null;
    let text = null;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      json = await res.json().catch(() => null);
    } else {
      text = await res.text().catch(() => '');
    }

    return {
      status: res.status,
      headers: res.headers,
      getHeader: (name) => res.headers.get(name.toLowerCase()),
      json,
      text,
    };
  }
}
