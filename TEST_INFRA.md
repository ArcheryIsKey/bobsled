# E2E Test Infra: Bobsled Edge Cases & Admin History

## Test Philosophy
- **Requirement-Driven & Opaque-Box**: Tests verify real user-facing behavior, security invariants, and audit trails without coupling to internal implementation quirks.
- **Methodology**: Systematic multi-tier testing (Category-Partition, Boundary Value Analysis, Pairwise Combinations, Real-World Lifecycle Scenarios, and Adversarial Invariant Fuzzing).

## Feature Inventory & Test Mapping
| # | Feature | Requirement | Tier 1 (Coverage) | Tier 2 (Boundary/Edge) | Tier 3 (Pairwise) | Tier 4 (E2E Scenario) |
|---|---------|-------------|:-----------------:|:----------------------:|:-----------------:|:----------------------:|
| 1 | Multi-Tier Error Boundaries | R2 | 5 cases | 5 cases | ✓ | ✓ |
| 2 | Safe Firestore Error Handling | R2 | 5 cases | 5 cases | ✓ | ✓ |
| 3 | Input Clamping & Balance Pre-validation | R1 | 5 cases | 5 cases | ✓ | ✓ |
| 4 | Staged Escrow & Recovery Resilience | R1, R2 | 5 cases | 5 cases | ✓ | ✓ |
| 5 | Concurrency & Move Locking | R1, R2 | 5 cases | 5 cases | ✓ | ✓ |
| 6 | Network Loss & Offline Banner | R2 | 5 cases | 5 cases | ✓ | ✓ |
| 7 | Dedicated `admin_history` Schema | R3 | 5 cases | 5 cases | ✓ | ✓ |
| 8 | Server Event Emission & Solscan Devnet | R3 | 5 cases | 5 cases | ✓ | ✓ |
| 9 | Firestore Security Rules for History | R3 | 5 cases | 5 cases | ✓ | ✓ |
| 10 | Live Admin Panel History & Filtering | R3 | 5 cases | 5 cases | ✓ | ✓ |

## Test Architecture
- **Master Test Runner**: `node scripts/test-e2e-security.mjs` (orchestrates all security & lifecycle suites).
- **Edge Cases & Resilience Suite**: `tests/security/tier1-features/f14-edge-cases-resilience.test.mjs` (explicitly scores application against >=15 concrete edge cases).
- **Administrative History Suite**: `tests/security/tier1-features/f13-admin-history-tracking.test.mjs` (verifies full game lifecycle event emission, chronological ordering, and Solscan devnet links).
- **TypeScript & Build Verification**: `npm run lint` && `npm run build`.

## 15+ Concrete Edge Cases Verification Checklist
1. **EC-01**: Sub-minimum wagers (`0.0001` SOL) and float underflow rejected before wallet prompt.
2. **EC-02**: Rapid double-clicking on match creation prevented via synchronous debounce.
3. **EC-03**: Malicious initial game state (pre-filled winning board / invalid fields) rejected by Firestore rules.
4. **EC-04**: Host attempting to join own match prevented on both UI and security rules.
5. **EC-05**: User wallet cancellation/rejection handled gracefully without breaking UI state or leaving orphaned docs.
6. **EC-06**: Insufficient SOL balance pre-checked with faucet guidance before transaction submission.
7. **EC-07**: Blockhash expiration / confirmation timeout recovered via `/api/cron/recover`.
8. **EC-08**: Mid-transaction network drop reconciled on reconnect or via cron without fund loss.
9. **EC-09**: Escrow vault low balance aborts payout safely without double-spend or state corruption.
10. **EC-10**: Corrupted board data (non-42 array / null / invalid values) handled by fallback board sanitizer.
11. **EC-11**: Navigating to deleted/non-existent match ID gracefully redirects to lobby with toast notification.
12. **EC-12**: Re-opening finished matches handles settlement idempotently with 200 OK and no duplicate payouts.
13. **EC-13**: Stale abandoned waiting matches allow clean host cancellation and deposit refund.
14. **EC-14**: Simultaneous rapid move submissions in Connect-4 locked by optimistic client-side turn guard.
15. **EC-15**: Race condition between winning move and opponent resignation/AFK claim resolves deterministically.
16. **EC-16**: Multi-tab play by same user synchronizes board state smoothly across tabs.
17. **EC-17**: Concurrent host cancellation vs opponent join handles refund/rejection safely.
18. **EC-18**: Offline transition displays persistent reconnection banner and disables inputs.
19. **EC-19**: Throttled Solana RPC cascades seamlessly to fallback endpoints without balance display wipe.
20. **EC-20**: Uncaught React component throws caught by ErrorBoundary displaying recovery UI instead of white-screen.

## Full Game Lifecycle History Verification
- **Creation**: Emits `created` (and `deposit_p1` for SOL) with host wallet and deposit signature.
- **Join**: Emits `deposit_p2` (for SOL) and `match_started` with joiner wallet and deposit signature.
- **Move / Resign**: Emits `resigned` or `game_finished` with winner identification.
- **Payout**: Emits `paid_out` with winner wallet, payout amount, house fee, and devnet Solscan link (`https://solscan.io/tx/{sig}?cluster=devnet`).
- **Cancellation**: Emits `refunded` and `cancelled` with refund signature and devnet Solscan link.
- **Draw**: Emits `draw_refunded` with 50/50 split signatures.
- **Security**: Non-admin users strictly forbidden from reading `admin_history`; client write attempts rejected.
