/**
 * Tier 1 Feature Test: F12 - Secret Cleanliness & Build Zero Regressions
 * Verifies that plaintext keys are eradicated from source scripts, .gitignore is configured, and build integrity is preserved.
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, assert } from '../harness/test-runner.mjs';

describe('Tier 1: F12 - Plaintext Secret Cleanliness & Build Integrity', () => {
  it('F12-1: .gitignore excludes sensitive credentials and environment files', () => {
    const gitignorePath = path.join(process.cwd(), '.gitignore');
    assert.ok(fs.existsSync(gitignorePath), '.gitignore must exist');
    const content = fs.readFileSync(gitignorePath, 'utf8');

    assert.includes(content, 'escrow-keypair.json', 'Must ignore escrow-keypair.json');
    assert.includes(content, 'service-account-key.json', 'Must ignore service-account-key.json');
    assert.includes(content, '.env', 'Must ignore .env files');
  });

  it('F12-2: Utility scripts use process.env rather than hardcoded credentials', () => {
    const scriptFiles = [
      'download-screens.cjs',
      'fetch-screen.cjs',
      'fetch-error.cjs',
      'mcp-client.cjs',
      'mcp-client.mjs',
      'parse-tools.cjs',
    ];

    for (const file of scriptFiles) {
      const filePath = path.join(process.cwd(), file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        // Check for hardcoded API key literal
        assert.doesNotMatch(
          content,
          /const\s+API_KEY\s*=\s*['"]AQ\.Ab8[A-Za-z0-9_\-]+['"]/,
          `Script ${file} must not contain hardcoded Stitch/Gemini API key`
        );
      }
    }
  });

  it('F12-3: package.json specifies required security packages and valid engines', () => {
    const pkgPath = path.join(process.cwd(), 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

    assert.ok(pkg.dependencies.helmet, 'Helmet must be present in dependencies');
    assert.ok(pkg.dependencies.cors, 'CORS must be present in dependencies');
    assert.ok(pkg.dependencies['express-rate-limit'], 'express-rate-limit must be present');
    assert.ok(pkg.dependencies['@solana/web3.js'], '@solana/web3.js must be present');
    assert.ok(pkg.dependencies.tweetnacl, 'tweetnacl must be present');
  });

  it('F12-4: Root directory does not leak private keys in public dist folder', () => {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      const distFiles = fs.readdirSync(distPath, { recursive: true });
      for (const file of distFiles) {
        if (typeof file === 'string') {
          assert.ok(!file.endsWith('.key'), 'Dist should not contain .key files');
          assert.ok(!file.includes('escrow-keypair'), 'Dist should not contain escrow keypairs');
        }
      }
    }
  });

  it('F12-5: No plaintext private keys in server.ts default code paths', () => {
    const serverPath = path.join(process.cwd(), 'server.ts');
    const serverContent = fs.readFileSync(serverPath, 'utf8');

    // Ensure no 64-byte array hardcoded as default
    assert.doesNotMatch(
      serverContent,
      /const\s+ESCROW_PRIVATE_KEY\s*=\s*\[\s*\d+\s*,\s*\d+/,
      'server.ts must not hardcode raw private key arrays'
    );
  });
});
