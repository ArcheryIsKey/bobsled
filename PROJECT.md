# Project: Bobsled Edge Cases & Comprehensive Admin History

## Architecture
- **Client App**: React 19 + TypeScript + Vite + Tailwind CSS + Solana Wallet Adapter + Firebase Client SDK.
- **Server / Escrow Engine**: Node.js + Express + TypeScript + Solana Web3.js + Firebase Admin SDK.
- **Database & Security**: Cloud Firestore with server-authoritative `admin_history` and `games` collections governed by `firestore.rules`.
- **Telemetry & Admin UI**: Dedicated real-time administrative history dashboard with event filtering, JSON inspection, and clickable Solscan Devnet transaction links.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Multi-Tier Error Boundaries | Root, Route, and Component error boundaries with graceful recovery UI to prevent white-screen crashes | M1 | Survey / R2 |
| 2 | Safe Firestore Error Handling | Prevent uncaught exceptions in `firebase.ts:handleFirestoreError` during snapshot drops or permission errors | M1 | Survey / R2 |
| 3 | Input Clamping & Balance Pre-validation | Strict client validation for 0.001–100 SOL wagers and wallet balance pre-check before transaction signing | M1 | Survey / R1 |
| 4 | Staged Escrow & Recovery Resilience | Two-phase staged match creation, atomic join lock, and exponential backoff retry loop on deposit verification | M1 | Survey / R1, R2 |
| 5 | Concurrency & Move Locking | Optimistic move locking in Connect-4 and race-condition guards for simultaneous moves, resigns, and cancels | M1 | Survey / R1, R2 |
| 6 | Network Loss & Offline Banner | Real-time online/offline connection state detection with reconnection banner and UI disabling | M1 | Survey / R2 |
| 7 | Dedicated `admin_history` Collection Schema | Firestore collection schema for immutable lifecycle events with devnet Solscan URLs | M2 | Survey / R3 |
| 8 | Server-Authoritative Event Emission | Automatic emission of all lifecycle events (`created`, `deposit_p1`, `deposit_p2`, `match_started`, `resigned`, `timeout_win`, `game_finished`, `paid_out`, `refunded`, `draw_refunded`, `cancelled`, `cron_recovery`) in `server.ts` | M2 | Survey / R3 |
| 9 | Firestore Security Rules & Indexes | Secure `admin_history` rules (`allow read, list: if isAdmin(); allow write: if false;`) and composite query indexes | M2 | Survey / R3 |
| 10 | Live Admin Panel History Stream | Real-time Firestore query listener and interactive audit log tab in `AdminPanel.tsx` | M3 | Survey / R3 |
| 11 | Solscan Devnet Link Component | Clickable link pills rendering `https://solscan.io/tx/{sig}?cluster=devnet` for all on-chain transactions | M3 | Survey / R3 |
| 12 | Admin Filtering & Event Inspector | Filter by event type/status, search by Game ID/Wallet/Tx, and expandable drawer with full event metadata | M3 | Survey / R3 |
| 13 | E2E 15+ Edge-Case Verification | Programmatic and agent-as-judge test harness scoring 15+ edge cases without crashes | M4 | Acceptance Criteria |
| 14 | E2E Full Lifecycle History Verification | E2E integration test confirming creation -> deposit -> finish -> payout writes chronological history records | M4 | Acceptance Criteria |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Edge Case Resilience & Error Boundaries | Error Boundaries (Root/Route/Component), safe Firestore error handling, input clamping, balance pre-validation, move locking, offline banner | none | PLANNED |
| M2 | Server-Authoritative Admin History & Solscan Logging | `admin_history` Firestore collection, server-side event emission in `server.ts`, devnet Solscan links, Firestore security rules & indexes | none | PLANNED |
| M3 | Live Admin Panel History & Solscan UI | Live history stream in `AdminPanel.tsx`, event filtering, search, Solscan link pills, expandable event inspector drawer | M2 | PLANNED |
| M4 | E2E Acceptance & Adversarial Hardening | Pass 100% E2E test suite (15+ edge cases, full lifecycle history), agent-as-judge scoring, Tier 5 adversarial testing | M1, M2, M3 | PLANNED |

## Interface Contracts
### Client ↔ Server Escrow & History (`admin_history`)
- `admin_history` document structure:
  - `id`: string
  - `timestamp`: FieldValue / Date
  - `isoTimestamp`: string
  - `eventType`: `created` | `deposit_p1` | `deposit_p2` | `match_started` | `resigned` | `timeout_win` | `game_finished` | `paid_out` | `refunded` | `draw_refunded` | `cancelled` | `cron_recovery`
  - `eventLabel`: string
  - `status`: `'confirmed'` | `'processing'` | `'failed'`
  - `gameId`: string
  - `gameType`: `'connect4'`
  - `wager`: number
  - `wagerCurrency`: `'SOL'` | `'FREE'`
  - `totalPot`: number (optional)
  - `userId`: string
  - `username`: string
  - `walletAddress`: string | null
  - `role`: `'player1'` | `'player2'` | `'system'` | `'admin'`
  - `targetUserId`: string | null (optional)
  - `targetUsername`: string | null (optional)
  - `targetWallet`: string | null (optional)
  - `amountSol`: number | null (optional)
  - `houseFeeSol`: number | null (optional)
  - `txSignature`: string | null (optional)
  - `solscanUrl`: string | null (e.g. `https://solscan.io/tx/{sig}?cluster=devnet`)
  - `network`: `'devnet'` | `'mainnet-beta'`
  - `metadata`: object

### Client Error Boundary Contract
- `<ErrorBoundary fallbackComponent={FallbackView} onError={logError}>`:
  - `RootErrorBoundary`: Renders full-screen recovery card on top-level crash with reload / reset actions.
  - `RouteErrorBoundary`: Renders inline banner allowing user to return to lobby without breaking navigation/wallet.
  - `ComponentErrorBoundary`: Renders fallback placeholder for non-critical components (e.g. Chat) while game board remains playable.

## Code Layout
- `src/components/common/ErrorBoundary.tsx` — Reusable React Error Boundary class component
- `src/components/common/ConnectionStatusBanner.tsx` — Online/offline connectivity banner
- `src/firebase.ts` — Sanitized error logging without uncaught synchronous throws
- `src/utils/solanaEscrow.ts` — Balance pre-validation, blockhash fallbacks, exponential backoff
- `src/components/Dashboard.tsx` — Staged match creation, input clamping, balance pre-check
- `src/components/games/Connect4.tsx` — Optimistic move locking, fallback board sanitizer
- `server.ts` — `logAdminHistory` helper and emission across all lifecycle endpoints
- `firestore.rules` — Rules for `admin_history` and join constraints
- `firestore.indexes.json` — Composite indexes for `admin_history`
- `src/components/AdminPanel.tsx` — Admin history stream, filters, Solscan pills, inspector drawer
- `tests/` & `scripts/` — E2E test suites for 15+ edge cases and full lifecycle admin history verification
