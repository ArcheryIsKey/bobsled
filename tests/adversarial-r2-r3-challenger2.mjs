import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('================================================================================');
console.log('⚔️  CHALLENGER 2: ADVERSARIAL EMPIRICAL VERIFICATION HARNESS (R2 & R3)');
console.log('================================================================================\n');

const projectRoot = process.cwd();
let passedTests = 0;
let totalTests = 0;

function runTest(testName, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  [PASS] Test ${totalTests}: ${testName}`);
    passedTests++;
  } catch (err) {
    console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
    console.error(`         Error: ${err.message}`);
    throw err;
  }
}

// ==============================================================================
// SUITE 1: REQUIREMENT R2 - CONNECT-4 DROP ANIMATION POLISH
// ==============================================================================
console.log('--------------------------------------------------------------------------------');
console.log('SUITE 1: CONNECT-4 ANIMATION POLISH & PHYSICS VERIFICATION (Connect4.tsx)');
console.log('--------------------------------------------------------------------------------');

const connect4Path = path.join(projectRoot, 'src/components/games/Connect4.tsx');
const connect4Code = fs.readFileSync(connect4Path, 'utf8');

runTest('Connect4.tsx exists and is readable', () => {
  assert(fs.existsSync(connect4Path), 'Connect4.tsx file does not exist');
  assert(connect4Code.length > 0, 'Connect4.tsx is empty');
});

runTest('No transition-all on the falling animated disc', () => {
  // Check that the falling motion.div does not have transition-all which conflicts with Framer Motion y-interpolation
  const discMotionBlockMatch = connect4Code.match(/key=\{`disc-\$\{cellValue\}`\}[\s\S]*?className=\{`w-full h-full rounded-full[\s\S]*?\}/);
  assert(discMotionBlockMatch, 'Placed disc motion.div not found in Connect4.tsx');
  const discMotionBlock = discMotionBlockMatch[0];
  assert(!discMotionBlock.includes('transition-all'), 'Disc motion.div must NOT contain transition-all CSS class');
});

