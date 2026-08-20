import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { PublicKey, Connection, LAMPORTS_PER_SOL } from '@solana/web3.js';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import fs from 'fs';
import admin from 'firebase-admin';

let firebaseConfig = null;
try {
  firebaseConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'firebase-applet-config.json'), 'utf8'));
} catch (e) {
  console.warn('Could not read firebase-applet-config.json');
}

import { cert } from 'firebase-admin/app';

// Initialize Firebase Admin
try {
  const serviceAccountPath = path.join(process.cwd(), 'service-account-key.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: cert(serviceAccount),
      projectId: firebaseConfig?.projectId
    });
  } else if (firebaseConfig && firebaseConfig.projectId) {
    admin.initializeApp({ projectId: firebaseConfig.projectId });
  } else {
    admin.initializeApp();
  }
} catch (e) {
  console.error('Firebase Admin initialization failed:', e);
}

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// In-memory store for nonces
const nonces = new Map<string, string>();

function generateNonce() {
  return Math.floor(Math.random() * 1000000).toString();
}

app.post('/api/auth/nonce', (req, res) => {
  const { publicKey } = req.body;
  if (!publicKey) {
    return res.status(400).json({ error: 'Public key is required' });
  }
  const nonce = generateNonce();
  nonces.set(publicKey, nonce);
  res.json({ nonce });
});

app.post('/api/auth/verify', async (req, res) => {
  const { publicKey, signature } = req.body;
  if (!publicKey || !signature) {
    return res.status(400).json({ error: 'Missing parameters' });
  }

  const nonce = nonces.get(publicKey);
  if (!nonce) {
    return res.status(400).json({ error: 'Nonce not found or expired' });
  }

  try {
    const message = new TextEncoder().encode(`Sign in to bobsled.gg\n\nNonce: ${nonce}`);
    const decodeFn = (bs58 as any).decode || (bs58 as any).default?.decode;
    const signatureUint8 = decodeFn(signature);
    const pubKeyUint8 = new PublicKey(publicKey).toBytes();

    const isValid = nacl.sign.detached.verify(message, signatureUint8, pubKeyUint8);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    nonces.delete(publicKey);

    let token = null;
    try {
      let uid = publicKey;
      const { getFirestore } = await import('firebase-admin/firestore');
      const { getAuth } = await import('firebase-admin/auth');
      
      const db = getFirestore();
      const snapshot = await db.collection('users').where('walletAddress', '==', publicKey).limit(1).get();
      if (!snapshot.empty) {
        uid = snapshot.docs[0].id;
      }
      token = await getAuth().createCustomToken(uid);
    } catch (tokenErr) {
      console.error('Failed to create custom token:', tokenErr);
      return res.status(500).json({ error: 'Failed to create auth token' });
    }

    res.json({ success: true, token });
  } catch (error) {
    console.error('Auth verification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// High-reliability Solana balance lookup with multi-RPC fallback
app.get('/api/solana/balance', async (req, res) => {
  const { wallet } = req.query;
  if (!wallet || typeof wallet !== 'string') {
    return res.status(400).json({ error: 'Missing wallet query parameter' });
  }

  const rpcEndpoints = [
    'https://api.mainnet-beta.solana.com',
    'https://rpc.ankr.com/solana',
    'https://solana.public-rpc.com',
  ];

  for (const rpc of rpcEndpoints) {
    try {
      const conn = new Connection(rpc, 'confirmed');
      const lamports = await conn.getBalance(new PublicKey(wallet));
      const sol = lamports / LAMPORTS_PER_SOL;
      return res.json({ success: true, balance: sol, sol, lamports });
    } catch (e: any) {
      console.warn(`RPC ${rpc} balance query failed:`, e?.message);
    }
  }

  res.status(500).json({ error: 'Failed to query balance from Solana network' });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
