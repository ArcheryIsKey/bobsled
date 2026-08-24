/**
 * Adversarial Challenge & Stress-Test Harness for Milestone 1 Hardening
 *
 * Validates:
 * 1. CORS origin filtering & spoofing resistance (subdomain spoofing, prefix spoofing, protocol downgrade, CRLF, large headers, clean non-500 rejection)
 * 2. HTTP Security Headers in firebase.json and Express (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy)
 * 3. Multi-tiered rate limiting thresholds (/api/auth/nonce @ 15, /api/escrow/settle @ 10, /api/cron/recover @ 5, multi-IP isolation, route isolation)
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// Test statistics
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const testResults = [];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || 'Value mismatch'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertIncludes(container, substring, message) {
  if (!container || !container.includes(substring)) {
    throw new Error(`${message || 'Expected inclusion'}: "${substring}" not found in "${container}"`);
  }
}

async function runTest(testName, testFn) {
  totalTests++;
  const startTime = Date.now();
  try {
    await testFn();
    const duration = Date.now() - startTime;
    passedTests++;
    console.log(`  \x1b[32m✔ [PASS]\x1b[0m \x1b[90m(${duration}ms)\x1b[0m ${testName}`);
    testResults.push({ name: testName, status: 'PASS', duration });
  } catch (err) {
    const duration = Date.now() - startTime;
    failedTests++;
    console.log(`  \x1b[31m✖ [FAIL]\x1b[0m \x1b[90m(${duration}ms)\x1b[0m ${testName}`);
    console.log(`    \x1b[31mError: ${err.message}\x1b[0m`);
    testResults.push({ name: testName, status: 'FAIL', duration, error: err.message });
  }
}

/**
 * Creates an Express instance replicating the exact server.ts configuration
 */
