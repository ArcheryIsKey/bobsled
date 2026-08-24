/**
 * Milestone 1 Adversarial Challenge Test Suite
 * Executed by teamwork_preview_challenger_m1_2
 * Empirical verification of Rate Limiters, Proxy Trust, Standard Headers, CSP & CORS.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';

// Test assertion helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}
assert.ok = assert;

assert.equal = (actual, expected, msg) => {
  if (actual !== expected) {
    throw new Error(`${msg || 'Equality assertion failed'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

assert.includes = (str, substr, msg) => {
  if (typeof str !== 'string' || !str.includes(substr)) {
    throw new Error(`${msg || 'String inclusion failed'}: expected "${str}" to include "${substr}"`);
  }
};

assert.doesNotInclude = (str, substr, msg) => {
  if (typeof str === 'string' && str.includes(substr)) {
    throw new Error(`${msg || 'String non-inclusion failed'}: expected "${str}" NOT to include "${substr}"`);
  }
};

// Create an express app matching server.ts exactly
function createM1ServerApp(options = {}) {
  const app = express();

  // Trust reverse proxy for Cloud Run (1 hop)
  app.set('trust proxy', options.trustProxy !== undefined ? options.trustProxy : 1);

  // Helmet Security Headers
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

  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Restricted CORS Configuration
  const configuredOrigins = (options.allowedOrigins || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ALLOWED_ORIGINS = new Set([
    'https://bobsled-gg-app.web.app',
    'https://bobsled-gg-app.firebaseapp.com',
    ...configuredOrigins,
    ...(options.isProd ? [] : ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000', 'http://127.0.0.1:5173']),
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

  // 1. General Rate Limiter (200 req / 5 min default or customized for test)
  const generalLimiter = rateLimit({
    windowMs: options.windowMs || (5 * 60 * 1000),
    max: options.generalMax !== undefined ? options.generalMax : 200,
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  app.use('/api/', generalLimiter);

  // 2. Auth Limiter (15 req / 1 min default or customized for test)
  const authLimiter = rateLimit({
    windowMs: options.windowMs || (60 * 1000),
    max: options.authMax !== undefined ? options.authMax : 15,
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded for authentication, please slow down.' },
  });
  app.use('/api/auth/', authLimiter);

  // 3. Sensitive Settlement & Escrow Limiter (10 req / 1 min default or customized for test)
  const settlementLimiter = rateLimit({
    windowMs: options.windowMs || (60 * 1000),
    max: options.escrowMax !== undefined ? options.escrowMax : 10,
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded for sensitive operation, please slow down.' },
  });
  app.use('/api/escrow/settle', settlementLimiter);
  app.use('/api/escrow/refund-cancel', settlementLimiter);
  app.use('/api/escrow/verify-deposit', settlementLimiter);

  // 4. Cron Recovery Limiter (5 req / 1 min default or customized for test)
  const cronLimiter = rateLimit({
    windowMs: options.windowMs || (60 * 1000),
    max: options.cronMax !== undefined ? options.cronMax : 5,
    statusCode: 429,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit exceeded for maintenance cron, please slow down.' },
  });
  app.use('/api/cron/', cronLimiter);

  app.use(express.json());

  // Test endpoints matching server.ts signatures
  app.get('/api/escrow/config', (req, res) => {
    res.json({ success: true, clientIp: req.ip });
  });

  app.post('/api/auth/nonce', (req, res) => {
    res.json({ nonce: '123456', clientIp: req.ip });
  });

  app.post('/api/auth/verify', (req, res) => {
    res.json({ success: true, token: 'mock_token', clientIp: req.ip });
  });

  app.post('/api/escrow/settle', (req, res) => {
    res.json({ success: true, payoutTx: 'mock_tx_settle', clientIp: req.ip });
  });

  app.post('/api/escrow/refund-cancel', (req, res) => {
    res.json({ success: true, refundTx: 'mock_tx_refund', clientIp: req.ip });
  });

  app.post('/api/escrow/verify-deposit', (req, res) => {
    res.json({ success: true, escrowStatus: 'p1_funded', clientIp: req.ip });
  });

  app.post('/api/cron/recover', (req, res) => {
    res.json({ success: true, message: 'Recovery complete', clientIp: req.ip });
  });

  app.get('/api/solana/balance', (req, res) => {
    res.json({ success: true, balance: 1.5, clientIp: req.ip });
  });

  return app;
}

class TestClient {
  constructor(app) {
    this.app = app;
    this.server = null;
    this.baseUrl = null;
  }

  async start() {
    return new Promise((resolve) => {
      this.server = http.createServer(this.app);
      this.server.listen(0, '127.0.0.1', () => {
        const port = this.server.address().port;
        this.baseUrl = `http://127.0.0.1:${port}`;
        resolve(this.baseUrl);
      });
    });
  }

  async close() {
    if (this.server) {
      return new Promise((resolve) => this.server.close(resolve));
    }
  }

  async request(path, options = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body !== undefined ? (typeof options.body === 'string' ? options.body : JSON.stringify(options.body)) : undefined,
    });

    const contentType = res.headers.get('content-type') || '';
    let json = null;
    let text = null;
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

async function runAdversarialTestSuite() {
  console.log('\n================================================================');
  console.log('  ⚔️  CHALLENGER M1 ADVERSARIAL STRESS TEST SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  \x1b[32m✔ [PASS]\x1b[0m ${name}`);
      passed++;
    } catch (err) {
      console.log(`  \x1b[31m✖ [FAIL]\x1b[0m ${name}`);
      console.log(`    \x1b[31mError: ${err.message}\x1b[0m`);
      failed++;
    }
  }

  // -------------------------------------------------------------
  // TEST GROUP 1: Rate Limiter Status 429 and JSON Error Format Across ALL Tiers
  // -------------------------------------------------------------
  console.log('▶ GROUP 1: Rate Limiter Status 429 & JSON Error Response Format Across All Tiers');

  await test('1.1: General API limiter returns 429 and expected JSON error on /api/escrow/config', async () => {
    const app = createM1ServerApp({ generalMax: 3, windowMs: 5000 });
    const client = new TestClient(app);
    await client.start();
    try {
      for (let i = 0; i < 3; i++) {
        const res = await client.request('/api/escrow/config');
        assert.equal(res.status, 200, `Request ${i + 1} should succeed`);
      }
      const blocked = await client.request('/api/escrow/config');
      assert.equal(blocked.status, 429, '4th request must return 429');
      assert(blocked.json !== null, 'Response body must be JSON');
      assert.equal(blocked.json.error, 'Too many requests, please try again later.', 'JSON error message must match general limiter message');
    } finally {
      await client.close();
    }
  });

  await test('1.2: Auth limiter returns 429 and expected JSON error on /api/auth/nonce', async () => {
    const app = createM1ServerApp({ authMax: 2, windowMs: 5000 });
    const client = new TestClient(app);
    await client.start();
    try {
      for (let i = 0; i < 2; i++) {
        const res = await client.request('/api/auth/nonce', { method: 'POST' });
        assert.equal(res.status, 200);
      }
      const blocked = await client.request('/api/auth/nonce', { method: 'POST' });
      assert.equal(blocked.status, 429);
      assert(blocked.json !== null, 'Response body must be JSON');
      assert.equal(blocked.json.error, 'Rate limit exceeded for authentication, please slow down.');
    } finally {
      await client.close();
    }
  });

  await test('1.3: Auth limiter returns 429 and expected JSON error on /api/auth/verify', async () => {
    const app = createM1ServerApp({ authMax: 2, windowMs: 5000 });
    const client = new TestClient(app);
    await client.start();
    try {
      for (let i = 0; i < 2; i++) {
        const res = await client.request('/api/auth/verify', { method: 'POST' });
        assert.equal(res.status, 200);
      }
      const blocked = await client.request('/api/auth/verify', { method: 'POST' });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.json.error, 'Rate limit exceeded for authentication, please slow down.');
    } finally {
      await client.close();
    }
  });

  await test('1.4: Sensitive Escrow limiter returns 429 and expected JSON error on /api/escrow/settle', async () => {
    const app = createM1ServerApp({ escrowMax: 2, windowMs: 5000 });
    const client = new TestClient(app);
    await client.start();
    try {
      for (let i = 0; i < 2; i++) {
        const res = await client.request('/api/escrow/settle', { method: 'POST' });
        assert.equal(res.status, 200);
      }
      const blocked = await client.request('/api/escrow/settle', { method: 'POST' });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.json.error, 'Rate limit exceeded for sensitive operation, please slow down.');
    } finally {
      await client.close();
    }
  });

  await test('1.5: Sensitive Escrow limiter returns 429 and expected JSON error on /api/escrow/refund-cancel', async () => {
    const app = createM1ServerApp({ escrowMax: 2, windowMs: 5000 });
    const client = new TestClient(app);
    await client.start();
    try {
      for (let i = 0; i < 2; i++) {
        const res = await client.request('/api/escrow/refund-cancel', { method: 'POST' });
        assert.equal(res.status, 200);
      }
      const blocked = await client.request('/api/escrow/refund-cancel', { method: 'POST' });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.json.error, 'Rate limit exceeded for sensitive operation, please slow down.');
    } finally {
      await client.close();
    }
  });

  await test('1.6: Sensitive Escrow limiter returns 429 and expected JSON error on /api/escrow/verify-deposit', async () => {
    const app = createM1ServerApp({ escrowMax: 2, windowMs: 5000 });
    const client = new TestClient(app);
    await client.start();
    try {
      for (let i = 0; i < 2; i++) {
        const res = await client.request('/api/escrow/verify-deposit', { method: 'POST' });
        assert.equal(res.status, 200);
      }
      const blocked = await client.request('/api/escrow/verify-deposit', { method: 'POST' });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.json.error, 'Rate limit exceeded for sensitive operation, please slow down.');
    } finally {
      await client.close();
    }
  });

  await test('1.7: Maintenance Cron limiter returns 429 and expected JSON error on /api/cron/recover', async () => {
    const app = createM1ServerApp({ cronMax: 2, windowMs: 5000 });
    const client = new TestClient(app);
    await client.start();
    try {
      for (let i = 0; i < 2; i++) {
        const res = await client.request('/api/cron/recover', { method: 'POST' });
        assert.equal(res.status, 200);
      }
      const blocked = await client.request('/api/cron/recover', { method: 'POST' });
      assert.equal(blocked.status, 429);
      assert.equal(blocked.json.error, 'Rate limit exceeded for maintenance cron, please slow down.');
    } finally {
      await client.close();
    }
  });

  // -------------------------------------------------------------
  // TEST GROUP 2: Rate Limit Standard Headers (RateLimit-* & Retry-After)
  // -------------------------------------------------------------
  console.log('\n▶ GROUP 2: Rate Limit Standard Headers (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After)');

  await test('2.1: Standard RateLimit headers present and decrement monotonically on success', async () => {
    const app = createM1ServerApp({ authMax: 5, windowMs: 60000 });
    const client = new TestClient(app);
    await client.start();
    try {
      const res1 = await client.request('/api/auth/nonce', { method: 'POST' });
      assert.equal(res1.status, 200);
      const limit1 = res1.getHeader('ratelimit-limit');
      const remaining1 = res1.getHeader('ratelimit-remaining');
      const reset1 = res1.getHeader('ratelimit-reset');

      assert(limit1 !== null, 'RateLimit-Limit header must be present');
      assert(remaining1 !== null, 'RateLimit-Remaining header must be present');
      assert(reset1 !== null, 'RateLimit-Reset header must be present');

      assert.equal(limit1, '5', 'RateLimit-Limit must match authMax');
      assert.equal(remaining1, '4', 'RateLimit-Remaining must be 4 after first request');

      const res2 = await client.request('/api/auth/nonce', { method: 'POST' });
      assert.equal(res2.getHeader('ratelimit-remaining'), '3', 'RateLimit-Remaining must decrement to 3');

      // Verify legacy X-RateLimit headers are NOT enabled (legacyHeaders: false)
      assert.equal(res2.getHeader('x-ratelimit-limit'), null, 'Legacy X-RateLimit-Limit should not be set');
      assert.equal(res2.getHeader('x-ratelimit-remaining'), null, 'Legacy X-RateLimit-Remaining should not be set');
    } finally {
      await client.close();
    }
  });

  await test('2.2: 429 responses return RateLimit-Remaining: 0 and Retry-After or RateLimit-Reset', async () => {
    const app = createM1ServerApp({ escrowMax: 1, windowMs: 60000 });
    const client = new TestClient(app);
    await client.start();
    try {
      await client.request('/api/escrow/settle', { method: 'POST' });
      const blocked = await client.request('/api/escrow/settle', { method: 'POST' });
      assert.equal(blocked.status, 429);

      const remaining = blocked.getHeader('ratelimit-remaining');
      const retryAfter = blocked.getHeader('retry-after');
      const reset = blocked.getHeader('ratelimit-reset');

      assert.equal(remaining, '0', 'RateLimit-Remaining on 429 should be 0');
      assert(retryAfter !== null || reset !== null, 'Either Retry-After or RateLimit-Reset header must be present');
      if (retryAfter) {
        const retrySec = parseInt(retryAfter, 10);
        assert(retrySec > 0 && retrySec <= 60, `Retry-After must be valid integer seconds (got ${retrySec})`);
      }
    } finally {
      await client.close();
    }
  });

  // -------------------------------------------------------------
  // TEST GROUP 3: Reverse Proxy Trust Behavior & IP Resolution
  // -------------------------------------------------------------
  console.log('\n▶ GROUP 3: Reverse Proxy Trust Behavior (trust proxy: 1) & IP Spoofing Resistance');

  await test('3.1: trust proxy = 1 resolves client IP from immediate single-hop X-Forwarded-For', async () => {
    const app = createM1ServerApp({ trustProxy: 1, generalMax: 200 });
    const client = new TestClient(app);
    await client.start();
    try {
      const clientIp = '203.0.113.195';
      const res = await client.request('/api/escrow/config', {
        headers: { 'X-Forwarded-For': clientIp },
      });
      assert.equal(res.status, 200);
      assert.equal(res.json.clientIp, clientIp, 'req.ip should resolve to the client IP in X-Forwarded-For');
    } finally {
      await client.close();
    }
  });

  await test('3.2: trust proxy = 1 resists X-Forwarded-For leftmost spoofing (attacker cannot bypass rate limits by prefixing fake IPs)', async () => {
    // In Cloud Run, Cloud Run appends the verified client IP to the end of X-Forwarded-For.
    // If an attacker sends `X-Forwarded-For: 1.2.3.4`, Cloud Run passes `X-Forwarded-For: 1.2.3.4, 203.0.113.195`.
    // With trust proxy: 1, Express picks the 1st untrusted hop from the right (203.0.113.195).
    const app = createM1ServerApp({ trustProxy: 1, authMax: 2, windowMs: 60000 });
    const client = new TestClient(app);
    await client.start();
    try {
      const realClientIp = '203.0.113.195';

      // Attacker attempts request 1 with fake IP 10.0.0.1 prepended
      const res1 = await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { 'X-Forwarded-For': `10.0.0.1, ${realClientIp}` },
      });
      assert.equal(res1.status, 200);
      assert.equal(res1.json.clientIp, realClientIp, 'req.ip must bind to real client IP, ignoring leftmost spoof');

      // Attacker attempts request 2 with different fake IP 10.0.0.2 prepended
      const res2 = await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { 'X-Forwarded-For': `10.0.0.2, ${realClientIp}` },
      });
      assert.equal(res2.status, 200);
      assert.equal(res2.json.clientIp, realClientIp);

      // Attacker attempts request 3 with yet another fake IP 10.0.0.3 prepended -> MUST BE BLOCKED BY 429!
      const res3 = await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { 'X-Forwarded-For': `10.0.0.3, ${realClientIp}` },
      });
      assert.equal(res3.status, 429, 'Spoofed X-Forwarded-For rotation MUST NOT bypass rate limit with trust proxy: 1');
      assert.equal(res3.json.error, 'Rate limit exceeded for authentication, please slow down.');
    } finally {
      await client.close();
    }
  });

  await test('3.3: Distinct client IPs maintain isolated rate limit buckets', async () => {
    const app = createM1ServerApp({ trustProxy: 1, cronMax: 1, windowMs: 60000 });
    const client = new TestClient(app);
    await client.start();
    try {
      const userA = '198.51.100.50';
      const userB = '198.51.100.51';

      // User A exhausts quota
      const resA1 = await client.request('/api/cron/recover', {
        method: 'POST',
        headers: { 'X-Forwarded-For': userA },
      });
      assert.equal(resA1.status, 200);

      const resA2 = await client.request('/api/cron/recover', {
        method: 'POST',
        headers: { 'X-Forwarded-For': userA },
      });
      assert.equal(resA2.status, 429, 'User A should be blocked');

      // User B should succeed
      const resB = await client.request('/api/cron/recover', {
        method: 'POST',
        headers: { 'X-Forwarded-For': userB },
      });
      assert.equal(resB.status, 200, 'User B should not be affected by User A rate limit exhaustion');
    } finally {
      await client.close();
    }
  });

  // -------------------------------------------------------------
  // TEST GROUP 4: Content Security Policy (CSP) Completeness & Wildcard Audit
  // -------------------------------------------------------------
  console.log('\n▶ GROUP 4: Content Security Policy (CSP) Completeness & Overly Broad Permission Audit');

  await test('4.1: firebase.json and Express CSP configuration parity and syntax check', async () => {
    const firebaseJsonPath = path.join(process.cwd(), 'firebase.json');
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
    const globalHeader = firebaseConfig.hosting.headers.find((h) => h.source === '**');
    const cspEntry = globalHeader.headers.find((h) => h.key === 'Content-Security-Policy');

    assert(cspEntry !== undefined, 'CSP header must be defined in firebase.json');
    const fbCsp = cspEntry.value;

    // Directives inspection
    assert.includes(fbCsp, "default-src 'self'", 'CSP must specify default-src self');
    assert.includes(fbCsp, "object-src 'none'", 'CSP must prohibit object-src');
    assert.includes(fbCsp, "frame-ancestors 'none'", 'CSP must prohibit frame-ancestors');
    assert.includes(fbCsp, "base-uri 'self'", 'CSP must restrict base-uri');
    assert.includes(fbCsp, "form-action 'self'", 'CSP must restrict form-action');
    assert.includes(fbCsp, "upgrade-insecure-requests", 'CSP must include upgrade-insecure-requests');

    // Network Connect-src completeness check
    const requiredConnectSrc = [
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
    ];

    for (const endpoint of requiredConnectSrc) {
      assert.includes(fbCsp, endpoint, `firebase.json CSP connect-src must include ${endpoint}`);
    }

    // Express server CSP check
    const app = createM1ServerApp();
    const client = new TestClient(app);
    await client.start();
    try {
      const res = await client.request('/api/escrow/config');
      const expressCsp = res.getHeader('content-security-policy');
      assert(expressCsp !== null, 'Express should return Content-Security-Policy header');
      for (const endpoint of requiredConnectSrc) {
        assert.includes(expressCsp, endpoint, `Express CSP connect-src must include ${endpoint}`);
      }
    } finally {
      await client.close();
    }
  });

  await test('4.2: Audit for overly broad wildcard (*) permissions in CSP', async () => {
    const firebaseJsonPath = path.join(process.cwd(), 'firebase.json');
    const firebaseConfig = JSON.parse(fs.readFileSync(firebaseJsonPath, 'utf8'));
    const globalHeader = firebaseConfig.hosting.headers.find((h) => h.source === '**');
    const cspEntry = globalHeader.headers.find((h) => h.key === 'Content-Security-Policy');
    const csp = cspEntry.value;

    // Split directives
    const directives = csp.split(';').map((d) => d.trim()).filter(Boolean);
    const directiveMap = {};
    for (const dir of directives) {
      const parts = dir.split(/\s+/);
      const name = parts[0];
      const values = parts.slice(1);
      directiveMap[name] = values;
    }

    // 1. default-src should NOT contain bare '*'
    assert(!directiveMap['default-src'].includes('*'), "default-src must not contain '*'");

    // 2. script-src should NOT contain bare '*' or https:
    assert(!directiveMap['script-src'].includes('*'), "script-src must not contain '*'");
    assert(!directiveMap['script-src'].includes('https:'), "script-src must not contain 'https:'");

    // 3. style-src should NOT contain bare '*'
    assert(!directiveMap['style-src'].includes('*'), "style-src must not contain '*'");

    // 4. connect-src should NOT contain bare '*' or 'https:' or 'http:'
    assert(!directiveMap['connect-src'].includes('*'), "connect-src must not contain '*'");
    assert(!directiveMap['connect-src'].includes('https:'), "connect-src must not contain 'https:' wildcard");
    assert(!directiveMap['connect-src'].includes('http:'), "connect-src must not contain 'http:' wildcard");

    // 5. object-src must be 'none'
    assert(directiveMap['object-src'].includes("'none'"), "object-src must be 'none'");

    // 6. frame-ancestors must be 'none'
    assert(directiveMap['frame-ancestors'].includes("'none'"), "frame-ancestors must be 'none'");
  });

  // -------------------------------------------------------------
  // TEST GROUP 5: CORS Security and Preflight Verification
  // -------------------------------------------------------------
  console.log('\n▶ GROUP 5: Origin-Restricted CORS & Preflight Enforcement');

  await test('5.1: Whitelisted origins receive CORS headers, malicious subdomains and domains are denied', async () => {
    const app = createM1ServerApp({ isProd: true });
    const client = new TestClient(app);
    await client.start();
    try {
      // Allowed origins
      const allowedOrigins = [
        'https://bobsled-gg-app.web.app',
        'https://bobsled-gg-app.firebaseapp.com',
      ];

      for (const origin of allowedOrigins) {
        const res = await client.request('/api/escrow/config', {
          headers: { Origin: origin },
        });
        assert.equal(res.getHeader('access-control-allow-origin'), origin, `Whitelisted origin ${origin} should be allowed`);
        assert.equal(res.getHeader('access-control-allow-credentials'), 'true', 'Credentials header should be true');
      }

      // Blocked origins (attacker subdomains, suffixes, lookalikes)
      const deniedOrigins = [
        'https://attacker-app.web.app',
        'https://bobsled-gg-app.web.app.attacker.com',
        'https://evil-firebaseapp.com',
        'https://notbobsled-gg-app.firebaseapp.com',
        'http://localhost:3000', // in prod mode, localhost is denied
        'null',
      ];

      for (const origin of deniedOrigins) {
        const res = await client.request('/api/escrow/config', {
          headers: { Origin: origin },
        });
        assert.equal(res.getHeader('access-control-allow-origin'), null, `Unauthorized origin ${origin} must NOT receive Access-Control-Allow-Origin header`);
        assert.ok(res.status !== 500, `Origin ${origin} must not crash the server with 500`);
      }
    } finally {
      await client.close();
    }
  });

  await test('5.2: Preflight OPTIONS request responds with methods, headers, and maxAge', async () => {
    const app = createM1ServerApp();
    const client = new TestClient(app);
    await client.start();
    try {
      const res = await client.request('/api/escrow/settle', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://bobsled-gg-app.web.app',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type, Authorization, Idempotency-Key',
        },
      });

      assert.equal(res.getHeader('access-control-allow-origin'), 'https://bobsled-gg-app.web.app');
      assert.includes(res.getHeader('access-control-allow-methods'), 'POST');
      assert.includes(res.getHeader('access-control-allow-headers'), 'Idempotency-Key');
      assert.equal(res.getHeader('access-control-max-age'), '86400');
    } finally {
      await client.close();
    }
  });

  console.log('\n================================================================');
  console.log(`  📊  ADVERSARIAL SUITE SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runAdversarialTestSuite().catch((err) => {
  console.error('Fatal error running adversarial test suite:', err);
  process.exit(1);
});
