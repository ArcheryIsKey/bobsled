#!/usr/bin/env node
/**
 * Bobsled Security Audit & Hardening - Master E2E Security Test Runner
 *
 * Executes comprehensive multi-tier security test suites across:
 * - Tier 1: Feature Coverage (F1 to F12)
 * - Tier 2: Boundary & Malformed Inputs (B1 to B6)
 * - Tier 3: Cross-Feature Combinations (T3)
 * - Tier 4: Real-World Application & Attack Scenarios (T4)
 *
 * Usage:
 *   node scripts/test-e2e-security.mjs
 */

import { harness } from '../tests/security/harness/test-runner.mjs';

// Load Tier 1: Feature Coverage (12 suites, >=5 tests each)
import '../tests/security/tier1-features/f01-http-headers.test.mjs';
import '../tests/security/tier1-features/f02-cors-restrictions.test.mjs';
import '../tests/security/tier1-features/f03-rate-limiting.test.mjs';
import '../tests/security/tier1-features/f04-deposit-verification.test.mjs';
import '../tests/security/tier1-features/f05-signature-dedup.test.mjs';
import '../tests/security/tier1-features/f06-anti-double-settle-refund.test.mjs';
import '../tests/security/tier1-features/f07-escrow-keypair-isolation.test.mjs';
import '../tests/security/tier1-features/f08-payout-fee-bounds.test.mjs';
import '../tests/security/tier1-features/f09-zod-schemas.test.mjs';
import '../tests/security/tier1-features/f10-input-bounds.test.mjs';
import '../tests/security/tier1-features/f11-firestore-rules.test.mjs';
import '../tests/security/tier1-features/f12-secret-cleanliness.test.mjs';

// Load Tier 2: Boundary & Malformed Inputs (6 suites, 10 tests each)
import '../tests/security/tier2-boundaries/b01-header-cors-boundaries.test.mjs';
import '../tests/security/tier2-boundaries/b02-rate-limit-boundaries.test.mjs';
import '../tests/security/tier2-boundaries/b03-solana-tx-boundaries.test.mjs';
import '../tests/security/tier2-boundaries/b04-escrow-concurrency-boundaries.test.mjs';
import '../tests/security/tier2-boundaries/b05-zod-injection-boundaries.test.mjs';
import '../tests/security/tier2-boundaries/b06-firestore-rule-boundaries.test.mjs';

// Load Tier 3: Cross-Feature Combinations (12 integration tests)
import '../tests/security/tier3-combinations/cross-feature-combinations.test.mjs';

// Load Tier 4: Real-World Application & Attack Scenarios (7 scenarios)
import '../tests/security/tier4-scenarios/attack-scenarios.test.mjs';

async function main() {
  const success = await harness.run();
  if (!success) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
