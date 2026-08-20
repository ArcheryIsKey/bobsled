import { useEffect, useState, useRef } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { signInAnonymously, signOut, onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot, getDoc, setDoc, writeBatch, serverTimestamp, deleteField, updateDoc } from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { useGameStore } from './store';
import bs58 from 'bs58';
import Dashboard from './components/Dashboard';
import Game from './components/Game';
import Profile from './components/Profile';
import WelcomeScreen from './components/WelcomeScreen';
import SetUsernameScreen from './components/SetUsernameScreen';
import { Shield, User, Wallet } from 'lucide-react';

export default function App() {
  const { publicKey, signMessage, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const {
    user,
    setUser,
    currentGameId,
    spectatingGameId,
    setCurrentGameId,
    setSpectatingGameId,
    currentView,
    setCurrentView,
  } = useGameStore();

  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [isTestUser, setIsTestUser] = useState(false);

  const [needsUsername, setNeedsUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Check for URL query params like ?watch=GAME_ID
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const watchId = params.get('watch');
    if (watchId) {
      setSpectatingGameId(watchId);
    }
  }, [setSpectatingGameId]);

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
        setIsTestUser(false);
        return;
      }

      const userRef = doc(db, 'users', firebaseUser.uid);
      unsubUser = onSnapshot(
        userRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const userData = snapshot.data() as any;
            setUser({ id: snapshot.id, ...userData });
            if (userData.isTestUser) setIsTestUser(true);
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
          throw new Error('User rejected the signature request.');
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
            isTestUser: false,
            testSolBalance: deleteField(),
          });
          setIsTestUser(false);
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

  const handleLogout = async () => {
    if (user?.isTestUser && auth.currentUser) {
      const { deleteDoc } = await import('firebase/firestore');
      try {
        await deleteDoc(doc(db, 'users', auth.currentUser.uid));
      } catch (e) {}
    }
    await signOut(auth);
    disconnect();
    setIsTestUser(false);
    setNeedsUsername(false);
    setCurrentView('lobby');
  };

  const handleTestLogin = async (username: string) => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      await signOut(auth);
      const userCredential = await signInAnonymously(auth);

      setUser({
        id: userCredential.user.uid,
        walletAddress: null,
        username: username,
        elo: 1000,
        freeTokens: 10,
        testSolBalance: 1,
        isTestUser: true,
      });
      setIsTestUser(true);
    } catch (e: any) {
      console.error(e);
      setAuthError(e.message || 'Failed to login as test user');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSetUsername = async (username: string, avatarUrl?: string) => {
    setIsAuthenticating(true);
    setUsernameError(null);
    try {
      const usernameRef = doc(db, 'usernames', username.toLowerCase());
      const usernameSnap = await getDoc(usernameRef);
      if (usernameSnap.exists()) {
        throw new Error('Callsign is already taken. Please choose another.');
      }

      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error('Not authenticated');
      if (!publicKey) throw new Error('Wallet not connected');

      const batch = writeBatch(db);
      batch.set(usernameRef, { uid: currentUser.uid });

      const userData: any = {
        walletAddress: publicKey.toBase58(),
        username: username,
        elo: 1000,
        freeTokens: 10,
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

  const displayBalance = user
    ? user.isTestUser
      ? `${user.testSolBalance ?? 1} SOL`
      : user.testSolBalance !== undefined
      ? `${user.testSolBalance} SOL`
      : `${user.freeTokens ?? 10} FREE`
    : '0';

  return (
    <div className="flex flex-col min-h-screen bg-background text-text-primary font-sans selection:bg-velocity-red selection:text-text-primary antialiased">
      
      {/* Top Navigation Header (Matching Stitch Design) */}
      <header className="bg-surface-elevated/80 backdrop-blur-lg border-b border-glass-border sticky top-0 z-50">
        <div className="flex justify-between items-center w-full px-margin-mobile md:px-margin-desktop max-w-max-width mx-auto h-16">
          
          {/* Logo */}
          <div className="flex items-center gap-8">
            <button
              onClick={() => {
                setCurrentGameId(null);
                setSpectatingGameId(null);
                setCurrentView('lobby');
              }}
              className="flex items-center gap-2.5 font-headline-lg-mobile md:font-headline-lg text-2xl font-bold text-velocity-red tracking-tighter hover:opacity-90 transition-opacity"
            >
              <img src="/logo.jpg" alt="bobsled.gg logo" className="w-8 h-8 mix-blend-screen" />
              <span>bobsled.gg</span>
            </button>

            {/* Navigation Tabs when logged in */}
            {user && (
              <nav className="hidden md:flex items-center space-x-6">
                <button
                  onClick={() => {
                    setCurrentGameId(null);
                    setSpectatingGameId(null);
                    setCurrentView('lobby');
                  }}
                  className={`font-label-caps text-xs px-2.5 py-1 rounded transition-colors ${
                    currentView === 'lobby' && !currentGameId && !spectatingGameId
                      ? 'text-text-primary font-bold border-b-2 border-velocity-red pb-1'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Lobby
                </button>
                <button
                  onClick={() => {
                    setCurrentGameId(null);
                    setSpectatingGameId(null);
                    setCurrentView('profile');
                  }}
                  className={`font-label-caps text-xs px-2.5 py-1 rounded transition-colors ${
                    currentView === 'profile'
                      ? 'text-text-primary font-bold border-b-2 border-velocity-red pb-1'
                      : 'text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Profile
                </button>
              </nav>
            )}
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center space-x-4">
            {/* Admin Clear Button */}
            {user?.walletAddress === '11111111111111111111111111111111' && (
              <button
                onClick={handleClearDatabase}
                className="hidden sm:flex items-center gap-1 font-label-caps text-[10px] uppercase tracking-widest px-3 py-1.5 bg-red-900/20 border border-red-900 text-red-500 hover:bg-red-900/40 transition-colors rounded"
              >
                <Shield size={12} /> Admin
              </button>
            )}

            {!publicKey && !isTestUser ? (
              <button
                onClick={() => setVisible(true)}
                className="font-label-caps text-xs text-text-primary bg-velocity-red rounded px-4 py-2 hover:bg-primary-container transition-colors uppercase font-bold shadow-[0_0_15px_rgba(255,77,77,0.3)]"
              >
                Connect Wallet
              </button>
            ) : (
              <div className="flex items-center gap-3 sm:gap-4">
                {/* Balance Pill */}
                {user && (
                  <div className="font-label-caps text-xs text-text-primary px-3 py-1.5 rounded bg-surface-container border border-glass-border flex items-center gap-1.5">
                    <span className="text-text-muted hidden sm:inline">Balance:</span>
                    <span className="text-velocity-red font-bold">{displayBalance}</span>
                  </div>
                )}

                {/* Profile Pill / Button (Clicking navigates to Profile page) */}
                <button
                  onClick={() => {
                    setCurrentGameId(null);
                    setSpectatingGameId(null);
                    setCurrentView('profile');
                  }}
                  className="flex items-center gap-2.5 p-1 sm:pr-3 rounded-full sm:rounded-lg bg-surface-base hover:bg-surface-elevated border border-glass-border hover:border-velocity-red transition-all group cursor-pointer"
                  title="View My Profile"
                >
                  <div className="w-8 h-8 rounded-full overflow-hidden border border-glass-border group-hover:border-velocity-red bg-surface-container flex items-center justify-center font-bold text-xs text-velocity-red transition-colors shrink-0">
                    {user?.avatarUrl ? (
                      <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                    ) : (
                      user?.username ? user.username.substring(0, 2).toUpperCase() : <User size={14} />
                    )}
                  </div>
                  <span className="hidden sm:block font-label-caps text-xs font-bold text-text-primary group-hover:text-velocity-red transition-colors">
                    {user?.username || 'Connecting...'}
                  </span>
                </button>

                {/* Exit Button */}
                <button
                  onClick={handleLogout}
                  className="font-label-caps text-[10px] uppercase tracking-widest px-3 py-1.5 border border-glass-border hover:bg-surface-variant text-text-secondary hover:text-text-primary transition-colors rounded"
                >
                  Exit
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex flex-1 w-full relative z-10">
        {!publicKey && !isTestUser ? (
          <WelcomeScreen onTestLogin={handleTestLogin} />
        ) : isAuthenticating ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-background w-full min-h-[70vh]">
            <div className="w-8 h-8 border border-velocity-red/30 border-t-velocity-red rounded-full animate-spin mb-4" />
            <p className="text-xs uppercase tracking-widest text-text-muted font-label-caps">
              Authenticating Signature...
            </p>
          </div>
        ) : needsUsername ? (
          <SetUsernameScreen
            onSubmit={handleSetUsername}
            isSubmitting={isAuthenticating}
            error={usernameError}
          />
        ) : authError ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-background w-full min-h-[70vh] px-4">
            <div className="border border-red-900/50 bg-red-900/10 text-red-500 p-8 max-w-md text-center rounded-xl shadow-2xl">
              <p className="text-xs uppercase tracking-widest font-bold mb-2 font-label-caps">Auth Failed</p>
              <p className="text-xs font-mono text-text-muted mb-6">{authError}</p>
              <button
                onClick={() => {
                  setAuthError(null);
                  disconnect();
                }}
                className="px-6 py-2 border border-red-900 text-xs font-label-caps uppercase tracking-widest hover:bg-red-900/20 transition-colors rounded"
              >
                Disconnect &amp; Retry
              </button>
            </div>
          </div>
        ) : user ? (
          currentGameId || spectatingGameId ? (
            <Game />
          ) : currentView === 'profile' ? (
            <Profile />
          ) : (
            <Dashboard />
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-background w-full min-h-[70vh]">
            <div className="w-8 h-8 border border-velocity-red/30 border-t-velocity-red rounded-full animate-spin mb-4" />
            <p className="text-xs uppercase tracking-widest text-text-muted font-label-caps">Loading Dossier...</p>
          </div>
        )}
      </main>
    </div>
  );
}
