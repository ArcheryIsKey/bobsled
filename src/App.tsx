import { useEffect, useState, useRef } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, writeBatch, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { useGameStore } from './store';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import Dashboard from './components/Dashboard';
import Game from './components/Game';
import Profile from './components/Profile';
import WelcomeScreen from './components/WelcomeScreen';
import SetUsernameScreen from './components/SetUsernameScreen';
import { Shield, User } from 'lucide-react';

function AppHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { user, solBalance } = useGameStore();

  const handleLogout = async () => {
    await signOut(auth);
    disconnect();
    navigate('/');
  };

  const handleClearDatabase = async () => {
    if (!user || user.walletAddress !== '11111111111111111111111111111111') return;
    if (!confirm('Are you sure you want to clear all data? This cannot be undone.')) return;
    try {
      const { collection, getDocs, deleteDoc } = await import('firebase/firestore');
      const usersSnap = await getDocs(collection(db, 'users'));
      const gamesSnap = await getDocs(collection(db, 'games'));
      const usernamesSnap = await getDocs(collection(db, 'usernames'));

      const promises: any[] = [];
      usersSnap.forEach((d) => promises.push(deleteDoc(d.ref)));
      gamesSnap.forEach((d) => promises.push(deleteDoc(d.ref)));
      usernamesSnap.forEach((d) => promises.push(deleteDoc(d.ref)));

      await Promise.all(promises);
      alert('Database cleared.');
      window.location.reload();
    } catch (e) {
      console.error(e);
      alert('Failed to clear database.');
    }
  };

  const isLobby = location.pathname === '/';
  const isProfile = location.pathname.startsWith('/profile');

  return (
    <header className="bg-surface-elevated/80 backdrop-blur-lg border-b border-white/10 sticky top-0 z-50">
      <div className="flex justify-between items-center w-full px-4 md:px-8 max-w-6xl mx-auto h-16">
        
        {/* Left: Logo & Navigation */}
        <div className="flex items-center gap-8">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-headline-lg text-2xl font-bold text-velocity-red tracking-tight hover:opacity-90 transition-opacity"
          >
            <img src="/logo.jpg" alt="bobsled.gg logo" className="w-8 h-8 mix-blend-screen" />
            <span>bobsled.gg</span>
          </Link>

          {user && (
            <nav className="hidden md:flex items-center space-x-2">
              <Link
                to="/"
                className={`text-xs px-3 py-1.5 rounded-md font-semibold tracking-wide transition-all ${
                  isLobby
                    ? 'text-white bg-white/10'
                    : 'text-text-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                Lobby
              </Link>
              <Link
                to="/profile"
                className={`text-xs px-3 py-1.5 rounded-md font-semibold tracking-wide transition-all ${
                  isProfile
                    ? 'text-white bg-white/10'
                    : 'text-text-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                Profile
              </Link>
            </nav>
          )}
        </div>

        {/* Right: Balance & User Actions */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          {/* Admin Tools */}
          {user?.walletAddress === '11111111111111111111111111111111' && (
            <button
              onClick={handleClearDatabase}
              className="hidden sm:flex items-center gap-1 text-[11px] uppercase tracking-wider px-2.5 py-1 bg-red-900/20 border border-red-900/50 text-red-400 hover:bg-red-900/40 transition-colors rounded-md"
            >
              <Shield size={12} /> Admin
            </button>
          )}

          {!publicKey ? (
            <button
              onClick={() => setVisible(true)}
              className="text-xs text-white bg-velocity-red rounded-md px-4 py-2 hover:bg-red-600 transition-colors font-semibold shadow-[0_0_15px_rgba(255,77,77,0.3)] tracking-wide"
            >
              Connect Wallet
            </button>
          ) : (
            <div className="flex items-center gap-3">
              {/* SOL Balance (No 'Balance' word) */}
              {user && (
                <div className="text-xs font-mono font-bold text-text-primary px-3 py-1.5 rounded-md bg-surface-container border border-white/10 flex items-center gap-1.5 shadow-inner">
                  <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-velocity-red">
                    {solBalance !== null ? `${solBalance.toFixed(3)} SOL` : '...'}
                  </span>
                </div>
              )}

              {/* Profile Link Pill */}
              <Link
                to="/profile"
                className="flex items-center gap-2 p-1 sm:pr-3 rounded-full sm:rounded-lg bg-surface-base hover:bg-surface-elevated border border-white/10 hover:border-velocity-red transition-all group"
                title="View Profile"
              >
                <div className="w-7 h-7 rounded-full overflow-hidden border border-white/10 group-hover:border-velocity-red bg-surface-container flex items-center justify-center font-bold text-xs text-velocity-red transition-colors shrink-0">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                  ) : (
                    user?.username ? user.username.substring(0, 2).toUpperCase() : <User size={13} />
                  )}
                </div>
                <span className="hidden sm:block text-xs font-semibold text-text-primary group-hover:text-velocity-red transition-colors">
                  {user?.username || 'Connecting...'}
                </span>
              </Link>

              {/* Exit Button */}
              <button
                onClick={handleLogout}
                className="text-xs px-2.5 py-1.5 border border-white/10 hover:bg-surface-variant text-text-secondary hover:text-white transition-colors rounded-md font-medium"
              >
                Exit
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

function MainContent({
  isAuthenticating,
  needsUsername,
  usernameError,
  authError,
  handleSetUsername,
  disconnect,
}: any) {
  const { publicKey } = useWallet();
  const { user } = useGameStore();

  if (!publicKey) {
    return <WelcomeScreen />;
  }

  if (isAuthenticating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh]">
        <div className="w-8 h-8 border-2 border-velocity-red/30 border-t-velocity-red rounded-full animate-spin mb-4" />
        <p className="text-xs uppercase tracking-wider text-text-muted">Authenticating Signature...</p>
      </div>
    );
  }

  if (needsUsername) {
    return (
      <SetUsernameScreen
        onSubmit={handleSetUsername}
        isSubmitting={isAuthenticating}
        error={usernameError}
      />
    );
  }

  if (authError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] px-4">
        <div className="border border-red-900/50 bg-red-900/10 text-red-400 p-8 max-w-md text-center rounded-xl shadow-2xl space-y-4">
          <p className="text-sm font-bold uppercase tracking-wider">Authentication Error</p>
          <p className="text-xs text-text-secondary font-mono">{authError}</p>
          <button
            onClick={() => disconnect()}
            className="px-5 py-2 bg-red-900/30 border border-red-900 text-xs font-semibold uppercase tracking-wider hover:bg-red-900/50 transition-colors rounded-md text-white"
          >
            Disconnect &amp; Retry
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh]">
        <div className="w-8 h-8 border-2 border-velocity-red/30 border-t-velocity-red rounded-full animate-spin mb-4" />
        <p className="text-xs uppercase tracking-wider text-text-muted">Loading Account...</p>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/profile/:userId" element={<Profile />} />
      <Route path="/game/:gameId" element={<Game />} />
      <Route path="/watch/:gameId" element={<Game />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const { publicKey, signMessage, disconnect } = useWallet();
  const { connection } = useConnection();
  const { user, setUser, setSolBalance } = useGameStore();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Fetch live SOL balance from Solana connection RPC
  useEffect(() => {
    if (!publicKey || !connection) {
      setSolBalance(null);
      return;
    }

    let active = true;
    const fetchBalance = async () => {
      try {
        const lamports = await connection.getBalance(publicKey);
        if (active) {
          setSolBalance(lamports / LAMPORTS_PER_SOL);
        }
      } catch (err) {
        console.error('Error fetching SOL balance:', err);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 10000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [publicKey, connection, setSolBalance]);

  // Firebase Auth state listener
  useEffect(() => {
    let unsubUser: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setAuthInitialized(true);

      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }

      if (!firebaseUser) {
        setUser(null);
        return;
      }

      const userRef = doc(db, 'users', firebaseUser.uid);
      unsubUser = onSnapshot(
        userRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const userData = snapshot.data() as any;
            setUser({ id: snapshot.id, ...userData });
          }
        },
        (error) => {
          if ((error as any).code === 'permission-denied') return;
          handleFirestoreError(error, OperationType.GET, 'users');
        }
      );
    });

    return () => {
      unsubscribe();
      if (unsubUser) unsubUser();
    };
  }, [setUser]);

  const authInProgress = useRef(false);

  useEffect(() => {
    const authenticate = async () => {
      if (!publicKey || !signMessage) return;
      if (authInProgress.current) return;

      if (auth.currentUser && user?.walletAddress === publicKey.toBase58()) {
        return;
      }

      authInProgress.current = true;
      setIsAuthenticating(true);
      setAuthError(null);

      try {
        const nonceRes = await fetch('/api/auth/nonce', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicKey: publicKey.toBase58() }),
        });

        if (!nonceRes.ok) {
          throw new Error('Failed to get nonce from server');
        }

        const { nonce } = await nonceRes.json();

        const message = new TextEncoder().encode(
          `Sign in to bobsled.gg\n\nNonce: ${nonce}`
        );
        let signatureBytes;
        try {
          signatureBytes = await signMessage(message);
        } catch (e) {
          throw new Error('Signature request cancelled.');
        }

        const encodeFn = (bs58 as any).encode || (bs58 as any).default?.encode;
        const signature = encodeFn(signatureBytes);

        const verifyRes = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            publicKey: publicKey.toBase58(),
            signature,
          }),
        });

        if (!verifyRes.ok) {
          const errData = await verifyRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Verification failed on server');
        }

        const data = await verifyRes.json();
        let currentUser;

        if (data.token) {
          const { signInWithCustomToken } = await import('firebase/auth');
          const userCredential = await signInWithCustomToken(auth, data.token);
          currentUser = userCredential.user;
        } else {
          const { signInAnonymously } = await import('firebase/auth');
          const userCredential = await signInAnonymously(auth);
          currentUser = userCredential.user;
        }

        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
          setNeedsUsername(true);
        } else {
          await updateDoc(userDocRef, {
            walletAddress: publicKey.toBase58(),
          });
          setNeedsUsername(false);
        }
      } catch (err: any) {
        console.error('Auth error:', err);
        setAuthError(err.message || 'Failed to authenticate');
        disconnect();
      } finally {
        authInProgress.current = false;
        setIsAuthenticating(false);
      }
    };

    if (publicKey) {
      authenticate();
    } else {
      setNeedsUsername(false);
    }
  }, [publicKey, signMessage, disconnect, user?.walletAddress, authInitialized]);

  const handleSetUsername = async (username: string, avatarUrl?: string) => {
    setIsAuthenticating(true);
    setUsernameError(null);
    try {
      const usernameRef = doc(db, 'usernames', username.toLowerCase());
      const usernameSnap = await getDoc(usernameRef);
      if (usernameSnap.exists()) {
        throw new Error('This username is already taken. Please choose another.');
      }

      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');
      if (!publicKey) throw new Error('Wallet not connected');

      const batch = writeBatch(db);
      batch.set(usernameRef, { uid: currentUser.uid });

      const userData: any = {
        walletAddress: publicKey.toBase58(),
        username: username,
        createdAt: serverTimestamp(),
      };

      if (avatarUrl) {
        userData.avatarUrl = avatarUrl;
      }

      batch.set(doc(db, 'users', currentUser.uid), userData);
      await batch.commit();
      setNeedsUsername(false);
    } catch (e: any) {
      setUsernameError(e.message || 'Failed to set username');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen bg-background text-text-primary font-sans selection:bg-velocity-red selection:text-text-primary antialiased">
        <AppHeader />
        <main className="flex flex-1 w-full relative z-10">
          <MainContent
            isAuthenticating={isAuthenticating}
            needsUsername={needsUsername}
            usernameError={usernameError}
            authError={authError}
            handleSetUsername={handleSetUsername}
            disconnect={disconnect}
          />
        </main>
      </div>
    </BrowserRouter>
  );
}
