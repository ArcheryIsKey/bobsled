/**
 * Adversarial Challenge & Stress-Test Harness against Live Running server.ts
 *
 * Spawns the actual `server.ts` process using `tsx` and executes real HTTP requests over the network.
 */

import { spawn } from 'node:child_process';
import http from 'node:http';

const TEST_PORT = 59299;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

let serverProcess = null;
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

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
  } catch (err) {
    const duration = Date.now() - startTime;
    failedTests++;
    console.log(`  \x1b[31m✖ [FAIL]\x1b[0m \x1b[90m(${duration}ms)\x1b[0m ${testName}`);
    console.log(`    \x1b[31mError: ${err.message}\x1b[0m`);
  }
}

async function makeRequest(path, options = {}) {
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
        port: TEST_PORT,
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
          } catch (e) {}
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

async function startLiveServer() {
  return new Promise((resolve, reject) => {
    serverProcess = spawn('npx', ['tsx', 'server.ts'], {
      shell: true,
      env: {
        ...process.env,
        PORT: String(TEST_PORT),
        NODE_ENV: 'development',
      },
    });

    let started = false;

    serverProcess.stdout.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes(`Server running on http://localhost:${TEST_PORT}`) && !started) {
        started = true;
        resolve();
      }
    });

    serverProcess.stderr.on('data', (data) => {
      // console.error('SERVER STDERR:', data.toString());
    });

    serverProcess.on('error', reject);

    setTimeout(() => {
      if (!started) {
        reject(new Error('Server timed out starting within 10 seconds'));
      }
    }, 10000);
  });
}

