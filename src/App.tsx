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
import WelcomeScreen from './components/WelcomeScreen';
import SetUsernameScreen from './components/SetUsernameScreen';
import { Shield } from 'lucide-react';

export default function App() {
  const { publicKey, signMessage, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { user, setUser, currentGameId, spectatingGameId, setCurrentGameId, setSpectatingGameId } = useGameStore();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [isTestUser, setIsTestUser] = useState(false);
  
  const [needsUsername, setNeedsUsername] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setAuthInitialized(true);
      if (!firebaseUser) {
        setUser(null);
        setIsTestUser(false);
        return;
      }
      
      const userRef = doc(db, 'users', firebaseUser.uid);
      const unsubUser = onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
          const userData = snapshot.data() as any;
          if (userData.isTestUser || publicKey) {
            setUser({ id: snapshot.id, ...userData });
            if (userData.isTestUser) setIsTestUser(true);
          } else {
            setUser(null);
            setIsTestUser(false);
          }
        }
      }, (error) => {
        if (error.code === 'permission-denied') return;
        handleFirestoreError(error, OperationType.GET, 'users');
      });

      return () => unsubUser();
    });

    return () => unsubscribe();
  }, [setUser, publicKey]);

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
        const { nonce } = await nonceRes.json();

        const message = new TextEncoder().encode(`Sign this message to log in to bobsled.gg. Nonce: ${nonce}`);
        let signatureBytes;
        try {
          signatureBytes = await signMessage(message);
        } catch (e) {
          throw new Error('User rejected the request.');
        }
        
        const signature = (await import('bs58')).default.encode(signatureBytes);

        const verifyRes = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            publicKey: publicKey.toBase58(),
            signature
          }),
        });
        
        if (!verifyRes.ok) {
          throw new Error('Verification failed on server');
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
            testSolBalance: deleteField()
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
  };

  const handleTestLogin = async (username: string) => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      await signOut(auth);
      const userCredential = await signInAnonymously(auth);
      const userRef = doc(db, 'users', userCredential.user.uid);
      const snap = await getDoc(userRef);
      
      if (!snap.exists()) {
        await setDoc(userRef, {
          walletAddress: null,
          username: username,
          elo: 1000,
          freeTokens: 10,
          testSolBalance: 1,
          isTestUser: true,
          createdAt: serverTimestamp(),
        });
      }
      setIsTestUser(true);
    } catch (e: any) {
      console.error(e);
      setAuthError(e.message || 'Failed to login as test user');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSetUsername = async (username: string) => {
    setIsAuthenticating(true);
    setUsernameError(null);
    try {
      const usernameRef = doc(db, 'usernames', username.toLowerCase());
      const usernameSnap = await getDoc(usernameRef);
      if (usernameSnap.exists()) {
        throw new Error("Username is already taken.");
      }
      
      const currentUser = auth.currentUser;
      if (!currentUser) throw new Error("Not authenticated");
      if (!publicKey) throw new Error("Wallet not connected");
      
      const batch = writeBatch(db);
      batch.set(usernameRef, { uid: currentUser.uid });
      batch.set(doc(db, 'users', currentUser.uid), {
        walletAddress: publicKey.toBase58(),
        username: username,
        elo: 1000,
        freeTokens: 10,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      setNeedsUsername(false);
    } catch (e: any) {
      setUsernameError(e.message || "Failed to set username");
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleClearDatabase = async () => {
    if (!user || user.walletAddress !== '11111111111111111111111111111111') return;
    if (!confirm("Are you sure you want to clear all data? This cannot be undone.")) return;
    try {
      const { collection, getDocs, deleteDoc } = await import('firebase/firestore');
      const usersSnap = await getDocs(collection(db, 'users'));
      const gamesSnap = await getDocs(collection(db, 'games'));
      const usernamesSnap = await getDocs(collection(db, 'usernames'));
      
      const promises: any[] = [];
      usersSnap.forEach(d => promises.push(deleteDoc(d.ref)));
      gamesSnap.forEach(d => promises.push(deleteDoc(d.ref)));
      usernamesSnap.forEach(d => promises.push(deleteDoc(d.ref)));
      
      await Promise.all(promises);
      alert("Database cleared.");
      window.location.reload();
    } catch(e) {
      console.error(e);
      alert("Failed to clear database.");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#0A0A0A] text-white font-sans overflow-hidden selection:bg-[#AB9FF2]/30">
      <header className="flex justify-between items-center px-4 sm:px-8 py-4 border-b border-neutral-800 bg-[#0D0D0D] shrink-0 z-50 relative">
        <button 
          onClick={() => { setCurrentGameId(null); setSpectatingGameId(null); }}
          className="text-xl sm:text-2xl font-bold tracking-tighter lowercase text-white hover:text-[#AB9FF2] transition-colors"
        >
          bobsled.gg
        </button>
        
        <div className="flex items-center gap-4 sm:gap-6">
          {user?.walletAddress === '11111111111111111111111111111111' && (
            <button 
              onClick={handleClearDatabase}
              className="flex items-center gap-1 text-[10px] uppercase tracking-widest px-3 py-2 bg-red-900/20 border border-red-900 text-red-500 hover:bg-red-900/40 transition-colors"
            >
              <Shield size={12} /> Admin
            </button>
          )}

          {!publicKey && !isTestUser ? (
            <button 
              onClick={() => setVisible(true)}
              className="bg-[#AB9FF2] text-black font-bold text-[11px] uppercase tracking-[0.2em] py-2 px-6 hover:opacity-90 transition-opacity"
            >
              Connect Wallet
            </button>
          ) : (
            <div className="flex items-center gap-4">
              <span className="hidden sm:block text-xs font-bold uppercase tracking-wider text-[#AB9FF2] border border-[#AB9FF2]/30 bg-[#AB9FF2]/10 px-3 py-2">
                {user?.username || 'Connecting...'}
              </span>
              <button 
                onClick={handleLogout} 
                className="text-[10px] uppercase tracking-widest px-3 py-2 border border-neutral-800 hover:bg-neutral-800 text-neutral-500 hover:text-white transition-colors"
              >
                Exit
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="flex flex-1 overflow-hidden w-full relative z-10">
        {(!publicKey && !isTestUser) ? (
          <WelcomeScreen onTestLogin={handleTestLogin} />
        ) : isAuthenticating ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,_#111_0%,_#0A0A0A_100%)] w-full relative">
            <div className="w-8 h-8 border border-[#AB9FF2]/30 border-t-[#AB9FF2] rounded-full animate-spin mb-4" />
            <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-mono">Authenticating Signature...</p>
          </div>
        ) : needsUsername ? (
          <SetUsernameScreen 
            onSubmit={handleSetUsername} 
            isSubmitting={isAuthenticating}
            error={usernameError} 
          />
        ) : authError ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,_#111_0%,_#0A0A0A_100%)] w-full relative px-4">
            <div className="border border-red-900/50 bg-red-900/10 text-red-500 px-8 py-6 max-w-md text-center">
              <p className="text-xs uppercase tracking-widest font-bold mb-2">Auth Failed</p>
              <p className="text-[11px] font-mono text-neutral-400 mb-6">{authError}</p>
              <button 
                onClick={() => disconnect()}
                className="px-6 py-2 border border-red-900 text-[10px] uppercase tracking-widest hover:bg-red-900/20 transition-colors"
              >
                Disconnect & Retry
              </button>
            </div>
          </div>
        ) : user ? (
          currentGameId || spectatingGameId ? (
             <Game />
          ) : (
             <Dashboard />
          )
        ) : null}
      </main>
      
    </div>
  );
}
