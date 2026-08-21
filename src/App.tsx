import { useEffect, useState, useRef, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { signOut, onAuthStateChanged, signInWithCustomToken, signInAnonymously } from 'firebase/auth';
import { doc, onSnapshot, getDoc, updateDoc, writeBatch, serverTimestamp, getDocs, query, collection, where, deleteDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { useGameStore } from './store';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import Dashboard from './components/Dashboard';
import Game from './components/Game';
import Profile from './components/Profile';
import AdminPanel from './components/AdminPanel';
import WelcomeScreen from './components/WelcomeScreen';
import SetUsernameScreen from './components/SetUsernameScreen';
import UserProfileModal from './components/UserProfileModal';
import SolAmount from './components/SolAmount';
import { Shield, User, FlaskConical } from 'lucide-react';

const OWNER_WALLET = '11111111111111111111111111111111';

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
    console.warn('Guest cleanup notice:', err);
  }
}

function AppHeader({ onOpenProfileModal }: { onOpenProfileModal: () => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { user, setUser, solBalance } = useGameStore();

  const handleLogout = async () => {
    localStorage.removeItem('bobsled_auth_wallet');
    if (user?.isTestUser && user.id) {
      await cleanupGuestUserGames(user.id);
    }
    try {
      await signOut(auth);
    } catch (e) {
      console.error(e);
    }
    disconnect();
    setUser(null);
    navigate('/');
  };

  const isOwner = user?.walletAddress === OWNER_WALLET;
  const isAdmin = isOwner || user?.isAdmin || user?.role === 'admin';

  const isLobby = location.pathname === '/';
  const isProfile = location.pathname.startsWith('/profile');
  const isAdminRoute = location.pathname === '/admin';

  const userDisplayName = user?.isTestUser
    ? (user?.username || 'Guest')
    : `@${user?.username || 'Player'}`;

  return (
    <header className="sticky top-0 z-50 w-full px-4 sm:px-6 md:px-8 pt-3 pb-2 pointer-events-none">
      <div className="max-w-6xl mx-auto pointer-events-auto bg-[#121212]/85 backdrop-blur-xl border border-white/10 rounded-2xl md:rounded-full px-4 sm:px-6 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex items-center justify-between gap-4 transition-all">
        
        {/* Left: Logo & Navigation */}
        <div className="flex items-center gap-4 sm:gap-8">
          <Link
            to="/"
            className="flex items-center gap-2 font-headline-lg text-xl sm:text-2xl font-bold text-velocity-red tracking-tight hover:opacity-90 transition-opacity cursor-pointer"
          >
            <img src="/logo.jpg" alt="bobsled.gg" className="w-7 h-7 sm:w-8 sm:h-8 rounded-full mix-blend-screen" />
            <span className="text-white">bobsled<span className="text-velocity-red">.</span>gg</span>
          </Link>

          {user && (
            <nav className="hidden md:flex items-center space-x-1 bg-[#1a1a1a]/80 p-1 rounded-full border border-white/5">
              <Link
                to="/"
                className={`text-xs px-4 py-1.5 rounded-full font-semibold tracking-wide transition-all cursor-pointer ${
                  isLobby
                    ? 'text-white bg-white/15 shadow-sm'
                    : 'text-text-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                Lobby
              </Link>
              <Link
                to="/profile"
                className={`text-xs px-4 py-1.5 rounded-full font-semibold tracking-wide transition-all cursor-pointer ${
                  isProfile
                    ? 'text-white bg-white/15 shadow-sm'
                    : 'text-text-secondary hover:text-white hover:bg-white/5'
                }`}
              >
                Profile
              </Link>
              {isAdmin && (
                <Link
                  to="/admin"
                  className={`text-xs px-3.5 py-1.5 rounded-full font-semibold tracking-wide transition-all flex items-center gap-1.5 cursor-pointer ${
                    isAdminRoute
                      ? 'text-velocity-red bg-velocity-red/15 border border-velocity-red/30'
                      : 'text-text-secondary hover:text-velocity-red hover:bg-white/5'
                  }`}
                >
                  <Shield size={12} />
                  <span>Admin</span>
                </Link>
              )}
            </nav>
          )}
        </div>

        {/* Right: Balance & User Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          
          {/* Admin Fast Link for mobile */}
          {isAdmin && (
            <Link
              to="/admin"
              className="md:hidden flex items-center gap-1 text-[11px] uppercase tracking-wider px-2.5 py-1 bg-velocity-red/10 border border-velocity-red/30 text-velocity-red rounded-full font-mono font-bold cursor-pointer"
            >
              Admin
            </Link>
          )}

          {!user && !publicKey ? (
            <button
              onClick={() => setVisible(true)}
              className="text-xs text-white bg-velocity-red rounded-full px-5 py-2 hover:bg-red-600 transition-all font-semibold shadow-[0_0_20px_rgba(255,77,77,0.4)] tracking-wide uppercase active:scale-[0.98] font-mono cursor-pointer"
            >
              Connect Wallet
            </button>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              
              {/* Guest User Badge */}
              {user?.isTestUser && (
                <div className="text-[11px] font-mono text-velocity-red px-3 py-1 rounded-full bg-velocity-red/10 border border-velocity-red/30 flex items-center gap-1 font-bold">
                  <FlaskConical size={12} />
                  <span>GUEST</span>
                </div>
              )}

              {/* Real SOL Balance */}
              {publicKey && !user?.isTestUser && (
                <div className="text-xs font-mono font-bold text-white px-3.5 py-1.5 rounded-full bg-[#181818] border border-white/10 flex items-center gap-2 shadow-inner">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <SolAmount
                    amount={solBalance !== null ? parseFloat(solBalance.toFixed(3)) : 0}
                    tooltipPosition="bottom"
                    className="text-velocity-red hover:text-red-400"
                  />
                </div>
              )}

              {/* Profile Link Pill */}
              <button
                onClick={onOpenProfileModal}
                className="flex items-center gap-2 py-1 px-1.5 sm:pr-3.5 rounded-full bg-[#181818] hover:bg-[#222222] border border-white/10 hover:border-velocity-red/60 transition-all group cursor-pointer h-8.5"
                title="View Profile"
              >
                <div className="w-6 h-6 rounded-full overflow-hidden border border-white/10 group-hover:border-velocity-red bg-[#222] flex items-center justify-center font-bold text-[11px] text-velocity-red transition-colors shrink-0">
                  {user?.avatarUrl ? (
                    <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                  ) : (
                    user?.username ? user.username.substring(0, 2).toUpperCase() : <User size={12} />
                  )}
                </div>
                <span className="hidden sm:inline-flex items-center text-xs font-semibold text-white group-hover:text-velocity-red transition-colors leading-none">
                  {userDisplayName}
                </span>
              </button>

              {/* Disconnect / Logout Button */}
              <button
                onClick={handleLogout}
                className="text-xs text-text-secondary hover:text-white bg-[#1a1a1a] hover:bg-[#222] border border-white/5 hover:border-white/10 px-3.5 py-1.5 rounded-full transition-all font-medium font-mono cursor-pointer"
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
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/profile" element={<Profile />} />
      <Route path="/profile/:userId" element={<Profile />} />
      <Route path="/admin" element={<AdminPanel />} />
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

  // Cleanup guest user games on window unload
  useEffect(() => {
    const handleUnload = () => {
      if (user?.isTestUser && user.id) {
        cleanupGuestUserGames(user.id);
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [user]);

  // Live real-time SOL balance with multi-RPC fallback
  const fetchWalletBalance = useCallback(async () => {
    if (!publicKey || user?.isTestUser) return;
    const walletStr = publicKey.toBase58();

    if (connection) {
      try {
        const lamports = await connection.getBalance(publicKey, 'confirmed');
        setSolBalance(lamports / LAMPORTS_PER_SOL);
        return;
      } catch (e) {
        // Fallback
      }
    }

    const rpcList = [
      'https://rpc.ankr.com/solana',
      'https://solana.public-rpc.com',
      'https://1rpc.io/sol',
    ];

    for (const rpc of rpcList) {
      try {
        const conn = new Connection(rpc, 'confirmed');
        const lamports = await conn.getBalance(new PublicKey(walletStr));
        setSolBalance(lamports / LAMPORTS_PER_SOL);
        return;
      } catch (e) {
        // try next
      }
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
      console.error('Guest login failed:', err);
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
        console.error('Auth error:', err);
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
      <div className="flex flex-col min-h-screen bg-[#0e0e0e] text-text-primary font-sans selection:bg-velocity-red selection:text-white antialiased">
        <AppHeader onOpenProfileModal={() => user?.id && setShowOwnProfileModal(true)} />
        
        {/* Own Profile Modal triggered from header */}
        {showOwnProfileModal && user?.id && (
          <UserProfileModal
            userId={user.id}
            onClose={() => setShowOwnProfileModal(false)}
          />
        )}

        <main className="flex flex-1 w-full relative z-10">
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
        </main>
      </div>
    </BrowserRouter>
  );
}
