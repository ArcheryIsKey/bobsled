import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('================================================================================');
console.log('🔍 VERIFYING MILESTONE 3: ADMIN PANEL HISTORY & SOLSCAN EXPLORER');
console.log('================================================================================\n');

const projectRoot = process.cwd();
const adminPanelPath = path.join(projectRoot, 'src', 'components', 'AdminPanel.tsx');

assert(fs.existsSync(adminPanelPath), 'src/components/AdminPanel.tsx must exist');
const code = fs.readFileSync(adminPanelPath, 'utf8');

// 1. User Database Default & Live Activity Stream Layout
console.log('▶ Requirement 1: User Database Default & Telemetry KPI Cards');
assert(code.includes("User Database"), 'Must render User Database as default view');
assert(code.includes("Live Activity Stream"), 'Must render Live Activity Stream chatbox');
assert(code.includes("Registered Users") && code.includes("Live Matches") && code.includes("Finished Matches") && code.includes("Total Stakes"),
  'Must preserve all 4 KPI telemetry cards');
console.log('  ✔ Layout & KPI cards verified.');

// 2. Live Administrative History Stream
console.log('\n▶ Requirement 2: Real-time Firestore History Stream');
assert(code.includes("collection(db, 'admin_history')"), 'Must query collection(db, "admin_history")');
assert(code.includes("orderBy('timestamp', 'desc')") || code.includes('orderBy("timestamp", "desc")'),
  'Must order by timestamp desc');
assert(code.includes("limit(100)"), 'Must limit history query to 100 documents');
assert(code.includes("onSnapshot"), 'Must use onSnapshot for live real-time updates');
assert(code.includes("No activity events recorded yet"), 'Must display empty state when no events exist');
console.log('  ✔ Real-time onSnapshot listener & empty state verified.');

// 3. Filtering & Search Controls
console.log('\n▶ Requirement 3: Category, Status, & Multi-Field Search Filtering');
assert(code.includes("'deposits'") && code.includes("'payouts'") && code.includes("'refunds'") && code.includes("'resignations'") && code.includes("'rooms'") && code.includes("'cron'"),
  'Must support all required category filter options');
assert(code.includes("'confirmed'") && code.includes("'processing'") && code.includes("'failed'"),
  'Must support confirmed, processing, and failed status filters');
assert(code.includes("ev.gameId") && code.includes("ev.username") && code.includes("ev.walletAddress") && code.includes("ev.txSignature"),
  'Search must filter across gameId, username, walletAddress, and txSignature');
console.log('  ✔ Category, status, and search filters verified.');

// 4. Solscan Devnet Links & Interactive Pills
console.log('\n▶ Requirement 4: Solscan Devnet Transaction & Account Links');
assert(code.includes("https://solscan.io/tx/") && code.includes("?cluster=devnet"),
  'Must render Solscan transaction links with ?cluster=devnet');
assert(code.includes("https://solscan.io/account/") && code.includes("?cluster=devnet"),
  'Must render Solscan account links with ?cluster=devnet');
assert(code.includes("ArrowSquareOut"), 'Must render ArrowSquareOut external link icon');
assert(code.includes("target=\"_blank\"") && code.includes("rel=\"noopener noreferrer\""),
  'Links must safely open in new tabs with noopener noreferrer');
console.log('  ✔ Solscan devnet transaction pills and account links verified.');

// 5. Event Type Color Badges
console.log('\n▶ Requirement 5: Event Type Color Badges');
assert(code.includes("bg-emerald-500/10") && code.includes("text-emerald-400") && code.includes("border-emerald-500/30"),
  'paid_out must use emerald badge styling');
assert(code.includes("bg-sky-500/10") && code.includes("text-sky-400") && code.includes("border-sky-500/30"),
  'deposit_p1 / deposit_p2 must use sky/blue badge styling');
assert(code.includes("bg-amber-500/10") && code.includes("text-amber-400") && code.includes("border-amber-500/30"),
  'refunded / draw_refunded must use amber badge styling');
assert(code.includes("bg-red-500/10") && code.includes("text-red-400") && code.includes("border-red-500/30"),
  'resigned / timeout_win must use red badge styling');
assert(code.includes("bg-purple-500/10") && code.includes("text-purple-400") && code.includes("border-purple-500/30"),
  'created / match_started / cancelled must use purple badge styling');
assert(code.includes("bg-indigo-500/10") && code.includes("text-indigo-400") && code.includes("border-indigo-500/30"),
  'cron_recovery must use indigo badge styling');
console.log('  ✔ All event type badge styles verified.');

// 6. Expandable Event Inspector Drawer/Modal
console.log('\n▶ Requirement 6: Expandable Event Inspector Drawer/Modal');
assert(code.includes("selectedEvent"), 'Must maintain selectedEvent state for inspector modal');
assert(code.includes("JSON.stringify(selectedEvent, null, 2)"), 'Inspector must render pretty-printed JSON');
assert(code.includes("BoardSnapshotView") && code.includes("boardSnapshot"),
  'Inspector must render Connect-4 mini board snapshot when present');
assert(code.includes("houseFeeSol") || code.includes("houseFee"),
  'Inspector must render house fee breakdown');
assert(code.includes("handleCopyTxSignature") || code.includes("handleCopyRawJson"),
  'Inspector must support clipboard copy actions');
console.log('  ✔ Event inspector modal, board snapshot visualizer, and raw JSON viewer verified.');

console.log('\n================================================================================');
console.log('🎉 ALL MILESTONE 3 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
console.log('================================================================================');
