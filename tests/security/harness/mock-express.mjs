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
      return res.status(400).json({
        error: 'Invalid request payload',
        details: result.error.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
      });
    }
    req.body = result.data;
    next();
  };

  const validateQuery = (schema) => (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        details: result.error.errors.map((e) => ({ path: e.path.join('.'), message: e.message })),
      });
    }
    req.query = result.data;
    next();
  };

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

      // Calculate payouts
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

        return res.json({ success: true, refundTx: refundSignature });
      }

      await gameRef.delete();
      return res.json({ success: true, message: 'Match deleted' });
    } catch (err) {
      return res.status(500).json({ error: 'Internal server error during refund' });
    }
  });

  app.post('/api/cron/recover', (req, res) => {
    res.json({ success: true, processed: 0, settled: 0, refunded: 0 });
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