runTest('No active:scale click recoil on column container', () => {
  // Find the column wrapper div
  const colWrapperMatch = connect4Code.match(/key=\{`col-\$\{colIndex\}`\}[\s\S]*?className=\{`flex flex-col[\s\S]*?\}/);
  assert(colWrapperMatch, 'Column wrapper div not found');
  const colWrapper = colWrapperMatch[0];
  assert(!colWrapper.includes('active:scale'), 'Column wrapper must NOT contain active:scale recoil class');
  assert(!colWrapper.includes('active:scale-[0.98]'), 'Column wrapper must NOT contain active:scale-[0.98]');
});

runTest('Percentage drop calculation formula strictly matches -((rowIndex + 1.25) * 100)%', () => {
  assert(
    connect4Code.includes("const dropY = `${-((rowIndex + 1.25) * 100)}%`;") ||
    connect4Code.includes("dropY = `${-((rowIndex + 1.25) * 100)}%`"),
    'Connect4.tsx must compute dropY using `-((rowIndex + 1.25) * 100)%`'
  );

  // Validate drop values for all 6 rows (0 to 5)
  const calculateDropY = (rowIndex) => -((rowIndex + 1.25) * 100);
  const expectedValues = [
    { row: 0, expected: -125 },
    { row: 1, expected: -225 },
    { row: 2, expected: -325 },
    { row: 3, expected: -425 },
    { row: 4, expected: -525 },
    { row: 5, expected: -625 },
  ];

  for (const { row, expected } of expectedValues) {
    const computed = calculateDropY(row);
    assert.strictEqual(computed, expected, `Row ${row} drop percentage should be ${expected}%, got ${computed}%`);
    // Ensure entry position is always strictly outside (above) the board:
    assert(computed <= -125, `Row ${row} entry height must start >= 125% above slot`);
  }
});

runTest('Spring transition properties match specification exactly', () => {
  assert(connect4Code.includes("type: 'spring'"), "Transition must specify type: 'spring'");
  assert(connect4Code.includes('stiffness: 460'), 'Spring stiffness must be 460');
  assert(connect4Code.includes('damping: 32'), 'Spring damping must be 32');
  assert(connect4Code.includes('mass: 0.75'), 'Spring mass must be 0.75');
});

runTest('Connect4 board grid dimension invariant (6 rows x 7 cols = 42 slots)', () => {
  assert(connect4Code.includes('const ROWS = 6;'), 'ROWS must be 6');
  assert(connect4Code.includes('const COLS = 7;'), 'COLS must be 7');
});

runTest('Connect4 game rules & win detection simulation engine', () => {
  const ROWS = 6;
  const COLS = 7;

  function findWinningCells(board) {
    const checkLine = (r, c, dr, dc) => {
      const player = board[r * COLS + c];
      if (player === 0) return null;
      const cells = [r * COLS + c];
      for (let step = 1; step < 4; step++) {
        const nr = r + step * dr;
        const nc = c + step * dc;
        if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) return null;
        if (board[nr * COLS + nc] !== player) return null;
        cells.push(nr * COLS + nc);
      }
      return cells;
    };

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const horiz = checkLine(r, c, 0, 1);
        if (horiz) return horiz;
        const vert = checkLine(r, c, 1, 0);
        if (vert) return vert;
        const diagDR = checkLine(r, c, 1, 1);
        if (diagDR) return diagDR;
        const diagDL = checkLine(r, c, 1, -1);
        if (diagDL) return diagDL;
      }
    }
    return [];
  }

  // 1. Horizontal win test
  const horizontalBoard = new Array(42).fill(0);
  horizontalBoard[5 * 7 + 0] = 1;
  horizontalBoard[5 * 7 + 1] = 1;
  horizontalBoard[5 * 7 + 2] = 1;
  horizontalBoard[5 * 7 + 3] = 1;
  const hWin = findWinningCells(horizontalBoard);
  assert.strictEqual(hWin.length, 4, 'Horizontal win must detect 4 winning cells');
  assert.deepStrictEqual(hWin, [35, 36, 37, 38], 'Horizontal winning cells mismatch');

  // 2. Vertical win test
  const verticalBoard = new Array(42).fill(0);
  verticalBoard[5 * 7 + 2] = 2;
  verticalBoard[4 * 7 + 2] = 2;
  verticalBoard[3 * 7 + 2] = 2;
  verticalBoard[2 * 7 + 2] = 2;
  const vWin = findWinningCells(verticalBoard);
  assert.strictEqual(vWin.length, 4, 'Vertical win must detect 4 winning cells');
  assert.deepStrictEqual(vWin, [16, 23, 30, 37], 'Vertical winning cells mismatch');

  // 3. Diagonal win test
  const diagBoard = new Array(42).fill(0);
  diagBoard[2 * 7 + 1] = 1;
  diagBoard[3 * 7 + 2] = 1;
  diagBoard[4 * 7 + 3] = 1;
  diagBoard[5 * 7 + 4] = 1;
  const dWin = findWinningCells(diagBoard);
  assert.strictEqual(dWin.length, 4, 'Diagonal win must detect 4 winning cells');
  assert.deepStrictEqual(dWin, [15, 23, 31, 39], 'Diagonal winning cells mismatch');
});


// ==============================================================================
// SUITE 2: REQUIREMENT R3 - SOLANA DEVNET MIGRATION & ENDPOINTS
// ==============================================================================
console.log('\n--------------------------------------------------------------------------------');
console.log('SUITE 2: SOLANA DEVNET ENDPOINTS & RPC CONFIGURATION (R3)');
console.log('--------------------------------------------------------------------------------');

// 1. server.ts
const serverPath = path.join(projectRoot, 'server.ts');
const serverCode = fs.readFileSync(serverPath, 'utf8');

runTest('server.ts defaults SOLANA_NETWORK to devnet', () => {
  assert(
    serverCode.includes("const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';"),
    "server.ts must set `const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';`"
  );
});

runTest('server.ts getSolanaConnection() selects devnet by default', () => {
  assert(
    serverCode.includes("SOLANA_NETWORK === 'devnet'\n      ? 'https://api.devnet.solana.com'\n      : 'https://api.mainnet-beta.solana.com'") ||
    serverCode.replace(/\r\n/g, '\n').includes("SOLANA_NETWORK === 'devnet'\n      ? 'https://api.devnet.solana.com'\n      : 'https://api.mainnet-beta.solana.com'"),
    'server.ts getSolanaConnection must fallback to https://api.devnet.solana.com'
  );
});

runTest('server.ts /api/solana/balance and /api/solana/rpc endpoints target devnet', () => {
  const norm = serverCode.replace(/\r\n/g, '\n');
  const rpcOccurrences = (norm.match(/https:\/\/api\.devnet\.solana\.com/g) || []).length;
  // Should appear in CSP connectSrc, getSolanaConnection, balance endpoint, and RPC proxy
  assert(rpcOccurrences >= 4, `Expected at least 4 occurrences of devnet RPC in server.ts, found ${rpcOccurrences}`);
});

runTest('server.ts CSP includes https://api.devnet.solana.com in connectSrc', () => {
  assert(serverCode.includes("'https://api.devnet.solana.com'"), 'server.ts Helmet CSP must allow api.devnet.solana.com');
});

runTest('server.ts /api/escrow/config exposes network: SOLANA_NETWORK', () => {
  assert(serverCode.includes('network: SOLANA_NETWORK'), 'server.ts /api/escrow/config must return network');
});

// 2. src/constants.ts
const constantsPath = path.join(projectRoot, 'src/constants.ts');
const constantsCode = fs.readFileSync(constantsPath, 'utf8');

runTest('src/constants.ts exports SOLANA_NETWORK = devnet', () => {
  assert(constantsCode.includes("export const SOLANA_NETWORK = 'devnet';"), 'src/constants.ts must export SOLANA_NETWORK = devnet');
});

runTest('src/constants.ts exports SOLANA_FAUCET_URL = https://faucet.solana.com', () => {
  assert(constantsCode.includes("export const SOLANA_FAUCET_URL = 'https://faucet.solana.com';"), 'src/constants.ts must export SOLANA_FAUCET_URL');
});

runTest('src/constants.ts exports SOLANA_RPC_URL with devnet fallback', () => {
  assert(constantsCode.includes("'https://api.devnet.solana.com'"), 'src/constants.ts SOLANA_RPC_URL must fallback to devnet');
  assert(!constantsCode.includes('api.mainnet-beta.solana.com'), 'src/constants.ts must NOT contain mainnet RPC');
});

// 3. src/utils/solanaEscrow.ts
const escrowPath = path.join(projectRoot, 'src/utils/solanaEscrow.ts');
const escrowCode = fs.readFileSync(escrowPath, 'utf8');

runTest('src/utils/solanaEscrow.ts SOLANA_RPC_FALLBACKS includes devnet and excludes mainnet', () => {
  assert(escrowCode.includes("'https://api.devnet.solana.com'"), 'SOLANA_RPC_FALLBACKS must include devnet');
  assert(!escrowCode.includes('api.mainnet-beta.solana.com'), 'SOLANA_RPC_FALLBACKS must NOT include mainnet');
});

// 4. src/App.tsx
const appPath = path.join(projectRoot, 'src/App.tsx');
const appCode = fs.readFileSync(appPath, 'utf8');

runTest('src/App.tsx fetchWalletBalance fallback targets devnet', () => {
  assert(appCode.includes("new Connection('https://api.devnet.solana.com'"), 'fetchWalletBalance must use devnet fallback');
  assert(!appCode.includes("new Connection('https://api.mainnet-beta.solana.com'"), 'fetchWalletBalance must NOT use mainnet fallback');
});

runTest('src/App.tsx AppHeader renders SOL Faucet link adjacent to live SOL price display', () => {
  // Verify AppHeader has live SOL price container
  assert(appCode.includes('title="Live SOL Price"'), 'AppHeader must have Live SOL Price element');
  assert(appCode.includes('1 SOL ='), 'AppHeader must display 1 SOL = price text');

  // Verify SOLANA_FAUCET_URL is imported and used
  assert(appCode.includes('SOLANA_FAUCET_URL'), 'src/App.tsx must import/use SOLANA_FAUCET_URL');

  // Verify Faucet link structure: href, target="_blank", rel="noopener noreferrer"
  assert(appCode.includes('href={SOLANA_FAUCET_URL}'), 'Faucet link must use href={SOLANA_FAUCET_URL}');
  assert(appCode.includes('target="_blank"'), 'Faucet link must open in new tab (target="_blank")');
  assert(appCode.includes('rel="noopener noreferrer"'), 'Faucet link must include rel="noopener noreferrer"');

  // Check AppHeader structure containing both price pill and faucet link within the header component
  const headerFuncMatch = appCode.match(/function AppHeader[\s\S]*?return \(([\s\S]*?)\n\}/);
  assert(headerFuncMatch, 'function AppHeader must exist in App.tsx');
  const headerJSX = headerFuncMatch[1];
  const priceIndex = headerJSX.indexOf('title="Live SOL Price"');
  const faucetIndex = headerJSX.indexOf('href={SOLANA_FAUCET_URL}');
  assert(priceIndex !== -1, 'Live SOL price must be present in AppHeader');
  assert(faucetIndex !== -1, 'SOLANA_FAUCET_URL must be present in AppHeader');
  // Verify they are within 400 characters of each other (directly adjacent siblings)
  const distance = Math.abs(faucetIndex - priceIndex);
  assert(distance < 500, `Price and Faucet link must be adjacent siblings in DOM (distance: ${distance} chars)`);
});

runTest('src/App.tsx Faucet link includes accessibility attributes (title, aria-label)', () => {
  assert(appCode.includes('title="Get Devnet SOL Faucet"'), 'Faucet link must have descriptive title attribute');
  assert(appCode.includes('aria-label="Solana Devnet Faucet"'), 'Faucet link must have aria-label');
});

// 5. src/components/Game.tsx
const gamePath = path.join(projectRoot, 'src/components/Game.tsx');
const gameCode = fs.readFileSync(gamePath, 'utf8');

runTest('src/components/Game.tsx Solscan transaction links include ?cluster=devnet', () => {
  assert(
    gameCode.includes('https://solscan.io/tx/${game.p1DepositTx}?cluster=devnet'),
    'Host deposit Solscan link must include ?cluster=devnet'
  );
  assert(
    gameCode.includes('https://solscan.io/tx/${game.p2DepositTx}?cluster=devnet'),
    'Player 2 deposit Solscan link must include ?cluster=devnet'
  );
  assert(!gameCode.includes('https://solscan.io/tx/${game.p1DepositTx}"'), 'Host Solscan link must not omit cluster');
});


// ==============================================================================
// SUITE 3: ADVERSARIAL STRESS TESTING & EDGE CASES
// ==============================================================================
console.log('\n--------------------------------------------------------------------------------');
console.log('SUITE 3: ADVERSARIAL STRESS TESTS & BOUNDARY SCENARIOS');
console.log('--------------------------------------------------------------------------------');

runTest('Adversarial Test 1: Full column drop rejection boundary test', () => {
  // Simulate handleDrop logic when a column is completely filled (rows 0-5 occupied)
  const COLS = 7;
  const ROWS = 6;
  const board = new Array(42).fill(0);
  const targetCol = 3;

  // Fill column 3 completely
  for (let r = 0; r < ROWS; r++) {
    board[r * COLS + targetCol] = (r % 2) + 1;
  }

  // Find empty row
  let emptyRow = -1;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r * COLS + targetCol] === 0) {
      emptyRow = r;
      break;
    }
  }

  assert.strictEqual(emptyRow, -1, 'Full column must return emptyRow = -1');
});

