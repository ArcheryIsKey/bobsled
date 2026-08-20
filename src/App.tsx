import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom';
import { useWallet } from '@solana/wallet-adapter-react';
import { useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';
import { doc, getDoc, setDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { signInWithCustomToken, signInAnonymously, signOut } from 'firebase/auth';
import { auth, db } from './firebase';
import { useGameStore } from './store';
import Dashboard from './components/Dashboard';
import Game from './components/Game';
import Profile from './components/Profile';
import AdminPanel from './components/AdminPanel';
import WelcomeScreen from './components/WelcomeScreen';
import SetUsernameScreen from './components/SetUsernameScreen';
import UserProfileModal from './components/UserProfileModal';
import MobileBottomNav from './components/MobileBottomNav';
import { User, Shield, FlaskConical } from 'lucide-react';
import bs58 from 'bs58';

const OWNER_WALLET = '11111111111111111111111111111111';

function AppHeader({ onOpenProfileModal }: { onOpenProfileModal: () => void }) {
  const { publicKey, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { user, clearUser, solBalance } = useGameStore();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      if (publicKey) {
        await disconnect();
      }
      clearUser();
    } catch (e) {
      console.error('Logout error:', e);
    }
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
    <header className="sticky top-0 z-50 w-full px-3 sm:px-6 md:px-8 pt-2.5 sm:pt-3 pb-2 pointer-events-none">
      <div className="max-w-6xl mx-auto pointer-events-auto bg-[#121212]/85 backdrop-blur-xl border border-white/10 rounded-2xl md:rounded-full px-3.5 sm:px-6 py-2.5 shadow-[0_8px_32px_rgba(0,0,0,0.6)] flex items-center justify-between gap-3 transition-all">
        
        {/* Left: Logo & Navigation */}
        <div className="flex items-center gap-4 sm:gap-8">
          <Link
            to="/"
            className="flex items-center gap-2 font-headline-lg text-lg sm:text-2xl font-bold text-velocity-red tracking-tight hover:opacity-90 transition-opacity cursor-pointer"
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
          {!user && !publicKey ? (
            <button
              onClick={() => setVisible(true)}
              className="text-xs text-white bg-velocity-red rounded-full px-4 sm:px-5 py-2 hover:bg-red-600 transition-all font-semibold shadow-[0_0_20px_rgba(255,77,77,0.4)] tracking-wide uppercase active:scale-[0.98] font-mono cursor-pointer"
            >
              Connect
            </button>
          ) : (
            <div className="flex items-center gap-2 sm:gap-3">
              
              {/* Guest User Badge */}
              {user?.isTestUser && (
                <div className="text-[10px] sm:text-[11px] font-mono text-velocity-red px-2.5 sm:px-3 py-1 rounded-full bg-velocity-red/10 border border-velocity-red/30 flex items-center gap-1 font-bold">
                  <FlaskConical size={12} />
                  <span>GUEST</span>
                </div>
              )}

              {/* Real SOL Balance */}
              {publicKey && !user?.isTestUser && (
                <div className="text-xs font-mono font-bold text-white px-3 py-1.5 rounded-full bg-[#181818] border border-white/10 flex items-center gap-1.5 sm:gap-2 shadow-inner">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span className="text-velocity-red">
                    {solBalance !== null ? `${solBalance.toFixed(3)} SOL` : '0.000 SOL'}
                  </span>
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

              {/* Exit Button */}
              <button
                onClick={handleLogout}
                className="text-xs px-3 sm:px-3.5 py-1.5 border border-white/10 hover:bg-white/10 text-text-secondary hover:text-white transition-colors rounded-full font-medium cursor-pointer"
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
  handleGuestLogin,
  disconnect,
  pendingGame,
}: any) {
  const { publicKey } = useWallet();
  const { user } = useGameStore();

  if (!user && !publicKey) {
    return <WelcomeScreen onTestLogin={handleGuestLogin} pendingGame={pendingGame} />;
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

  // Fetch live SOL balance
  useEffect(() => {
    if (!publicKey || user?.isTestUser) {
      setSolBalance(null);
      return;
    }

    const fetchBalance = async () => {
      try {
        const bal = await connection.getBalance(publicKey);
        setSolBalance(bal / LAMPORTS_PER_SOL);
      } catch (err) {
        console.error('Error fetching SOL balance:', err);
      }
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 10000);
    return () => clearInterval(interval);
  }, [publicKey, connection, setSolBalance, user?.isTestUser]);

  // Handle Guest Login
  const handleGuestLogin = async (customUsername?: string) => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const userCred = await signInAnonymously(auth);
      const guestId = userCred.user.uid;
      const guestName = customUsername?.trim() || `Guest_${Math.floor(1000 + Math.random() * 9000)}`;

      setUser({
        id: guestId,
        username: guestName,
        isTestUser: true,
        walletAddress: null,
        avatarUrl: null,
        bannerUrl: null,
      });
    } catch (e: any) {
      console.error('Guest login error:', e);
      setAuthError('Failed to initialize guest session.');
    } finally {
      setIsAuthenticating(false);
      setAuthInitialized(true);
    }
  };

  // Authenticate Solana Wallet with Backend Custom Token
  useEffect(() => {
    const authenticate = async () => {
      if (!publicKey || !signMessage || user?.isTestUser) return;
      if (user && user.walletAddress === publicKey.toBase58()) return;

      setIsAuthenticating(true);
      setAuthError(null);

      try {
        const walletAddress = publicKey.toBase58();
        const nonceRes = await fetch(`/api/auth/nonce?wallet=${walletAddress}`);
        if (!nonceRes.ok) throw new Error('Failed to retrieve authentication challenge');
        const { nonce } = await nonceRes.json();

        const message = `Sign in to bobsled.gg\n\nChallenge Nonce: ${nonce}`;
        const messageBytes = new TextEncoder().encode(message);
        const signatureBytes = await signMessage(messageBytes);
        const signature = bs58.encode(signatureBytes);

        const verifyRes = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: walletAddress, signature, nonce }),
        });

        if (!verifyRes.ok) {
          const errData = await verifyRes.json();
          throw new Error(errData.error || 'Signature verification failed');
        }

        const { token } = await verifyRes.json();
        const userCred = await signInWithCustomToken(auth, token);
        const uid = userCred.user.uid;

        const userDocRef = doc(db, 'users', uid);
        const userDoc = await getDoc(userDocRef);

        if (!userDoc.exists() || !userDoc.data()?.username) {
          setNeedsUsername(true);
        } else {
          const uData = userDoc.data();
          setUser({
            id: uid,
            username: uData.username,
            walletAddress: uData.walletAddress,
            avatarUrl: uData.avatarUrl || null,
            bannerUrl: uData.bannerUrl || null,
            isAdmin: uData.isAdmin || uData.role === 'admin' || walletAddress === OWNER_WALLET,
            isTestUser: false,
          });
          setNeedsUsername(false);
        }
      } catch (err: any) {
        console.error('Wallet authentication error:', err);
        setAuthError(err.message || 'Failed to authenticate wallet');
      } finally {
        setIsAuthenticating(false);
        setAuthInitialized(true);
      }
    };

    if (publicKey && !user?.isTestUser) {
      authenticate();
    } else {
      setNeedsUsername(false);
    }
  }, [publicKey, signMessage, user?.walletAddress, user?.isTestUser]);

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

      setUser({
        id: currentUser.uid,
        username,
        walletAddress: publicKey.toBase58(),
        avatarUrl: avatarUrl || null,
        bannerUrl: null,
        isAdmin: publicKey.toBase58() === OWNER_WALLET,
        isTestUser: false,
      });

      setNeedsUsername(false);
    } catch (e: any) {
      setUsernameError(e.message || 'Failed to set username');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-[100dvh] bg-[#0e0e0e] text-text-primary font-sans selection:bg-velocity-red selection:text-white antialiased">
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
            disconnect={disconnect}
            pendingGame={pendingGame}
          />
        </main>

        {/* Sleek Mobile Bottom Navigation Bar */}
        <MobileBottomNav />
      </div>
    </BrowserRouter>
  );
}
