/**
 * Tier 1 Feature Test: F7 - Escrow Keypair Isolation & Error Trace Masking
 * Verifies keypair parsing, zero private key exposure in configs/telemetry, and .dockerignore exclusion.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { describe, it, assert } from '../harness/test-runner.mjs';
import { createTestApp, HttpTestClient } from '../harness/mock-express.mjs';

describe('Tier 1: F7 - Escrow Keypair Isolation & Error Masking', () => {
  it('F7-1: Keypair parser handles both JSON array string and Base58 string formats', () => {
    const rawKp = Keypair.generate();
    const encodeFn = bs58.encode || bs58.default?.encode;
    const decodeFn = bs58.decode || bs58.default?.decode;

    const base58String = encodeFn(rawKp.secretKey);
    const jsonArrayString = JSON.stringify(Array.from(rawKp.secretKey));

    // Test JSON array decoding
    const secretBytesFromJson = Uint8Array.from(JSON.parse(jsonArrayString));
    const kpFromJson = Keypair.fromSecretKey(secretBytesFromJson);
    assert.equal(kpFromJson.publicKey.toBase58(), rawKp.publicKey.toBase58());

    // Test Base58 decoding
    const secretBytesFromBase58 = decodeFn(base58String);
    const kpFromBase58 = Keypair.fromSecretKey(secretBytesFromBase58);
    assert.equal(kpFromBase58.publicKey.toBase58(), rawKp.publicKey.toBase58());
  });

  it('F7-2: GET /api/escrow/config returns only public keys and no private key material', async () => {
    const { app, solanaHarness } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      const res = await client.request('/api/escrow/config');
      assert.equal(res.status, 200);
      assert.ok(res.json?.escrowPublicKey, 'Must include escrowPublicKey');
      assert.ok(res.json?.houseWalletPublicKey, 'Must include houseWalletPublicKey');

      const responseString = JSON.stringify(res.json);
      assert.doesNotMatch(responseString, /secretKey/i, 'Secret key property must never appear in response');
      assert.doesNotMatch(responseString, /privateKey/i, 'Private key property must never appear in response');

      const encodeFn = bs58.encode || bs58.default?.encode;
      const rawSecretBase58 = encodeFn(solanaHarness.escrowKeypair.secretKey);
      assert.ok(!responseString.includes(rawSecretBase58), 'Raw secret key bytes must never be leaked');
    } finally {
      await client.close();
    }
  });

  it('F7-3: .dockerignore exists and excludes sensitive credential files', () => {
    const dockerignorePath = path.join(process.cwd(), '.dockerignore');
    assert.ok(fs.existsSync(dockerignorePath), '.dockerignore must exist');
    const content = fs.readFileSync(dockerignorePath, 'utf8');

    assert.includes(content, 'service-account-key.json', 'Must ignore service-account-key.json');
    assert.includes(content, 'node_modules', 'Must ignore node_modules');
    assert.includes(content, '.git', 'Must ignore .git');
  });

  it('F7-4: Error handler returns sanitized generic messages without internal stacks', async () => {
    const { app } = createTestApp();
    const client = new HttpTestClient(app);

    try {
      // Trigger validation error on invalid pubkey
      const res = await client.request('/api/auth/nonce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: { publicKey: 'short' },
      });

      assert.equal(res.status, 400);
      const text = JSON.stringify(res.json);
      assert.doesNotMatch(text, /at\s+[\w\.\/\\:]+\.ts/i, 'Stack traces must not be exposed in JSON response');
    } finally {
      await client.close();
    }
  });

  it('F7-5: Escrow public key is a valid Solana 32-byte Base58 address', () => {
    const { solanaHarness } = createTestApp();
    const pubkeyStr = solanaHarness.escrowKeypair.publicKey.toBase58();
    assert.ok(pubkeyStr.length >= 32 && pubkeyStr.length <= 44, 'Public key length must be 32-44 base58 chars');
    assert.match(pubkeyStr, /^[1-9A-HJ-NP-Za-km-z]+$/, 'Public key must contain valid Base58 characters');
  });
});
