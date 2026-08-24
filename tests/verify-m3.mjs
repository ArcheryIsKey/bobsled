import fs from 'fs';
import path from 'path';
import assert from 'assert';

console.log('--- Verifying Milestone M3: Solana Devnet Migration & SOL Faucet ---');

const projectRoot = process.cwd();

// 1. Check server.ts
const serverContent = fs.readFileSync(path.join(projectRoot, 'server.ts'), 'utf8');
assert(serverContent.includes("const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';"),
  "server.ts must set SOLANA_NETWORK default to 'devnet'");
assert(serverContent.replace(/\r\n/g, '\n').includes("SOLANA_NETWORK === 'devnet'\n      ? 'https://api.devnet.solana.com'\n      : 'https://api.mainnet-beta.solana.com'"),
  "server.ts must fallback balance & rpc to devnet when SOLANA_NETWORK is devnet");
console.log('✓ server.ts correctly defaults to devnet and devnet RPC fallback');

// 2. Check src/constants.ts
const constantsContent = fs.readFileSync(path.join(projectRoot, 'src/constants.ts'), 'utf8');
assert(constantsContent.includes("export const SOLANA_NETWORK = 'devnet';"),
  "src/constants.ts must export SOLANA_NETWORK = 'devnet'");
assert(constantsContent.includes("export const SOLANA_FAUCET_URL = 'https://faucet.solana.com';"),
  "src/constants.ts must export SOLANA_FAUCET_URL = 'https://faucet.solana.com'");
assert(constantsContent.includes("https://api.devnet.solana.com"),
  "src/constants.ts SOLANA_RPC_URL must fallback to devnet");
console.log('✓ src/constants.ts correctly exports devnet constants and faucet URL');

// 3. Check src/utils/solanaEscrow.ts
const escrowContent = fs.readFileSync(path.join(projectRoot, 'src/utils/solanaEscrow.ts'), 'utf8');
assert(escrowContent.includes("'https://api.devnet.solana.com'"),
  "src/utils/solanaEscrow.ts must include devnet in SOLANA_RPC_FALLBACKS");
assert(!escrowContent.includes("'https://api.mainnet-beta.solana.com'"),
  "src/utils/solanaEscrow.ts must not have hardcoded mainnet-beta fallback");
console.log('✓ src/utils/solanaEscrow.ts correctly targets devnet in fallback RPCs');

// 4. Check src/App.tsx
const appContent = fs.readFileSync(path.join(projectRoot, 'src/App.tsx'), 'utf8');
assert(appContent.includes("new Connection('https://api.devnet.solana.com'"),
  "src/App.tsx fetchWalletBalance must use devnet connection fallback");
assert(!appContent.includes("new Connection('https://api.mainnet-beta.solana.com'"),
  "src/App.tsx fetchWalletBalance must not use mainnet-beta fallback");
assert(appContent.includes("href={SOLANA_FAUCET_URL}") && appContent.includes('target="_blank"') && appContent.includes('rel="noopener noreferrer"'),
  "src/App.tsx AppHeader must render Faucet link pointing to SOLANA_FAUCET_URL with target=_blank");
assert(appContent.includes("title=\"Get Devnet SOL Faucet\"") || appContent.includes("aria-label=\"Solana Devnet Faucet\""),
  "src/App.tsx AppHeader faucet link must have accessible title or aria-label");
console.log('✓ src/App.tsx correctly uses devnet balance fallback and renders accessible Faucet link in header');

// 5. Check src/components/Game.tsx
const gameContent = fs.readFileSync(path.join(projectRoot, 'src/components/Game.tsx'), 'utf8');
assert(gameContent.includes("${game.p1DepositTx}?cluster=devnet"),
  "src/components/Game.tsx Host deposit link must include ?cluster=devnet");
assert(gameContent.includes("${game.p2DepositTx}?cluster=devnet"),
  "src/components/Game.tsx Player 2 deposit link must include ?cluster=devnet");
console.log('✓ src/components/Game.tsx correctly appends ?cluster=devnet to Solscan links');

console.log('\nAll M3 verification checks PASSED successfully!');
