import { useEffect, useState, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { signOut, onAuthStateChanged, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot, getDoc, updateDoc, writeBatch, serverTimestamp, getDocs, query, collection, where, deleteDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { useGameStore } from './store';
import { LAMPORTS_PER_SOL, Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import Dashboard from './components/Dashboard';
import Game from './components/Game';
import Profile from './components/Profile';
import AdminPanel from './components/AdminPanel';
import WelcomeScreen from './components/WelcomeScreen';
import SetUsernameScreen from './components/SetUsernameScreen';
import UserProfileModal from './components/UserProfileModal';
import SolAmount from './components/SolAmount';
import ToastContainer from './components/Toast';
import { useSolPrice } from './utils/solPrice';
import { OWNER_WALLET, SOLANA_FAUCET_URL } from './constants';
import { logError, logWarn } from './utils/logger';
import { Shield, User, Flask, Drop, ArrowSquareOut, Crown } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';
import { RouteErrorBoundary, ComponentErrorBoundary } from './components/common/ErrorBoundary';
import ConnectionStatusBanner from './components/common/ConnectionStatusBanner';

async function cleanupGuestUserGames(guestUserId: string) {
  try {
    const waitingSnap = await getDocs(
      query(collection(db, 'games'), where('player1', '==', guestUserId), where('status', '==', 'waiting'))
    );
    for (const gDoc of waitingSnap.docs) {
      await deleteDoc(gDoc.ref);
    }

    const activeSnap1 = await getDocs(
      query(collection(db, 'games'), where('player1', '==', guestUserId), where('status', '==', 'active'))
    );
    for (const gDoc of activeSnap1.docs) {
      const g = gDoc.data() as any;
      await updateDoc(gDoc.ref, {
        status: 'finished',
        winner: g.player2,
        updatedAt: serverTimestamp(),
      });
    }

    const activeSnap2 = await getDocs(
      query(collection(db, 'games'), where('player2', '==', guestUserId), where('status', '==', 'active'))
    );
    for (const gDoc of activeSnap2.docs) {
      const g = gDoc.data() as any;
      await updateDoc(gDoc.ref, {
        status: 'finished',
        winner: g.player1,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    logWarn('Guest cleanup notice:', err);
  }
}


function AppHeader({ onOpenProfileModal }: { onOpenProfileModal: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { user, setUser, solBalance } = useGameStore();
  const { price: currentSolPrice } = useSolPrice();

  const handleLogout = async () => {
    localStorage.removeItem('bobsled_auth_wallet');
    if (user?.isTestUser && user.id) {
      await cleanupGuestUserGames(user.id);
    }
    try {
      await signOut(auth);
    } catch (e) {
      logError('Logout error:', e);
    }
    disconnect();
    setUser(null);
    navigate('/');
  };

  const isOwner = user?.role === 'owner' || (!!OWNER_WALLET && user?.walletAddress === OWNER_WALLET);
  const isAdmin = isOwner || user?.isAdmin || user?.role === 'admin';
  const isLobby = location.pathname === '/';
  const isAdminRoute = location.pathname === '/admin';
  const userDisplayName = user?.isTestUser ? (user?.username || 'Guest') : `@${user?.username || 'Player'}`;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full px-4 sm:px-6 md:px-8 pt-4 pb-2 pointer-events-none transition-all">
      <div className="max-w-6xl mx-auto pointer-events-auto bg-black/60 backdrop-blur-2xl border border-white/10 rounded-full px-4 sm:px-6 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex items-center justify-between gap-4 relative">
        
        {/* Left: Logo */}
        <div className="flex items-center shrink-0">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-display text-xl sm:text-2xl font-bold text-white tracking-tight hover:opacity-80 transition-opacity cursor-pointer group"
          >
            <img
              src="/logo.jpg"
              alt="bobsled.gg"
              className="w-8 h-8 rounded-full object-cover group-hover:scale-105 transition-transform border border-white/10"
            />
            <span>bobsled<span className="text-primary">.gg</span></span>
          </Link>
        </div>

        {/* Center: Navigation (Flex Centered to prevent overlap) */}
        {user && (
          <div className="hidden md:flex flex-1 items-center justify-center px-2">
            <nav className="flex items-center space-x-2 bg-white/5 p-1 rounded-full border border-white/10 shadow-inner">
              <Link
                to="/"
                className={`text-sm px-6 py-2 rounded-full font-bold uppercase tracking-widest transition-all cursor-pointer ${
                  isLobby
                    ? 'text-white bg-white/10 shadow-sm'
                    : 'text-text-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                Lobby
              </Link>
              {isAdmin && (
                <Link
                  to="/admin"
                  className={`text-sm px-6 py-2 rounded-full font-bold uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer ${
                    isAdminRoute
                      ? 'text-primary bg-primary/10 border border-primary/20'
                      : 'text-text-secondary hover:text-primary hover:bg-white/5'
                  }`}
                >
                  <Shield size={16} weight="fill" />
                  <span>Admin</span>
                </Link>
              )}
            </nav>
          </div>
        )}

        {/* Right: Balance & User Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          {isAdmin && (
            <Link
              to="/admin"
              className="md:hidden flex items-center gap-1 text-xs uppercase tracking-widest px-4 py-2 bg-primary/10 border border-primary/20 text-primary rounded-full font-bold cursor-pointer"
            >
              Admin
            </Link>
          )}

          <div className="hidden lg:flex items-center gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-white/70 px-4 py-2 rounded-full bg-white/5 border border-white/10 whitespace-nowrap shrink-0" title="Live SOL Price">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span>1 SOL = <span className="text-white">${currentSolPrice ? currentSolPrice.toFixed(2) : '---'}</span></span>
            </div>

            <a
              href={SOLANA_FAUCET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-bold text-primary hover:text-white bg-primary/10 hover:bg-primary/20 border border-primary/30 px-4 py-2 rounded-full transition-all cursor-pointer shadow-sm hover:shadow-[0_0_12px_rgba(255,77,77,0.25)] active:scale-[0.98] group"
              title="Get Devnet SOL Faucet"
              aria-label="Solana Devnet Faucet"
            >
              <Drop size={13} weight="fill" className="text-primary group-hover:text-white transition-colors" />
              <span>Faucet</span>
              <ArrowSquareOut size={11} className="opacity-70 group-hover:opacity-100 transition-opacity" />
            </a>
          </div>

          {!user && !publicKey ? (
            <button
              onClick={() => setVisible(true)}
              className="text-[10px] text-white bg-primary rounded-full px-6 py-2.5 hover:bg-red-500 transition-all font-bold shadow-[0_0_20px_rgba(255,77,77,0.3)] tracking-widest uppercase active:scale-[0.98] font-sans cursor-pointer hover-magnetic"
            >
              Connect
            </button>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              {user?.isTestUser && (
                <div className="text-[10px] font-sans text-primary px-3 py-1 rounded-full bg-primary/10 border border-primary/20 flex items-center gap-1 font-bold uppercase tracking-widest">
                  <Flask size={12} weight="fill" />
                  <span>Guest</span>
                </div>
              )}

              {publicKey && !user?.isTestUser && (
                <div className="text-xs font-mono font-bold text-white px-4 py-2 rounded-full bg-white/5 border border-white/10 flex items-center gap-2 shadow-inner">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <SolAmount
                    amount={solBalance !== null ? parseFloat(solBalance.toFixed(3)) : 0}
                    tooltipPosition="bottom"
                    className="text-primary hover:text-red-400"
                  />
                </div>
              )}

              <button
                onClick={onOpenProfileModal}
                className="flex items-center gap-2 py-1 px-1 sm:pr-4 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-primary/50 transition-all group cursor-pointer ease-premium"
                title="View Profile"
              >
                <div className="w-7 h-7 rounded-full overflow-hidden border border-white/10 group-hover:border-primary bg-black flex items-center justify-center font-bold text-[10px] text-primary transition-colors shrink-0">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                  ) : (
                    user?.username ? user.username.substring(0, 2).toUpperCase() : <User size={12} weight="fill" />
                  )}
                </div>
                <span className="hidden sm:inline-flex items-center text-xs font-semibold text-white tracking-normal group-hover:text-primary transition-colors leading-none">
                  {userDisplayName}
                </span>
                {isOwner && (
                  <span className="hidden sm:inline-flex text-[10px] font-mono text-amber-400 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 items-center gap-1 font-bold">
                    <Crown size={11} weight="fill" />
                    <span>Owner</span>
                  </span>
                )}
                {isAdmin && !isOwner && (
                  <span className="hidden sm:inline-flex text-[10px] font-mono text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 items-center gap-1 font-bold">
                    <Shield size={11} weight="fill" />
                    <span>Admin</span>
                  </span>
                )}
              </button>

              <button
                onClick={handleLogout}
                className="text-[10px] text-text-secondary hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-full transition-all font-bold uppercase tracking-widest cursor-pointer"
                title="Disconnect Account"
              >
                Logout
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
  handleGuestLogin,
  handleSpectateGuest,
  handleDismissInvite,
  disconnect,
  pendingGame,
}: any) {
  const { publicKey } = useWallet();
  const { user } = useGameStore();
  const location = useLocation();

  useEffect(() => {
    if (!location.pathname.startsWith('/game') && !location.pathname.startsWith('/watch')) {
      document.title = 'bobsled';
    }
  }, [location.pathname]);

  if (!user && !publicKey) {
    return (
      <WelcomeScreen
        onTestLogin={handleGuestLogin}
        onSpectateGuest={handleSpectateGuest}
        pendingGame={pendingGame}
        onDismissInvite={handleDismissInvite}
      />
    );
  }

  if (isAuthenticating) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh]">
        <div className="w-8 h-8 border-2 border-velocity-red/30 border-t-velocity-red rounded-full animate-spin mb-4" />
        <p className="text-xs uppercase tracking-wider text-text-muted font-mono">Authenticating Wallet...</p>
      </div>
    );
  }

  if (needsUsername) {
    return (
      <SetUsernameScreen
        onSubmit={handleSetUsername}
        isSubmitting={isAuthenticating}
        error={usernameError}
        pendingGame={pendingGame}
      />
    );
  }

  if (authError) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] px-4">
        <div className="border border-red-900/50 bg-red-900/10 text-red-400 p-8 max-w-md text-center rounded-2xl shadow-2xl space-y-4">
          <p className="text-sm font-bold uppercase tracking-wider font-mono">Authentication Notice</p>
          <p className="text-xs text-text-secondary font-mono">{authError}</p>
          <button
            onClick={() => disconnect()}
            className="px-5 py-2 bg-red-900/30 border border-red-900 text-xs font-semibold uppercase tracking-wider hover:bg-red-900/50 transition-colors rounded-full text-white font-mono cursor-pointer"
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
        <p className="text-xs uppercase tracking-wider text-text-muted font-mono">Loading Account...</p>
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
        className="w-full flex-1 flex flex-col"
      >
        <RouteErrorBoundary>
          <Routes location={location}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/profile/:userId" element={<Profile />} />
            <Route path="/admin" element={<AdminPanel />} />
            <Route path="/game/:gameId" element={<Game />} />
            <Route path="/watch/:gameId" element={<Game />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </RouteErrorBoundary>
      </motion.div>
    </AnimatePresence>
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
  const [pendingGame, setPendingGame] = useState<any | null>(null);
  const [showOwnProfileModal, setShowOwnProfileModal] = useState(false);

  // Check if URL points to an incoming game invitation
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/(game|watch)\/([a-zA-Z0-9_-]+)$/);
    if (match && match[2]) {
      const gId = match[2];
      getDoc(doc(db, 'games', gId)).then((snap) => {
        if (snap.exists()) {
          setPendingGame({ id: snap.id, ...snap.data() });
        }
      }).catch(() => {});
    }
  }, []);

  // Live real-time SOL balance with server proxy and connection fallback
  const fetchWalletBalance = useCallback(async () => {
    if (!publicKey || user?.isTestUser) return;
    const walletStr = publicKey.toBase58();

    // 1. Try server-side proxy balance lookup first (fast, CORS-free, bypasses browser RPC limits)
    try {
      const res = await fetch(`/api/solana/balance?wallet=${walletStr}`);
      if (res.ok) {
        const data = await res.json();
        if (typeof data.balance === 'number') {
          setSolBalance(data.balance);
          return;
        }
      }
    } catch (e) {
      // Fallback
    }

    // 2. Try primary wallet connection
    if (connection) {
      try {
        const lamports = await connection.getBalance(publicKey, 'confirmed');
        setSolBalance(lamports / LAMPORTS_PER_SOL);
        return;
      } catch (e) {
        // Fallback
      }
    }

    // 3. Direct Devnet fallback connection
    try {
      const conn = new Connection('https://api.devnet.solana.com', 'confirmed');
      const lamports = await conn.getBalance(new PublicKey(walletStr));
      setSolBalance(lamports / LAMPORTS_PER_SOL);
    } catch (e) {
      // ignore
    }
  }, [publicKey, user?.isTestUser, connection, setSolBalance]);

  useEffect(() => {
    if (!publicKey) {
      if (user?.isTestUser) setSolBalance(null);
      return;
    }

    fetchWalletBalance();
    const interval = setInterval(fetchWalletBalance, 4000);
    return () => clearInterval(interval);
  }, [publicKey, user?.isTestUser, fetchWalletBalance]);

  const handleGuestLogin = async (guestUsername: string) => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const userCredential = await signInAnonymously(auth);
      const uid = userCredential.user.uid;
      setUser({
        id: uid,
        username: guestUsername,
        walletAddress: null,
        isTestUser: true,
        createdAt: new Date(),
      });
    } catch (err: any) {
      logError('Guest login failed:', err);
      setAuthError('Could not initialize guest session.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSpectateGuest = async (guestUsername: string) => {
    await handleGuestLogin(guestUsername);
  };

  const handleDismissInvite = () => {
    setPendingGame(null);
  };

  useEffect(() => {
    let unsubUser: (() => void) | null = null;

    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setAuthInitialized(true);

      if (unsubUser) {
        unsubUser();
        unsubUser = null;
      }

      if (!firebaseUser) {
        if (!user?.isTestUser) {
          setUser(null);
        }
        return;
      }

      if (firebaseUser.isAnonymous) {
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
      if (!publicKey || !signMessage || user?.isTestUser || !authInitialized) return;
      if (authInProgress.current) return;

      const walletStr = publicKey.toBase58();

      if (auth.currentUser && !auth.currentUser.isAnonymous && user?.walletAddress === walletStr) {
        return;
      }

      const lastWallet = localStorage.getItem('bobsled_auth_wallet');
      if (lastWallet === walletStr && auth.currentUser && !auth.currentUser.isAnonymous) {
        return;
      }

      authInProgress.current = true;
      setIsAuthenticating(true);
      setAuthError(null);

      try {
        const nonceRes = await fetch('/api/auth/nonce', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ publicKey: walletStr }),
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
            publicKey: walletStr,
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
          const userCredential = await signInWithCustomToken(auth, data.token);
          currentUser = userCredential.user;
          localStorage.setItem('bobsled_auth_wallet', walletStr);
        } else {
          const userCredential = await signInAnonymously(auth);
          currentUser = userCredential.user;
        }

        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (!userDocSnap.exists()) {
          setNeedsUsername(true);
        } else {
          await updateDoc(userDocRef, {
            walletAddress: walletStr,
          });
          setNeedsUsername(false);
        }
      } catch (err: any) {
        logError('Auth error:', err);
        setAuthError(err.message || 'Failed to authenticate');
      } finally {
        authInProgress.current = false;
        setIsAuthenticating(false);
      }
    };

    if (publicKey && !user?.isTestUser && authInitialized) {
      authenticate();
    } else {
      setNeedsUsername(false);
    }
  }, [publicKey, signMessage, user?.walletAddress, user?.isTestUser, authInitialized]);

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
      <div className="flex flex-col min-h-screen bg-background text-text-primary font-sans selection:bg-velocity-red selection:text-white antialiased">
        <ConnectionStatusBanner />
        <AppHeader onOpenProfileModal={() => user?.id && setShowOwnProfileModal(true)} />
        
        {/* Own Profile Modal triggered from header */}
        {showOwnProfileModal && user?.id && (
          <UserProfileModal
            userId={user.id}
            onClose={() => setShowOwnProfileModal(false)}
          />
        )}

        <main className="flex flex-1 w-full relative z-10">
          <RouteErrorBoundary>
            <MainContent
              isAuthenticating={isAuthenticating}
              needsUsername={needsUsername}
              usernameError={usernameError}
              authError={authError}
              handleSetUsername={handleSetUsername}
              handleGuestLogin={handleGuestLogin}
              handleSpectateGuest={handleSpectateGuest}
              handleDismissInvite={handleDismissInvite}
              disconnect={disconnect}
              pendingGame={pendingGame}
            />
          </RouteErrorBoundary>
        </main>
        
        <ToastContainer />
      </div>
    </BrowserRouter>
  );
}