function stopLiveServer() {
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
  }
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('  🛡️   BOBSLED ADVERSARIAL LIVE SERVER VERIFICATION');
  console.log('='.repeat(80) + '\n');

  console.log('Spawning live server.ts on port ' + TEST_PORT + '...');
  await startLiveServer();
  console.log('Live server.ts running. Commencing real network tests...\n');

  try {
    // -----------------------------------------------------------------------
    // LIVE TEST SUITE 1: Security Headers on Live Server
    // -----------------------------------------------------------------------
    console.log('\x1b[1m\x1b[36m▶ Live Suite 1: Live HTTP Security Headers on server.ts\x1b[0m');

    await runTest('Live Server: Content-Security-Policy header present on /api/escrow/config', async () => {
      const res = await makeRequest('/api/escrow/config');
      assertEqual(res.status, 200);
      const csp = res.getHeader('content-security-policy');
      assert(csp, 'CSP missing');
      assertIncludes(csp, "default-src 'self'");
      assertIncludes(csp, "object-src 'none'");
      assertIncludes(csp, "frame-ancestors 'none'");
    });

    await runTest('Live Server: X-Frame-Options is strictly DENY', async () => {
      const res = await makeRequest('/api/escrow/config');
      assertEqual(res.getHeader('x-frame-options'), 'DENY');
    });

    await runTest('Live Server: X-Content-Type-Options is nosniff', async () => {
      const res = await makeRequest('/api/escrow/config');
      assertEqual(res.getHeader('x-content-type-options'), 'nosniff');
    });

    await runTest('Live Server: Referrer-Policy is strict-origin-when-cross-origin', async () => {
      const res = await makeRequest('/api/escrow/config');
      assertEqual(res.getHeader('referrer-policy'), 'strict-origin-when-cross-origin');
    });

    await runTest('Live Server: Permissions-Policy restricts camera, microphone, geolocation', async () => {
      const res = await makeRequest('/api/escrow/config');
      assertEqual(res.getHeader('permissions-policy'), 'camera=(), microphone=(), geolocation=()');
    });

    // -----------------------------------------------------------------------
    // LIVE TEST SUITE 2: Live CORS Adversarial Probing
    // -----------------------------------------------------------------------
    console.log('\n\x1b[1m\x1b[36m▶ Live Suite 2: Live CORS Adversarial Origin Probing\x1b[0m');

    await runTest('Live Server CORS: Production origin bobsled-gg-app.web.app allowed', async () => {
      const res = await makeRequest('/api/escrow/config', {
        headers: { Origin: 'https://bobsled-gg-app.web.app' },
      });
      assertEqual(res.status, 200);
      assertEqual(res.getHeader('access-control-allow-origin'), 'https://bobsled-gg-app.web.app');
      assertEqual(res.getHeader('access-control-allow-credentials'), 'true');
    });

    await runTest('Live Server CORS: Production origin bobsled-gg-app.firebaseapp.com allowed', async () => {
      const res = await makeRequest('/api/escrow/config', {
        headers: { Origin: 'https://bobsled-gg-app.firebaseapp.com' },
      });
      assertEqual(res.status, 200);
      assertEqual(res.getHeader('access-control-allow-origin'), 'https://bobsled-gg-app.firebaseapp.com');
    });

    await runTest('Live Server CORS: Spoofed origin https://fake-bobsled-gg-app.web.app blocked without 500', async () => {
      const res = await makeRequest('/api/escrow/config', {
        headers: { Origin: 'https://fake-bobsled-gg-app.web.app' },
      });
      assertEqual(res.getHeader('access-control-allow-origin'), undefined);
      assert(res.status !== 500, `Expected non-500, got ${res.status}`);
    });

    await runTest('Live Server CORS: Evil firebaseapp https://evil.firebaseapp.com blocked', async () => {
      const res = await makeRequest('/api/escrow/config', {
        headers: { Origin: 'https://evil.firebaseapp.com' },
      });
      assertEqual(res.getHeader('access-control-allow-origin'), undefined);
      assert(res.status !== 500);
    });

    await runTest('Live Server CORS: Subdomain suffix spoof https://bobsled-gg-app.web.app.evil.com blocked', async () => {
      const res = await makeRequest('/api/escrow/config', {
        headers: { Origin: 'https://bobsled-gg-app.web.app.evil.com' },
      });
      assertEqual(res.getHeader('access-control-allow-origin'), undefined);
      assert(res.status !== 500);
    });

    await runTest('Live Server CORS: Null origin string ("null") blocked', async () => {
      const res = await makeRequest('/api/escrow/config', {
        headers: { Origin: 'null' },
      });
      assertEqual(res.getHeader('access-control-allow-origin'), undefined);
      assert(res.status !== 500);
    });

    await runTest('Live Server CORS: Preflight OPTIONS on allowed origin returns 204 with methods/headers', async () => {
      const res = await makeRequest('/api/escrow/verify-deposit', {
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
    });

    await runTest('Live Server CORS: Preflight OPTIONS on unauthorized origin denied without 500', async () => {
      const res = await makeRequest('/api/escrow/verify-deposit', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil-phishing-site.com',
          'Access-Control-Request-Method': 'POST',
        },
      });
      assertEqual(res.getHeader('access-control-allow-origin'), undefined);
      assert(res.status !== 500);
    });

    // -----------------------------------------------------------------------
    // LIVE TEST SUITE 3: Live Rate Limiting Stress Testing
    // -----------------------------------------------------------------------
    console.log('\n\x1b[1m\x1b[36m▶ Live Suite 3: Live Rate Limiting Stress Testing on server.ts\x1b[0m');

    await runTest('Live Server Rate Limit: /api/auth/nonce allows 15 requests, 16th returns 429', async () => {
      const testIp = '198.51.100.111';
      for (let i = 1; i <= 15; i++) {
        const res = await makeRequest('/api/auth/nonce', {
          method: 'POST',
          headers: { 'X-Forwarded-For': testIp },
          body: { publicKey: '11111111111111111111111111111111' },
        });
        assertEqual(res.status, 200, `Request ${i}/15 should succeed`);
      }

      const blocked = await makeRequest('/api/auth/nonce', {
        method: 'POST',
        headers: { 'X-Forwarded-For': testIp },
        body: { publicKey: '11111111111111111111111111111111' },
      });
      assertEqual(blocked.status, 429, '16th request must be 429');
      assertIncludes(blocked.json?.error, 'Rate limit exceeded for authentication');
    });

    await runTest('Live Server Rate Limit: /api/escrow/settle allows 10 requests, 11th returns 429', async () => {
      const testIp = '198.51.100.222';
      for (let i = 1; i <= 10; i++) {
        const res = await makeRequest('/api/escrow/settle', {
          method: 'POST',
          headers: { 'X-Forwarded-For': testIp },
          body: { gameId: 'test_game_live' },
        });
        // May return 400 or 404 depending on database, but NOT 429
        assert(res.status !== 429, `Request ${i}/10 must not be 429, got ${res.status}`);
      }

      const blocked = await makeRequest('/api/escrow/settle', {
        method: 'POST',
        headers: { 'X-Forwarded-For': testIp },
        body: { gameId: 'test_game_live' },
      });
      assertEqual(blocked.status, 429, '11th request must be 429');
      assertIncludes(blocked.json?.error, 'Rate limit exceeded for sensitive operation');
    });

    await runTest('Live Server Rate Limit: /api/cron/recover allows 5 requests, 6th returns 429', async () => {
      const testIp = '198.51.100.333';
      for (let i = 1; i <= 5; i++) {
        const res = await makeRequest('/api/cron/recover', {
          method: 'POST',
          headers: { 'X-Forwarded-For': testIp },
        });
        assert(res.status !== 429, `Request ${i}/5 must not be 429`);
      }

      const blocked = await makeRequest('/api/cron/recover', {
        method: 'POST',
        headers: { 'X-Forwarded-For': testIp },
      });
      assertEqual(blocked.status, 429, '6th request must be 429');
    });

    await runTest('Live Server Rate Limit: Multi-IP isolation on live server', async () => {
      const ipA = '198.51.100.444';
      const ipB = '198.51.100.555';

      // Exhaust IP A (10 requests on sensitive settle)
      for (let i = 0; i < 10; i++) {
        await makeRequest('/api/escrow/settle', {
          method: 'POST',
          headers: { 'X-Forwarded-For': ipA },
          body: { gameId: 'g1' },
        });
      }
      const blockedA = await makeRequest('/api/escrow/settle', {
        method: 'POST',
        headers: { 'X-Forwarded-For': ipA },
        body: { gameId: 'g1' },
      });
      assertEqual(blockedA.status, 429);

      // IP B must not be rate limited
      const resB = await makeRequest('/api/escrow/settle', {
        method: 'POST',
        headers: { 'X-Forwarded-For': ipB },
        body: { gameId: 'g1' },
      });
      assert(resB.status !== 429, `IP B should not be blocked, got ${resB.status}`);
    });

  } finally {
    console.log('\nStopping live server process...');
    stopLiveServer();
  }

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n' + '='.repeat(80));
  console.log('  📊  LIVE SERVER ADVERSARIAL VERIFICATION SUMMARY');
  console.log('='.repeat(80));
  console.log(`  Total Live Tests:  ${totalTests}`);
  console.log(`  \x1b[32mPassed:\x1b[0m            ${passedTests}`);
  console.log(`  \x1b[31mFailed:\x1b[0m            ${failedTests}`);
  console.log('='.repeat(80) + '\n');

  if (failedTests > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal live server test error:', err);
  stopLiveServer();
  process.exit(1);
});