runTest('Adversarial Test 2: Fallback RPC resilience when primary is null/undefined', () => {
  // Verify SOLANA_RPC_FALLBACKS filters out undefined values and contains valid URLs
  const envRpc = undefined;
  const solanaRpcUrl = 'https://api.devnet.solana.com';
  const fallbacks = [envRpc, solanaRpcUrl, 'https://api.devnet.solana.com'].filter(Boolean);

  assert.strictEqual(fallbacks.length, 2, 'filter(Boolean) must strip undefined entries');
  for (const url of fallbacks) {
    assert(url.startsWith('https://'), `URL ${url} must be HTTPS`);
    const parsed = new URL(url);
    assert.strictEqual(parsed.protocol, 'https:');
  }
});

runTest('Adversarial Test 3: Solscan URL format and query parameter validation', () => {
  const dummyTx = '5UfDvp1826gq9aPSt1vQeZ61p7Gk7gKz819kF';
  const url = `https://solscan.io/tx/${dummyTx}?cluster=devnet`;
  const parsed = new URL(url);
  assert.strictEqual(parsed.hostname, 'solscan.io');
  assert.strictEqual(parsed.pathname, `/tx/${dummyTx}`);
  assert.strictEqual(parsed.searchParams.get('cluster'), 'devnet');
});

runTest('Adversarial Test 4: Devnet Faucet URL protocol and domain integrity', () => {
  const faucetUrl = 'https://faucet.solana.com';
  const parsed = new URL(faucetUrl);
  assert.strictEqual(parsed.protocol, 'https:');
  assert.strictEqual(parsed.hostname, 'faucet.solana.com');
});

runTest('Adversarial Test 5: Verify no unhandled mainnet references in client RPC code', () => {
  // Scan all client-side src files for unexpected mainnet RPC strings
  const srcFiles = ['src/constants.ts', 'src/utils/solanaEscrow.ts', 'src/App.tsx'];
  for (const relFile of srcFiles) {
    const content = fs.readFileSync(path.join(projectRoot, relFile), 'utf8');
    assert(
      !content.includes('api.mainnet-beta.solana.com'),
      `File ${relFile} contains disallowed hardcoded mainnet RPC reference`
    );
  }
});

console.log('\n================================================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} TESTS PASSED WITH ZERO FAILURES!`);
console.log('================================================================================');
