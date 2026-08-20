import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { PublicKey } from '@solana/web3.js';
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

// Initialize Firebase Admin
try {
  const serviceAccountPath = path.join(process.cwd(), 'service-account-key.json');
  if (fs.existsSync(serviceAccountPath)) {
    const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
    admin.initializeApp({
      credential: (admin as any).credential?.cert(serviceAccount) || (await import('firebase-admin/app')).cert(serviceAccount),
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

// In-memory store for nonces (In production, use Redis or Firestore)
const nonces = new Map<string, string>();

// Generate a random nonce
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
    const message = new TextEncoder().encode(`Sign in to Bobsled.gg with nonce: ${nonce}`);
    const decodeFn = (bs58 as any).decode || (bs58 as any).default?.decode;
    const signatureUint8 = decodeFn(signature);
    const pubKeyUint8 = new PublicKey(publicKey).toBytes();

    const isValid = nacl.sign.detached.verify(message, signatureUint8, pubKeyUint8);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Signature valid, remove nonce
    nonces.delete(publicKey);

    // Create a Custom Token for the frontend to sign in
    let token = null;
    try {
      let uid = publicKey;
      // Try to find if this wallet already has an account to preserve the old UID
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