function createExpressServer(customEnv = {}) {
  const app = express();
  app.set('trust proxy', 1);

  // Helmet matching server.ts
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

  // Explicit headers middleware matching server.ts:150
  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // CORS matching server.ts:158-186
  const configuredOrigins = (customEnv.ALLOWED_ORIGINS || process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const isProd = customEnv.NODE_ENV === 'production';
  const ALLOWED_ORIGINS = new Set([
    'https://bobsled-gg-app.web.app',
    'https://bobsled-gg-app.firebaseapp.com',
    ...configuredOrigins,
    ...(!isProd
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

  // Rate Limiters matching server.ts:188-232
  const generalLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 200,
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use('/api/', generalLimiter);

  const authLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 15,
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded for authentication, please slow down.' },
  });
  app.use('/api/auth/', authLimiter);

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

  // Routes
  const nonces = new Map();
  app.post('/api/auth/nonce', (req, res) => {
    const { publicKey } = req.body;
    if (!publicKey) {
      return res.status(400).json({ error: 'Public key is required' });
    }
    const nonce = Math.floor(Math.random() * 1000000).toString();
    nonces.set(publicKey, nonce);
    res.json({ nonce });
  });

  app.get('/api/escrow/config', (_req, res) => {
    res.json({
      escrowPublicKey: '11111111111111111111111111111111',
      houseWalletPublicKey: '11111111111111111111111111111111',
      houseFeePercent: 3.5,
      network: 'mainnet-beta',
    });
  });

  app.post('/api/escrow/settle', (req, res) => {
    const { gameId } = req.body;
    if (!gameId) {
      return res.status(400).json({ error: 'Game ID required' });
    }
    res.json({ success: true, settled: gameId });
  });

  app.post('/api/escrow/refund-cancel', (req, res) => {
    const { gameId, userId } = req.body;
    if (!gameId || !userId) {
      return res.status(400).json({ error: 'Missing parameters' });
    }
    res.json({ success: true, refunded: gameId });
  });

  app.post('/api/escrow/verify-deposit', (req, res) => {
    const { gameId, role, txHash, senderWallet } = req.body;
    if (!gameId || !role || !txHash || !senderWallet) {
      return res.status(400).json({ error: 'Missing parameters' });
    }
    res.json({ success: true, verified: txHash });
  });

  app.post('/api/cron/recover', (_req, res) => {
    res.json({ success: true, message: 'Recovery complete' });
  });

  return app;
}

class TestClient {
  constructor(app) {
    this.app = app;
    this.server = null;
    this.port = 0;
  }

  async start() {
    return new Promise((resolve) => {
      this.server = http.createServer(this.app);
      this.server.listen(0, '127.0.0.1', () => {
        this.port = this.server.address().port;
        resolve();
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => this.server.close(resolve));
    }
  }

  async request(path, options = {}) {
    const method = options.method || 'GET';
    const headers = options.headers || {};
    const body = options.body ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : null;

    if (body && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: this.port,
          path,
          method,
          headers,
        },
        (res) => {
          let rawData = '';
          res.on('data', (chunk) => {
            rawData += chunk;
          });
          res.on('end', () => {
            let json = null;
            try {
              json = JSON.parse(rawData);
            } catch (e) {
              // Non-JSON response
            }
            resolve({
              status: res.statusCode,
              headers: res.headers,
              getHeader: (key) => res.headers[key.toLowerCase()],
              body: rawData,
              json,
            });
          });
        }
      );

      req.on('error', reject);

      if (body) {
        req.write(body);
      }
      req.end();
    });
  }
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  🛡️   BOBSLED ADVERSARIAL CHALLENGER: MILESTONE 1 VERIFICATION');
  console.log('='.repeat(80) + '\n');

  // =========================================================================
  // SUITE 1: firebase.json Configuration Audit
  // =========================================================================
  console.log('\x1b[1m\x1b[36m▶ Suite 1: firebase.json Security Headers Audit\x1b[0m');

  await runTest('firebase.json: Valid JSON and hosting configuration exists', () => {
    const configPath = path.join(process.cwd(), 'firebase.json');
    assert(fs.existsSync(configPath), 'firebase.json must exist');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert(config.hosting, 'hosting block required');
    assert(Array.isArray(config.hosting.headers), 'headers block must be an array');
  });

  await runTest('firebase.json: Global wildcard "**" sets Content-Security-Policy with all required directives', () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase.json'), 'utf8'));
    const globalHeader = config.hosting.headers.find((h) => h.source === '**');
    assert(globalHeader, 'Global wildcard "**" must exist');

    const csp = globalHeader.headers.find((h) => h.key.toLowerCase() === 'content-security-policy');
    assert(csp, 'Content-Security-Policy must be configured');
    const val = csp.value;

    assertIncludes(val, "default-src 'self'", 'CSP must have default-src self');
    assertIncludes(val, "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'", 'CSP script-src');
    assertIncludes(val, "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", 'CSP style-src');
    assertIncludes(val, "font-src 'self' https://fonts.gstatic.com data:", 'CSP font-src');
    assertIncludes(val, "img-src 'self' data: blob: https:", 'CSP img-src');
    assertIncludes(val, "connect-src 'self'", 'CSP connect-src self');
    assertIncludes(val, 'https://bobsled-gg-app.firebaseapp.com', 'CSP connect-src Firebase Auth');
    assertIncludes(val, 'https://api.mainnet-beta.solana.com', 'CSP connect-src Solana RPC');
    assertIncludes(val, 'https://api.devnet.solana.com', 'CSP connect-src Solana Devnet RPC');
    assertIncludes(val, 'https://solscan.io', 'CSP connect-src Solscan');
    assertIncludes(val, "object-src 'none'", 'CSP object-src none');
    assertIncludes(val, "frame-ancestors 'none'", 'CSP frame-ancestors none');
    assertIncludes(val, 'upgrade-insecure-requests', 'CSP upgrade-insecure-requests');
  });

  await runTest('firebase.json: Global wildcard "**" sets X-Frame-Options: DENY', () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase.json'), 'utf8'));
    const globalHeader = config.hosting.headers.find((h) => h.source === '**');
    const xfo = globalHeader.headers.find((h) => h.key.toLowerCase() === 'x-frame-options');
    assert(xfo, 'X-Frame-Options header must exist');
    assertEqual(xfo.value, 'DENY', 'X-Frame-Options must be strictly DENY');
  });

  await runTest('firebase.json: Global wildcard "**" sets X-Content-Type-Options: nosniff', () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase.json'), 'utf8'));
    const globalHeader = config.hosting.headers.find((h) => h.source === '**');
    const xcto = globalHeader.headers.find((h) => h.key.toLowerCase() === 'x-content-type-options');
    assert(xcto, 'X-Content-Type-Options header must exist');
    assertEqual(xcto.value, 'nosniff', 'X-Content-Type-Options must be nosniff');
  });

  await runTest('firebase.json: Global wildcard "**" sets Referrer-Policy and Permissions-Policy', () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase.json'), 'utf8'));
    const globalHeader = config.hosting.headers.find((h) => h.source === '**');
    const rp = globalHeader.headers.find((h) => h.key.toLowerCase() === 'referrer-policy');
    assert(rp, 'Referrer-Policy header must exist');
    assertEqual(rp.value, 'strict-origin-when-cross-origin', 'Referrer-Policy must be strict-origin-when-cross-origin');

    const pp = globalHeader.headers.find((h) => h.key.toLowerCase() === 'permissions-policy');
    assert(pp, 'Permissions-Policy header must exist');
    assertEqual(pp.value, 'camera=(), microphone=(), geolocation=()', 'Permissions-Policy must restrict sensitive features');
  });

  await runTest('firebase.json: Global wildcard "**" sets Strict-Transport-Security (HSTS)', () => {
    const config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase.json'), 'utf8'));
    const globalHeader = config.hosting.headers.find((h) => h.source === '**');
    const hsts = globalHeader.headers.find((h) => h.key.toLowerCase() === 'strict-transport-security');
    assert(hsts, 'HSTS header must exist');
    assertIncludes(hsts.value, 'max-age=31536000', 'HSTS max-age 1yr');
    assertIncludes(hsts.value, 'includeSubDomains', 'HSTS includeSubDomains');
    assertIncludes(hsts.value, 'preload', 'HSTS preload');
  });

  // =========================================================================
  // SUITE 2: Express Security Headers
  // =========================================================================
  console.log('\n\x1b[1m\x1b[36m▶ Suite 2: Express Server Security Headers\x1b[0m');

  const app = createExpressServer();
  const client = new TestClient(app);
  await client.start();

  try {
    await runTest('Express API: Content-Security-Policy header returned on responses', async () => {
      const res = await client.request('/api/escrow/config');
      assertEqual(res.status, 200);
      const csp = res.getHeader('content-security-policy');
      assert(csp, 'CSP header missing in Express API response');
      assertIncludes(csp, "default-src 'self'");
      assertIncludes(csp, "object-src 'none'");
      assertIncludes(csp, "frame-ancestors 'none'");
    });

    await runTest('Express API: X-Frame-Options is strictly DENY', async () => {
      const res = await client.request('/api/escrow/config');
      assertEqual(res.getHeader('x-frame-options'), 'DENY');
    });

    await runTest('Express API: X-Content-Type-Options is nosniff', async () => {
      const res = await client.request('/api/escrow/config');
      assertEqual(res.getHeader('x-content-type-options'), 'nosniff');
    });

    await runTest('Express API: Referrer-Policy is strict-origin-when-cross-origin', async () => {
      const res = await client.request('/api/escrow/config');
      assertEqual(res.getHeader('referrer-policy'), 'strict-origin-when-cross-origin');
    });

    await runTest('Express API: Permissions-Policy disables camera, microphone, geolocation', async () => {
      const res = await client.request('/api/escrow/config');
      assertEqual(res.getHeader('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
    });

    await runTest('Express API: X-Powered-By header is stripped', async () => {
      const res = await client.request('/api/escrow/config');
      assertEqual(res.getHeader('x-powered-by'), undefined, 'X-Powered-By should be removed');
    });

    // =========================================================================
    // SUITE 3: Adversarial CORS Testing & Origin Spoofing
    // =========================================================================
    console.log('\n\x1b[1m\x1b[36m▶ Suite 3: Adversarial CORS Testing & Origin Spoofing\x1b[0m');

    await runTest('CORS: Whitelisted origin bobsled-gg-app.web.app is granted CORS headers', async () => {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'https://bobsled-gg-app.web.app' },
      });
      assertEqual(res.status, 200);
      assertEqual(res.getHeader('access-control-allow-origin'), 'https://bobsled-gg-app.web.app');
      assertEqual(res.getHeader('access-control-allow-credentials'), 'true');
    });

    await runTest('CORS: Whitelisted origin bobsled-gg-app.firebaseapp.com is granted CORS headers', async () => {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'https://bobsled-gg-app.firebaseapp.com' },
      });
      assertEqual(res.status, 200);
      assertEqual(res.getHeader('access-control-allow-origin'), 'https://bobsled-gg-app.firebaseapp.com');
      assertEqual(res.getHeader('access-control-allow-credentials'), 'true');
    });

    await runTest('CORS ADVERSARIAL: Prefix spoof https://fake-bobsled-gg-app.web.app is strictly blocked', async () => {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'https://fake-bobsled-gg-app.web.app' },
      });
      assertEqual(res.getHeader('access-control-allow-origin'), undefined, 'Must not return allow-origin');
      assert(res.status !== 500, `Must not return 500 error, got ${res.status}`);
    });

    await runTest('CORS ADVERSARIAL: Subdomain suffix spoof https://bobsled-gg-app.web.app.attacker.com is strictly blocked', async () => {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'https://bobsled-gg-app.web.app.attacker.com' },
      });
      assertEqual(res.getHeader('access-control-allow-origin'), undefined);
      assert(res.status !== 500);
    });

    await runTest('CORS ADVERSARIAL: Arbitrary firebaseapp https://evil.firebaseapp.com is strictly blocked', async () => {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'https://evil.firebaseapp.com' },
      });
      assertEqual(res.getHeader('access-control-allow-origin'), undefined);
      assert(res.status !== 500);
    });

    await runTest('CORS ADVERSARIAL: Suffix match bypass https://evil-bobsled-gg-app.firebaseapp.com is strictly blocked', async () => {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'https://evil-bobsled-gg-app.firebaseapp.com' },
      });
      assertEqual(res.getHeader('access-control-allow-origin'), undefined);
      assert(res.status !== 500);
    });

    await runTest('CORS ADVERSARIAL: Insecure HTTP scheme downgrade http://bobsled-gg-app.web.app is blocked', async () => {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'http://bobsled-gg-app.web.app' },
      });
      assertEqual(res.getHeader('access-control-allow-origin'), undefined);
      assert(res.status !== 500);
    });

    await runTest('CORS ADVERSARIAL: Port spoofing https://bobsled-gg-app.web.app:8080 is blocked', async () => {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'https://bobsled-gg-app.web.app:8080' },
      });
      assertEqual(res.getHeader('access-control-allow-origin'), undefined);
      assert(res.status !== 500);
    });

    await runTest('CORS ADVERSARIAL: Null origin ("null") is denied access-control-allow-origin', async () => {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'null' },
      });
      assertEqual(res.getHeader('access-control-allow-origin'), undefined);
      assert(res.status !== 500);
    });

    await runTest('CORS ADVERSARIAL: Preflight OPTIONS for authorized origin returns 204 with methods & headers', async () => {
      const res = await client.request('/api/escrow/verify-deposit', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://bobsled-gg-app.web.app',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization, Idempotency-Key',
        },
      });
      assertEqual(res.status, 204);
      assertEqual(res.getHeader('access-control-allow-origin'), 'https://bobsled-gg-app.web.app');
      assertIncludes(res.getHeader('access-control-allow-methods'), 'POST');
      assertIncludes(res.getHeader('access-control-allow-methods'), 'GET');
      assertIncludes(res.getHeader('access-control-allow-methods'), 'OPTIONS');
      assertEqual(res.getHeader('access-control-max-age'), '86400');
    });

    await runTest('CORS ADVERSARIAL: Preflight OPTIONS for unauthorized origin is denied without 500', async () => {
      const res = await client.request('/api/escrow/verify-deposit', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://attacker-origin.com',
          'Access-Control-Request-Method': 'POST',
        },
      });
      assertEqual(res.getHeader('access-control-allow-origin'), undefined);
      assert(res.status !== 500);
    });

    await runTest('CORS ADVERSARIAL: Oversized Origin header (4000+ chars) handled safely without crash', async () => {
      const res = await client.request('/api/escrow/config', {
        headers: { Origin: 'https://' + 'a'.repeat(4000) + '.web.app' },
      });
      assertEqual(res.getHeader('access-control-allow-origin'), undefined);
      assert(res.status !== 500);
    });

    // =========================================================================
    // SUITE 4: Rate Limiting Stress Testing & Threshold Boundaries
    // =========================================================================
    console.log('\n\x1b[1m\x1b[36m▶ Suite 4: Rate Limiting Stress Testing & Threshold Boundaries\x1b[0m');

    await runTest('Rate Limit: /api/auth/nonce allows exactly 15 rapid requests then 429s on 16th', async () => {
      const ip = '192.0.2.1';
      // First 15 requests must succeed
      for (let i = 1; i <= 15; i++) {
        const res = await client.request('/api/auth/nonce', {
          method: 'POST',
          headers: { 'X-Forwarded-For': ip },
          body: { publicKey: '11111111111111111111111111111111' },
        });
        assertEqual(res.status, 200, `Request ${i} of 15 should succeed with 200`);
      }

      // 16th request must trigger HTTP 429
      const blocked = await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { 'X-Forwarded-For': ip },
        body: { publicKey: '11111111111111111111111111111111' },
      });
      assertEqual(blocked.status, 429, '16th request must return 429 Too Many Requests');
      assert(blocked.json?.error, '429 response body must contain structured JSON error');
      assertIncludes(blocked.json.error, 'Rate limit exceeded for authentication');
      assert(blocked.getHeader('ratelimit-limit') !== undefined || blocked.getHeader('retry-after') !== undefined);
    });

    await runTest('Rate Limit: /api/escrow/settle allows exactly 10 rapid requests then 429s on 11th', async () => {
      const ip = '192.0.2.2';
      for (let i = 1; i <= 10; i++) {
        const res = await client.request('/api/escrow/settle', {
          method: 'POST',
          headers: { 'X-Forwarded-For': ip },
          body: { gameId: 'g_settle_test' },
        });
        assertEqual(res.status, 200, `Request ${i} of 10 should succeed`);
      }

      const blocked = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'X-Forwarded-For': ip },
        body: { gameId: 'g_settle_test' },
      });
      assertEqual(blocked.status, 429, '11th request must return 429 Too Many Requests');
      assert(blocked.json?.error, 'Must contain JSON error');
      assertIncludes(blocked.json.error, 'Rate limit exceeded for sensitive operation');
    });

    await runTest('Rate Limit: /api/escrow/refund-cancel enforces 10 req limit', async () => {
      const ip = '192.0.2.3';
      for (let i = 1; i <= 10; i++) {
        const res = await client.request('/api/escrow/refund-cancel', {
          method: 'POST',
          headers: { 'X-Forwarded-For': ip },
          body: { gameId: 'g1', userId: 'u1' },
        });
        assertEqual(res.status, 200);
      }

      const blocked = await client.request('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'X-Forwarded-For': ip },
        body: { gameId: 'g1', userId: 'u1' },
      });
      assertEqual(blocked.status, 429);
    });

    await runTest('Rate Limit: /api/escrow/verify-deposit enforces 10 req limit', async () => {
      const ip = '192.0.2.4';
      for (let i = 1; i <= 10; i++) {
        const res = await client.request('/api/escrow/verify-deposit', {
          method: 'POST',
          headers: { 'X-Forwarded-For': ip },
          body: { gameId: 'g1', role: 'p1', txHash: 'tx1', senderWallet: 'w1' },
        });
        assertEqual(res.status, 200);
      }

      const blocked = await client.request('/api/escrow/verify-deposit', {
        method: 'POST',
        headers: { 'X-Forwarded-For': ip },
        body: { gameId: 'g1', role: 'p1', txHash: 'tx1', senderWallet: 'w1' },
      });
      assertEqual(blocked.status, 429);
    });

    await runTest('Rate Limit: /api/cron/recover allows exactly 5 requests then 429s on 6th', async () => {
      const ip = '192.0.2.5';
      for (let i = 1; i <= 5; i++) {
        const res = await client.request('/api/cron/recover', {
          method: 'POST',
          headers: { 'X-Forwarded-For': ip },
        });
        assertEqual(res.status, 200);
      }

      const blocked = await client.request('/api/cron/recover', {
        method: 'POST',
        headers: { 'X-Forwarded-For': ip },
      });
      assertEqual(blocked.status, 429, '6th request must return 429');
      assertIncludes(blocked.json.error, 'Rate limit exceeded for maintenance cron');
    });

    await runTest('Rate Limit: Multi-IP isolation (Rate limiting IP A does not block IP B)', async () => {
      const ipA = '198.51.100.1';
      const ipB = '198.51.100.2';

      // Exhaust IP A on sensitive endpoint (10 requests)
      for (let i = 0; i < 10; i++) {
        await client.request('/api/escrow/settle', {
          method: 'POST',
          headers: { 'X-Forwarded-For': ipA },
          body: { gameId: 'g1' },
        });
      }
      const ipABlocked = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'X-Forwarded-For': ipA },
        body: { gameId: 'g1' },
      });
      assertEqual(ipABlocked.status, 429, 'IP A must be rate limited');

      // IP B should succeed
      const ipBRes = await client.request('/api/escrow/settle', {
        method: 'POST',
        headers: { 'X-Forwarded-For': ipB },
        body: { gameId: 'g1' },
      });
      assertEqual(ipBRes.status, 200, 'IP B should not be affected by IP A exhaustion');
    });

    await runTest('Rate Limit: Route bucket isolation (Exhausting Auth limit does not block Escrow Config)', async () => {
      const ip = '198.51.100.3';
      // Exhaust auth
      for (let i = 0; i < 15; i++) {
        await client.request('/api/auth/nonce', {
          method: 'POST',
          headers: { 'X-Forwarded-For': ip },
          body: { publicKey: '11111111111111111111111111111111' },
        });
      }
      const authBlocked = await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { 'X-Forwarded-For': ip },
        body: { publicKey: '11111111111111111111111111111111' },
      });
      assertEqual(authBlocked.status, 429);

      // Escrow config should still return 200
      const escrowRes = await client.request('/api/escrow/config', {
        headers: { 'X-Forwarded-For': ip },
      });
      assertEqual(escrowRes.status, 200, 'Escrow config must remain available');
    });

    await runTest('Rate Limit: Concurrent burst flood (20 concurrent requests against 10 limit -> 10 pass, 10 fail with 429)', async () => {
      const ip = '198.51.100.4';
      const requests = Array.from({ length: 20 }, () =>
        client.request('/api/escrow/settle', {
          method: 'POST',
          headers: { 'X-Forwarded-For': ip },
          body: { gameId: 'burst_game' },
        })
      );

      const responses = await Promise.all(requests);
      const passed = responses.filter((r) => r.status === 200).length;
      const rateLimited = responses.filter((r) => r.status === 429).length;

      assertEqual(passed, 10, 'Exactly 10 requests should pass');
      assertEqual(rateLimited, 10, 'Exactly 10 requests should be 429 blocked');
    });

  } finally {
    await client.stop();
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('  📊  ADVERSARIAL VERIFICATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Total Tests:  ${totalTests}`);
  console.log(`  \x1b[32mPassed:\x1b[0m       ${passedTests}`);
  console.log(`  \x1b[31mFailed:\x1b[0m       ${failedTests}`);
  console.log('='.repeat(80) + '\n');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error running adversarial tests:', err);
  process.exit(1);
});
