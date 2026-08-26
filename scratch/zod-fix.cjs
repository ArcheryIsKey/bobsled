const fs = require('fs');
let serverFile = fs.readFileSync('server.ts', 'utf8');

if (!serverFile.includes("import { z } from 'zod';")) {
  serverFile = "import { z } from 'zod';\n" + serverFile;
}

serverFile = serverFile.replace(
  /app\.post\('\/api\/cron\/recover', async \(req, res\) => \{\s+try \{/,
  `app.post('/api/cron/recover', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!process.env.CRON_SECRET || authHeader !== \\\`Bearer \${process.env.CRON_SECRET}\\\`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {`
);

serverFile = serverFile.replace(
  /function generateNonce\(\) \{\s+return Math\.floor\(Math\.random\(\) \* 1000000\)\.toString\(\);\s+\}/,
  `const crypto = require('crypto');\nfunction generateNonce() {\n  return crypto.randomBytes(32).toString('base64url');\n}`
);

serverFile = serverFile.replace(
  /app\.post\('\/api\/solana\/rpc', async \(req, res\) => \{/,
  `const RpcSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string().max(50), z.number()]).optional(),
  method: z.string().min(1).max(50),
  params: z.array(z.any()).max(10).optional(),
}).strict();
app.post('/api/solana/rpc', async (req, res) => {
  const parseResult = RpcSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: req.body?.id || null });
  }`
);

serverFile = serverFile.replace(
  /app\.post\('\/api\/auth\/nonce', \(req, res\) => \{\s+const \{ publicKey \} = req\.body;\s+if \(!publicKey\) \{\s+return res\.status\(400\)\.json\(\{ error: 'Public key is required' \}\);\s+\}/,
  `const NonceSchema = z.object({ publicKey: z.string().min(32).max(44) }).strict();
app.post('/api/auth/nonce', (req, res) => {
  const parseResult = NonceSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.errors });
  }
  const { publicKey } = parseResult.data;`
);

serverFile = serverFile.replace(
  /app\.post\('\/api\/auth\/verify', async \(req, res\) => \{\s+try \{\s+const \{ signature, publicKey \} = req\.body;/,
  `const VerifySchema = z.object({ signature: z.array(z.number()).max(128), publicKey: z.string().min(32).max(44) }).strict();
app.post('/api/auth/verify', async (req, res) => {
  try {
    const parseResult = VerifySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.errors });
    }
    const { signature, publicKey } = parseResult.data;`
);

serverFile = serverFile.replace(
  /app\.get\('\/api\/solana\/balance', async \(req, res\) => \{\s+try \{\s+const \{ publicKey \} = req\.query;\s+if \(!publicKey \|\| typeof publicKey !== 'string'\) \{\s+return res\.status\(400\)\.json\(\{ error: 'Public key is required' \}\);\s+\}/,
  `app.get('/api/solana/balance', async (req, res) => {
  try {
    const publicKey = req.query.publicKey as string;
    if (!publicKey || typeof publicKey !== 'string' || publicKey.length < 32 || publicKey.length > 44) {
      return res.status(400).json({ error: 'Valid public key is required' });
    }`
);

serverFile = serverFile.replace(
  /app\.post\('\/api\/escrow\/verify-deposit', async \(req, res\) => \{\s+try \{\s+const \{ gameId, role, txHash, senderWallet, userId, username, avatarUrl \} = req\.body;/,
  `const VerifyDepositSchema = z.object({
  gameId: z.string().min(1).max(50),
  role: z.enum(['player1', 'player2']),
  txHash: z.string().min(40).max(100),
  senderWallet: z.string().min(32).max(44),
  userId: z.string().max(50).optional(),
  username: z.string().max(50).optional(),
  avatarUrl: z.string().max(500).optional(),
}).strict();
app.post('/api/escrow/verify-deposit', async (req, res) => {
  try {
    const parseResult = VerifyDepositSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({ error: 'Invalid payload', details: parseResult.error.errors });
    }
    const { gameId, role, txHash, senderWallet, userId, username, avatarUrl } = parseResult.data;`
);

serverFile = serverFile.replace(
  /app\.post\('\/api\/escrow\/settle', async \(req, res\) => \{\s+try \{\s+const \{ gameId \} = req\.body;/,
  `const SettleSchema = z.object({ gameId: z.string().min(1).max(50) }).strict();
app.post('/api/escrow/settle', async (req, res) => {
  try {
    const parseResult = SettleSchema.safeParse(req.body);
    if (!parseResult.success) return res.status(400).json({ error: 'Invalid payload' });
    const { gameId } = parseResult.data;`
);

serverFile = serverFile.replace(
  /app\.post\('\/api\/escrow\/refund-cancel', async \(req, res\) => \{\s+try \{\s+const \{ gameId, userId \} = req\.body;/,
  `const RefundSchema = z.object({ gameId: z.string().min(1).max(50), userId: z.string().min(1).max(50) }).strict();
app.post('/api/escrow/refund-cancel', async (req, res) => {
  try {
    const parseResult = RefundSchema.safeParse(req.body);
    if (!parseResult.success) return res.status(400).json({ error: 'Invalid payload' });
    const { gameId, userId } = parseResult.data;`
);

fs.writeFileSync('server.ts', serverFile);
console.log('Fixed server.ts successfully');
