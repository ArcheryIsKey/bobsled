import { useEffect, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, serverTimestamp, deleteDoc, setDoc, collection, query } from 'firebase/firestore';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { db } from '../firebase';
import { useGameStore } from '../store';
import Chat from './Chat';
import Connect4 from './games/Connect4';
import UserProfileModal from './UserProfileModal';
import MatchInviteModal from './MatchInviteModal';
import SolAmount from './SolAmount';
import { depositMatchStake } from '../utils/solanaEscrow';
import { logError, logWarn } from '../utils/logger';
import { ArrowLeft, Copy, Check, Trophy, Flag, Warning as Warning, XCircle, ArrowRight, User, ChatSlash as ChatCircleOff, UserPlus, Eye, Sword as Swords, X, ArrowUpRight as ArrowUpRight, CircleNotch } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Game() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, addToast } = useGameStore();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [game, setGame] = useState<any>(null);
  const [spectators, setSpectators] = useState<any[]>([]);
  const [now, setNow] = useState(Date.now());
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [copiedSpectate, setCopiedSpectate] = useState(false);
  const [showWinModal, setShowWinModal] = useState(true);
  const [showResignModal, setShowResignModal] = useState(false);
  const [isJoiningInvite, setIsJoiningInvite] = useState(false);
  const [joiningStatus, setJoiningStatus] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [dismissedInviteModal, setDismissedInviteModal] = useState(false);

  const isExplicitWatchRoute = location.pathname.startsWith('/watch/');

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Register spectator presence
  useEffect(() => {
    if (!gameId || !user?.id || !game) return;

    const isP1 = user.id === game.player1;
    const isP2 = user.id === game.player2;
    const isSpec = (!isP1 && !isP2) || isExplicitWatchRoute;

    if (isSpec) {
      const specRef = doc(db, 'games', gameId, 'spectators', user.id);
      setDoc(specRef, {
        id: user.id,
        username: user.username || 'Spectator',
        isTestUser: !!user.isTestUser,
        avatarUrl: user.avatarUrl || null,
        joinedAt: serverTimestamp(),
      }).catch((err) => logWarn('Spectator presence:', err));

      return () => {
        deleteDoc(specRef).catch(() => {});
      };
    }
  }, [gameId, user?.id, game?.player1, game?.player2, isExplicitWatchRoute]);

  // Listen to active spectators
  useEffect(() => {
    if (!gameId) return;
    const q = query(collection(db, 'games', gameId, 'spectators'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSpectators(list);
      },
      () => {}
    );
    return () => unsub();
  }, [gameId]);

  // Listen to game document
  useEffect(() => {
    if (!gameId) {
      navigate('/');
      return;
    }

    const unsub = onSnapshot(doc(db, 'games', gameId), (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as any;
        setGame(data);
        if (data.status === 'finished') {
          setShowWinModal(true);
          if (
            data.wager > 0 &&
            data.wagerCurrency !== 'FREE' &&
            !data.payoutTx &&
            data.payoutStatus !== 'completed' &&
            data.payoutStatus !== 'processing'
          ) {
            fetch('/api/escrow/settle', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ gameId: data.id }),
            }).catch((err) => logError('Auto-settle trigger failed:', err));
          }
        }
      } else {
        navigate('/');
      }
    });

    return () => unsub();
  }, [gameId, navigate]);

  // Dynamic Browser Title for Matches
  useEffect(() => {
    if (!game || game.status === 'finished') {
      document.title = 'bobsled.gg - Connect 4';
      return;
    }

    const isP1 = user?.id === game.player1;
    const isP2 = user?.id === game.player2;

    if (isP1 || isP2) {
      const opponentName = isP1 ? game.player2Name : game.player1Name;
      if (opponentName) {
        document.title = `bobsled.gg - vs @${opponentName}`;
      } else {
        document.title = 'bobsled.gg - Connect 4';
      }
    } else {
      // Spectator
      if (game.player1Name && game.player2Name) {
        document.title = `bobsled.gg - @${game.player1Name} vs @${game.player2Name}`;
      } else if (game.player1Name) {
        document.title = `bobsled.gg - @${game.player1Name}`;
      } else {
        document.title = 'bobsled.gg - Connect 4';
      }
    }

    return () => {
      document.title = 'bobsled.gg - Connect 4';
    };
  }, [game, user]);

  // Handle joining via match challenge modal
  const handleJoinViaInvite = async () => {
    if (!user || !game || game.status !== 'waiting') return;
    if (user.id === game.player1) return;

    if (user.isTestUser && game.wager > 0) {
      setWalletModalVisible(true);
      return;
    }

    setIsJoiningInvite(true);
    setJoiningStatus('Preparing stake...');

    try {
      // If it's a SOL staked match, verify host deposit and then deposit into Escrow
      if (game.wager > 0 && game.wagerCurrency !== 'FREE') {
        if (game.escrowStatus !== 'p1_funded' || !game.p1DepositTx) {
          addToast('error', 'Cannot join match: host stake deposit has not been confirmed on-chain yet.');
          return;
        }

        if (!publicKey || !signTransaction) {
          setWalletModalVisible(true);
          return;
        }

        setJoiningStatus(`Approve ${game.wager} SOL deposit in your wallet...`);

        const depositSig = await depositMatchStake({
          connection,
          signTransaction,
          publicKey,
          amountSol: game.wager,
          onSigned: async (_sig) => {
            setJoiningStatus('Entering match...');
          }
        });

        // Fully confirmed on-chain -> verify with backend
        setJoiningStatus('Verifying deposit on backend...');
        const verifyRes = await fetch('/api/escrow/verify-deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: game.id,
            role: 'player2',
            txHash: depositSig,
            senderWallet: publicKey.toBase58(),
            userId: user.id,
            username: user.username || 'Player 2',
            avatarUrl: user.avatarUrl || null,
          }),
        });

        if (!verifyRes.ok) {
          const errData = await verifyRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to verify join deposit on-chain');
        }
      } else {
        // Free game is active immediately
        const firstTurn = Math.random() > 0.5 ? game.player1 : user.id;
        const initialUpdates: any = {
          player2: user.id,
          player2Name: user.username || 'Player 2',
          player2Avatar: user.avatarUrl || null,
          player2IsTest: !!user.isTestUser,
          players: [game.player1, user.id],
          status: 'active',
          turn: firstTurn,
          updatedAt: serverTimestamp(),
          escrowStatus: 'free',
        };
        if (publicKey) initialUpdates.p2Wallet = publicKey.toBase58();
        
        const gameRef = doc(db, 'games', game.id);
        await updateDoc(gameRef, initialUpdates);
      }
      
      setDismissedInviteModal(true);
    } catch (e: any) {
      logError('Failed to join match via invite:', e);
      const msg = e?.message || '';
      if (msg.includes('rejected') || msg.includes('cancelled') || msg.includes('canceled')) {
        addToast('info', 'Transaction cancelled in wallet');
      } else {
        addToast('error', msg || 'Failed to join match.');
      }
    } finally {
      setIsJoiningInvite(false);
      setJoiningStatus(null);
    }
  };

  const handleLeave = () => {
    navigate('/');
  };

  const handleCancelMatch = async () => {
    if (!user || !game || game.status !== 'waiting') return;
    if (game.player1 !== user.id) return;
    try {
      const response = await fetch('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: game.id, userId: user.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel match');
      }
      navigate('/');
    } catch (e: any) {
      logError('Failed to cancel match:', e);
      addToast('error', e.message || 'Failed to cancel match');
    }
  };

  const handleConfirmResign = async () => {
    if (!user || !game || game.status !== 'active') return;
    const opponentId = game.player1 === user.id ? game.player2 : game.player1;
    try {
      await updateDoc(doc(db, 'games', game.id), {
        status: 'finished',
        winner: opponentId,
        updatedAt: serverTimestamp(),
      });
      setShowResignModal(false);
      if (game.wager > 0 && game.wagerCurrency !== 'FREE') {
        fetch('/api/escrow/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: game.id }),
        }).catch((err) => logError('Resign settle failed:', err));
      }
    } catch (e) {
      logError('Resign failed:', e);
    }
  };

  const handleClaimAfk = async () => {
    if (!user || !game || !canClaimAfk) return;
    try {
      await updateDoc(doc(db, 'games', game.id), {
        status: 'finished',
        winner: user.id,
        updatedAt: serverTimestamp(),
      });
      if (game.wager > 0 && game.wagerCurrency !== 'FREE') {
        fetch('/api/escrow/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: game.id }),
        }).catch((err) => logError('AFK settle failed:', err));
      }
    } catch (e) {
      logError('AFK claim failed:', e);
    }
  };

  const handleMove = async (newBoard: number[], winner: string | null) => {
    if (!user || !game || game.status !== 'active') return;
    const nextTurn = game.turn === game.player1 ? game.player2 : game.player1;
    const updates: any = {
      board: newBoard,
      turn: nextTurn,
      updatedAt: serverTimestamp(),
    };

    if (winner) {
      updates.status = 'finished';
      updates.winner = winner;
    }

    try {
      await updateDoc(doc(db, 'games', game.id), updates);
      if (winner && game.wager > 0 && game.wagerCurrency !== 'FREE') {
        fetch('/api/escrow/settle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ gameId: game.id }),
        }).catch((err) => logError('Move settle failed:', err));
      }
    } catch (err) {
      logError('Move failed:', err);
    }
  };

  const getInviteUrl = () => {
    const origin = window.location.origin;
    const code = game?.inviteCode || game?.id;
    return `${origin}/game/${game?.id}?invite=${code}`;
  };

  const getSpectateUrl = () => {
    const origin = window.location.origin;
    return `${origin}/watch/${game?.id}`;
  };

  const handleCopyInvite = () => {
    navigator.clipboard.writeText(getInviteUrl());
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2000);
  };

  const handleCopySpectate = () => {
    navigator.clipboard.writeText(getSpectateUrl());
    setCopiedSpectate(true);
    setTimeout(() => setCopiedSpectate(false), 2000);
  };

  if (!game) {
    return (
      <div className="min-h-screen flex flex-col bg-background text-text-primary antialiased w-full overflow-y-auto">
        <main className="flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-8 pt-24 sm:pt-28 pb-8 flex flex-col gap-5">
          {/* Top Bar Skeleton */}
          <div className="w-full flex items-center justify-between gap-4 pb-2 border-b border-white/5">
            <div className="h-10 w-36 rounded-full bg-white/5 skeleton-shimmer" />
            <div className="flex items-center gap-3">
              <div className="h-8 w-28 rounded-full bg-white/5 skeleton-shimmer" />
              <div className="h-8 w-20 rounded-full bg-white/5 skeleton-shimmer" />
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full items-start">
            {/* Left Column Skeleton */}
            <aside className="lg:col-span-3 space-y-4">
              <div className="rounded-2xl p-4 border border-white/10 bg-white/5 space-y-4">
                <div className="h-5 w-24 rounded bg-white/5 skeleton-shimmer" />
                <div className="h-16 rounded-xl bg-black/40 border border-white/5 skeleton-shimmer" />
                <div className="space-y-2">
                  <div className="h-12 rounded-xl bg-black/40 border border-white/5 skeleton-shimmer" />
                  <div className="h-12 rounded-xl bg-black/40 border border-white/5 skeleton-shimmer" />
                </div>
              </div>
              <div className="rounded-2xl p-4 border border-white/10 bg-white/5 h-32 skeleton-shimmer" />
            </aside>

            {/* Center Board Skeleton */}
            <section className="lg:col-span-6 flex flex-col items-center justify-start gap-4 w-full">
              <div className="w-full max-w-lg aspect-[7/6] bg-white/5 border border-white/10 rounded-3xl p-5 flex flex-col justify-between">
                <div className="grid grid-cols-7 gap-2.5 h-full">
                  {Array.from({ length: 42 }).map((_, idx) => (
                    <div key={idx} className="aspect-square rounded-full bg-black/60 border border-white/5 skeleton-shimmer" />
                  ))}
                </div>
              </div>
            </section>

            {/* Right Chat Skeleton */}
            <aside className="lg:col-span-3 w-full">
              <div className="rounded-2xl p-4 border border-white/10 bg-white/5 h-[480px] skeleton-shimmer" />
            </aside>
          </div>
        </main>
      </div>
    );
  }

  const isPlayer1 = user?.id === game.player1;
  const isPlayer2 = user?.id === game.player2;
  const isParticipant = isPlayer1 || isPlayer2;
  const isSpectator = !isParticipant || isExplicitWatchRoute;

  // Invite modal is shown to any non-participant opening a waiting game
  const showMatchInviteModal = !isParticipant && game.status === 'waiting' && !dismissedInviteModal && !isExplicitWatchRoute;

  const isMyTurn = isParticipant && game.turn === user?.id && game.status === 'active';

  const isP1Guest = game.player1IsTest || game.player1?.startsWith?.('test_');
  const isP2Guest = game.player2IsTest || game.player2?.startsWith?.('test_');

  const p1Color = game.player1Color || 'red';
  const p2Color = game.player2Color || (p1Color === 'red' ? 'white' : 'red');
  const p1IsRed = p1Color === 'red';
  const p2IsRed = p2Color === 'red';

  const p1ColorLabel = p1IsRed ? 'Red' : 'White';
  const p2ColorLabel = p2IsRed ? 'Red' : 'White';

  const p1DisplayName = isP1Guest
    ? (game.player1 === user?.id ? (user?.username || 'You') : game.player1Name || 'Player 1')
    : `@${game.player1 === user?.id ? (user?.username || 'You') : game.player1Name || 'Player 1'}`;

  const p2DisplayName = isP2Guest
    ? (game.player2 === user?.id ? (user?.username || 'You') : game.player2Name || 'Player 2')
    : `@${game.player2 === user?.id ? (user?.username || 'You') : game.player2Name || 'Player 2'}`;

  const timeSinceLastMove = game.updatedAt?.toMillis ? now - game.updatedAt.toMillis() : 0;
  const afkSecondsLeft = Math.max(0, Math.ceil((60000 - timeSinceLastMove) / 1000));
  const canClaimAfk = isParticipant && !isMyTurn && game.status === 'active' && timeSinceLastMove > 60000;

  const isWinner = isParticipant && game.winner === user?.id;
  const isDraw = game.winner === 'draw';
  const isFinished = game.status === 'finished';
  const isFreeGame = game.wager === 0 || game.wagerCurrency === 'FREE';

  const winnerDisplayName = game.winner === game.player1
    ? (isP1Guest ? (game.player1Name || 'Player 1') : `@${game.player1Name || 'Player 1'}`)
    : game.winner === game.player2
    ? (isP2Guest ? (game.player2Name || 'Player 2') : `@${game.player2Name || 'Player 2'}`)
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary antialiased w-full overflow-y-auto">
      
      {/* Floating User Profile Modal */}
      {selectedProfileId && (
        <UserProfileModal
          userId={selectedProfileId}
          onClose={() => setSelectedProfileId(null)}
        />
      )}

      {/* Match Challenge Invitation Modal Popup */}
      {showMatchInviteModal && (
        <MatchInviteModal
          pendingGame={game}
          currentUser={user}
          isJoining={isJoiningInvite}
          joiningStatus={joiningStatus}
          onDirectJoin={handleJoinViaInvite}
          onDismiss={() => setDismissedInviteModal(true)}
        />
      )}

      {/* Spectator Mode Banner */}
      {isSpectator && !showMatchInviteModal && (
        <div className="w-full bg-white/5 border-b border-white/10 py-2.5 text-center text-text-secondary text-xs tracking-wider z-40 flex items-center justify-center gap-2 font-mono pt-20">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span>Watching Match <strong className="text-white">#{game.id.substring(0, 8).toUpperCase()}</strong> as Spectator</span>
        </div>
      )}

      {/* Main Game Page Container */}
      <main className={`flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-8 ${isSpectator && !showMatchInviteModal ? 'pt-6' : 'pt-24 sm:pt-28'} pb-8 flex flex-col gap-5`}>
        
        {/* Prominent Top Match Header Bar */}
        <div className="w-full flex items-center justify-between gap-4 pb-2 border-b border-white/5">
          <button
            onClick={handleLeave}
            className="flex items-center gap-2 text-xs sm:text-sm text-white font-bold py-2 sm:py-2.5 px-4 sm:px-5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 hover:border-primary transition-all shadow-md font-mono cursor-pointer group shrink-0"
          >
            <ArrowLeft size={15} className="text-primary group-hover:-translate-x-1 transition-transform" />
            <span>Back to Lobby</span>
          </button>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-end">
            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 font-mono text-xs text-text-secondary shadow-sm">
              <span className="text-[10px] uppercase tracking-wider text-text-muted font-bold">Match</span>
              <span className="text-white font-bold">#{game.id.substring(0, 8).toUpperCase()}</span>
            </div>

            <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-xs font-mono font-bold text-white shadow-sm">
              {isFreeGame ? 'Free' : <SolAmount amount={game.wager} className="text-primary font-bold" />}
            </div>

            <span
              className={`text-[11px] px-3 py-1.5 rounded-full font-semibold uppercase tracking-wider font-mono ${
                game.status === 'active'
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : game.status === 'waiting'
                  ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                  : 'bg-white/5 text-text-secondary border border-white/10'
              }`}
            >
              {game.status === 'active' ? 'Live' : game.status === 'waiting' ? 'Waiting' : 'Finished'}
            </span>

            {/* Re-open Result Modal Button when game is finished */}
            {isFinished && (
              <button
                onClick={() => setShowWinModal(true)}
                className="px-3.5 py-1.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 hover:border-primary text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer"
                title="View Match Result Summary"
              >
                <Trophy size={13} />
                <span>Result</span>
              </button>
            )}

            {/* Inactivity Timer pill */}
            {game.status === 'active' && !isMyTurn && isParticipant && (
              <div className="px-3 py-1.5 rounded-full bg-white/5 border border-white/10 flex items-center gap-1.5 text-xs font-mono">
                <Warning size={13} className="text-yellow-500" />
                <span className={`font-bold ${afkSecondsLeft < 15 ? 'text-primary animate-pulse' : 'text-text-secondary'}`}>
                  {afkSecondsLeft}s
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 3-Column Responsive Layout: Left (Info) | Center (Board) | Right (Chat) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full items-start">
        
        {/* Left Column: Match Details & Share Links (col-span-3) */}
        <aside className="lg:col-span-3 flex flex-col gap-4 order-2 lg:order-1 w-full">
          
          {/* Match Info Panel */}
          <div className="rounded-2xl p-4 border border-white/10 shadow-xl bg-white/5 space-y-3.5">
            <div className="flex justify-between items-center border-b border-white/10 pb-2.5">
              <div>
                <span className="text-[10px] text-text-muted uppercase tracking-wider block font-semibold font-mono">Match Info</span>
                <h2 className="font-display text-base text-white font-bold font-mono">
                  #{game.id.substring(0, 8).toUpperCase()}
                </h2>
              </div>
              <span
                className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider font-mono ${
                  game.status === 'active'
                    ? 'bg-primary/10 text-primary border border-primary/30'
                    : game.status === 'waiting'
                    ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                    : 'bg-[#1e1e1e] text-text-secondary border border-white/10'
                }`}
              >
                {game.status === 'active' ? 'Live' : game.status === 'waiting' ? 'Waiting' : 'Finished'}
              </span>
            </div>

            {/* Stakes */}
            <div className="flex justify-between items-center bg-background p-3 rounded-xl border border-white/5">
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5 font-mono">Stakes</p>
                <div className="font-display text-lg text-primary font-bold font-mono">
                  {isFreeGame ? 'Free' : <SolAmount amount={game.wager} className="font-bold text-primary" />}
                </div>
              </div>
              {!isFreeGame && (
                <span className="text-xs text-text-secondary bg-[#1a1a1a] px-2.5 py-1 rounded-full border border-white/10 font-mono font-bold">
                  SOL
                </span>
              )}
            </div>

            {/* Player VS Player */}
            <div className="bg-background rounded-xl p-3 border border-white/5 space-y-2.5">
              
              {/* Player 1 */}
              <div
                onClick={() => !isP1Guest && game.player1 && setSelectedProfileId(game.player1)}
                className={`flex items-center justify-between p-1 -m-1 rounded-xl transition-colors ${!isP1Guest ? 'group cursor-pointer hover:bg-white/5' : ''}`}
                title={!isP1Guest ? 'View Profile' : 'Guest Player'}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-full bg-[#181818] border-2 flex items-center justify-center shrink-0 overflow-hidden ${
                    p1IsRed ? 'border-primary shadow-[0_0_8px_rgba(255,77,77,0.35)]' : 'border-white shadow-[0_0_8px_rgba(255,255,255,0.25)]'
                  }`}>
                    {game.player1Avatar ? (
                      <img src={game.player1Avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className={`w-3 h-3 rounded-full ${p1IsRed ? 'bg-primary' : 'bg-white'}`} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-xs sm:text-sm font-bold text-white tracking-tight flex items-center gap-1 group-hover:text-primary transition-colors truncate">
                      <span className="truncate">{p1DisplayName}</span>
                      <span className={`text-[10px] font-semibold font-mono tracking-normal shrink-0 ${p1IsRed ? 'text-primary' : 'text-text-secondary'}`}>
                        ({p1ColorLabel})
                      </span>
                    </p>
                    <p className="text-[10px] text-text-muted font-mono">
                      {game.turn === game.player1 && game.status === 'active' ? 'Thinking...' : 'Ready'}
                    </p>
                  </div>
                </div>
                {game.status === 'active' && game.turn === game.player1 && (
                  <span className={`w-2 h-2 rounded-full animate-ping shrink-0 ${p1IsRed ? 'bg-primary' : 'bg-white'}`} />
                )}
              </div>

              {/* Minimal Divider */}
              <div className="relative flex items-center justify-center my-0.5">
                <div className="w-full border-t border-white/5" />
                <span className="absolute bg-background px-2 text-[9px] text-text-muted uppercase font-semibold tracking-wider font-mono">vs</span>
              </div>

              {/* Player 2 */}
              <div
                onClick={() => !isP2Guest && game.player2 && setSelectedProfileId(game.player2)}
                className={`flex items-center justify-between ${!isP2Guest && game.player2 ? 'group cursor-pointer hover:bg-white/5' : ''} p-1 -m-1 rounded-xl transition-colors`}
                title={!isP2Guest && game.player2 ? 'View Profile' : ''}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-full bg-[#181818] border-2 flex items-center justify-center shrink-0 overflow-hidden ${
                    p2IsRed ? 'border-primary shadow-[0_0_8px_rgba(255,77,77,0.35)]' : 'border-white shadow-[0_0_8px_rgba(255,255,255,0.25)]'
                  }`}>
                    {game.player2Avatar && game.player2 ? (
                      <img src={game.player2Avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className={`w-3 h-3 rounded-full ${p2IsRed ? 'bg-primary' : 'bg-white'}`} />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-display text-xs sm:text-sm font-bold text-white tracking-tight flex items-center gap-1 group-hover:text-primary transition-colors truncate">
                      <span className="truncate">{game.player2 ? p2DisplayName : '...'}</span>
                      <span className={`text-[10px] font-semibold font-mono tracking-normal shrink-0 ${p2IsRed ? 'text-primary' : 'text-text-secondary'}`}>
                        ({p2ColorLabel})
                      </span>
                    </p>
                    <p className="text-[10px] text-text-muted font-mono">
                      {game.player2 ? (game.turn === game.player2 && game.status === 'active' ? 'Thinking...' : 'Ready') : '...'}
                    </p>
                  </div>
                </div>
                {game.status === 'active' && game.turn === game.player2 && (
                  <span className={`w-2 h-2 rounded-full animate-ping shrink-0 ${p2IsRed ? 'bg-primary' : 'bg-white'}`} />
                )}
              </div>
            </div>

            {/* Inactivity warning (Desktop) */}
            {game.status === 'active' && !isMyTurn && isParticipant && (
              <div className="p-2 rounded-full bg-background border border-white/5 flex items-center justify-between text-xs px-3.5">
                <span className="text-text-muted flex items-center gap-1 font-mono text-[11px]">
                  <Warning size={12} className="text-yellow-500" />
                  Opponent Timer:
                </span>
                <span className={`font-mono font-bold text-xs ${afkSecondsLeft < 15 ? 'text-primary animate-pulse' : 'text-text-secondary'}`}>
                  {afkSecondsLeft}s
                </span>
              </div>
            )}
          </div>

          {/* Share Links & Audit Panel */}
          <div className="rounded-2xl p-3.5 border border-white/10 bg-white/5 space-y-2.5">
            <h3 className="text-[11px] text-white font-bold uppercase tracking-wider font-mono">
              Share Links
            </h3>

            {/* One-Time Player Invite Link */}
            {game.status === 'waiting' && isPlayer1 && (
              <div className="space-y-1">
                <div className="flex items-center gap-1 text-[10px] text-primary font-semibold font-display">
                  <UserPlus size={11} />
                  <span>Invite Player Link</span>
                </div>
                <div className="flex gap-1.5">
                  <input
                    id="playerInviteShareInput"
                    name="playerInviteUrl"
                    className="flex-grow bg-background border border-white/10 text-white text-[11px] px-3 py-1 rounded-full focus:border-primary outline-none select-all font-mono min-w-0"
                    readOnly
                    type="text"
                    value={getInviteUrl()}
                  />
                  <button
                    onClick={handleCopyInvite}
                    className="bg-primary hover:bg-red-600 text-white px-3 py-1 rounded-full text-[11px] flex items-center gap-1 transition-colors font-medium cursor-pointer shadow-md font-mono shrink-0"
                  >
                    {copiedInvite ? <Check size={11} /> : <Copy size={11} />}
                    <span>{copiedInvite ? 'Copied' : 'Invite'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Public Spectator Link */}
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-text-secondary font-semibold font-display">
                <Eye size={11} />
                <span>Spectator Link</span>
              </div>
              <div className="flex gap-1.5">
                <input
                  id="spectatorShareInput"
                  name="spectatorShareUrl"
                  className="flex-grow bg-background border border-white/10 text-white text-[11px] px-3 py-1 rounded-full focus:border-primary outline-none select-all font-mono min-w-0"
                  readOnly
                  type="text"
                  value={getSpectateUrl()}
                />
                <button
                  onClick={handleCopySpectate}
                  className="bg-[#1e1e1e] border border-white/10 hover:border-primary text-white px-3 py-1 rounded-full text-[11px] flex items-center gap-1 transition-colors font-medium cursor-pointer font-mono shrink-0"
                >
                  {copiedSpectate ? <Check size={11} className="text-emerald-400" /> : <Copy size={11} />}
                  <span>{copiedSpectate ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* On-Chain Solscan Proof Link */}
            {game.p1DepositTx && (
              <div className="pt-1.5 border-t border-white/5 flex items-center justify-between text-[10px] font-mono">
                <span className="text-text-muted">Host Deposit:</span>
                <a
                  href={`https://solscan.io/tx/${game.p1DepositTx}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  <span>Solscan</span>
                  <ArrowUpRight size={9} />
                </a>
              </div>
            )}
            {game.p2DepositTx && (
              <div className="pt-0.5 flex items-center justify-between text-[10px] font-mono">
                <span className="text-text-muted">Player 2 Deposit:</span>
                <a
                  href={`https://solscan.io/tx/${game.p2DepositTx}?cluster=devnet`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline flex items-center gap-1"
                >
                  <span>Solscan</span>
                  <ArrowUpRight size={9} />
                </a>
              </div>
            )}

            {/* Spectator Section */}
            <div className="pt-2.5 border-t border-white/5 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] text-text-muted font-bold uppercase tracking-wider font-mono">
                  <Eye size={12} className="text-text-muted" />
                  <span>Spectators ({spectators.length})</span>
                </div>
              </div>

              {spectators.length === 0 ? (
                <p className="text-text-muted text-[11px] font-mono italic">
                  No spectators watching
                </p>
              ) : (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {spectators.map((spec) => {
                    const specName = spec.isTestUser ? (spec.username || 'Guest') : `@${spec.username || 'Spectator'}`;
                    return (
                      <button
                        key={spec.id}
                        onClick={() => setSelectedProfileId(spec.id)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/40 hover:bg-white/5 border border-white/5 hover:border-white/20 text-text-muted hover:text-white text-[11px] font-mono transition-all cursor-pointer group"
                        title={`View ${specName}'s profile`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/70 group-hover:bg-emerald-400 shrink-0" />
                        <span className="truncate max-w-[120px]">{specName}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Center Column: Game Board & Actions (col-span-6) */}
        <section className="lg:col-span-6 flex flex-col items-center justify-start gap-4 order-1 lg:order-2 w-full">

          {/* Mobile-Only Player Summary Bar Above Board */}
          <div className="lg:hidden w-full bg-white/5 border border-white/10 rounded-2xl p-2.5 flex items-center justify-between shadow-md font-mono text-xs">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={`w-3 h-3 rounded-full shrink-0 ${p1IsRed ? 'bg-primary shadow-[0_0_8px_rgba(255,77,77,0.6)]' : 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'}`} />
              <div className="min-w-0">
                <p className={`truncate font-semibold text-xs ${game.turn === game.player1 && game.status === 'active' ? 'text-primary font-bold' : 'text-white'}`}>
                  {p1DisplayName}
                </p>
                <p className="text-[10px] text-text-muted">{p1ColorLabel}</p>
              </div>
            </div>

            <div className="px-2.5 py-1 rounded-full bg-background border border-white/10 text-[10px] text-text-secondary font-bold shrink-0 mx-2">
              {isFreeGame ? 'FREE' : <SolAmount amount={game.wager} />}
            </div>

            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right">
              <div className="min-w-0">
                <p className={`truncate font-semibold text-xs ${game.turn === game.player2 && game.status === 'active' ? 'text-primary font-bold' : 'text-white'}`}>
                  {game.player2 ? p2DisplayName : '...'}
                </p>
                <p className="text-[10px] text-text-muted">{p2ColorLabel}</p>
              </div>
              <span className={`w-3 h-3 rounded-full shrink-0 ${p2IsRed ? 'bg-primary shadow-[0_0_8px_rgba(255,77,77,0.6)]' : 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'}`} />
            </div>
          </div>

          {/* Connect 4 Board Component - Touch Friendly & Bigger on Mobile */}
          <Connect4 game={game} user={user} isSpectator={isSpectator} onMove={handleMove} />

          {/* Action Bar Beneath Board */}
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 mt-1 sm:mt-2 w-full max-w-2xl">
            
            {/* Prominent Cancel Game Button Beneath Board when waiting */}
            {game.status === 'waiting' && game.player1 === user?.id && (
              <button
                onClick={handleCancelMatch}
                className="w-full sm:w-auto bg-red-950/40 hover:bg-red-900/60 border border-red-900/70 hover:border-red-500 text-red-400 hover:text-white px-8 py-3 rounded-full text-xs sm:text-sm uppercase tracking-wider transition-all shadow-[0_0_20px_rgba(255,0,0,0.25)] flex items-center justify-center gap-2 font-bold font-mono cursor-pointer active:scale-[0.99]"
              >
                <X size={16} />
                <span>Cancel Game</span>
              </button>
            )}

            {/* Resign Button */}
            {game.status === 'active' && isParticipant && (
              <button
                onClick={() => setShowResignModal(true)}
                className="bg-white/5 hover:bg-red-950/40 border border-white/10 hover:border-red-900/60 text-text-secondary hover:text-red-400 px-6 py-2.5 rounded-full text-xs uppercase tracking-wider transition-all flex items-center gap-2 font-semibold font-mono cursor-pointer"
              >
                <Flag size={14} /> Resign
              </button>
            )}

            {/* Claim Victory (AFK) */}
            {canClaimAfk && (
              <button
                onClick={handleClaimAfk}
                className="w-full sm:w-auto bg-primary text-white text-xs uppercase tracking-wider px-6 py-2.5 rounded-full hover:bg-red-600 transition-all shadow-[0_0_20px_rgba(255,77,77,0.6)] animate-bounce flex items-center justify-center gap-2 font-bold font-mono cursor-pointer"
              >
                <Trophy size={14} /> Claim Win (Opponent Inactive)
              </button>
            )}

            {/* Finished Action */}
            {isFinished && (
              <div className="flex items-center justify-center gap-3 flex-wrap w-full">
                <button
                  onClick={() => setShowWinModal(true)}
                  className="bg-white/5 hover:bg-white/10 text-white border border-white/10 hover:border-primary text-xs uppercase tracking-wider px-6 py-3 rounded-full transition-all font-bold flex items-center justify-center gap-2 font-mono cursor-pointer shadow-sm hover-magnetic"
                >
                  <Trophy size={14} className="text-primary" />
                  <span>Match Results</span>
                </button>
                <button
                  onClick={handleLeave}
                  className="bg-primary text-white text-xs uppercase tracking-wider px-8 py-3 rounded-full hover:bg-red-600 transition-all shadow-[0_0_20px_rgba(255,77,77,0.3)] font-bold flex items-center justify-center gap-2 font-mono cursor-pointer hover-magnetic btn-flashy"
                >
                  <span>Return to Lobby</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Chat Box (col-span-3) */}
        <aside className="lg:col-span-3 flex flex-col order-3 w-full">
          <div className="rounded-2xl border border-white/10 overflow-hidden flex flex-col h-[520px] bg-white/5 shadow-xl">
            {isSpectator ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2 bg-[#121212]">
                <ChatCircleOff size={24} className="text-text-muted mb-1" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Private Chat
                </h4>
                <p className="text-xs text-text-muted max-w-[200px] font-sans">
                  In-game chat is private and only available to active players.
                </p>
              </div>
            ) : (
              <Chat gameId={game.id} />
            )}
          </div>
        </aside>
        </div>
      </main>

      {/* In-App Custom Resign Confirmation Modal */}
      <AnimatePresence>
        {showResignModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowResignModal(false)}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-white/5 border border-white/10 shadow-2xl rounded-3xl p-6 sm:p-8 space-y-5"
            >
              <h3 className="text-lg font-bold text-white font-headline-lg">Resign Match</h3>
              <p className="text-xs text-text-secondary">
                Are you sure you want to forfeit this match? Your opponent will be awarded the victory.
              </p>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setShowResignModal(false)}
                  className="px-5 py-2 rounded-full bg-[#202020] text-white text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmResign}
                  className="px-6 py-2 rounded-full bg-red-600 hover:bg-red-700 text-white text-xs font-semibold transition-all shadow-[0_0_15px_rgba(255,0,0,0.4)] cursor-pointer font-mono"
                >
                  Confirm Resign
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* End Game Modal */}
      <AnimatePresence>
        {isFinished && showWinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 15 }}
              className="rounded-3xl p-8 sm:p-10 max-w-md w-full flex flex-col items-center text-center gap-6 border border-primary/50 shadow-[0_0_50px_rgba(255,77,77,0.25)] bg-white/5 relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-primary" />

              {/* Close Button (X) */}
              <button
                onClick={() => setShowWinModal(false)}
                className="absolute top-4 right-4 text-text-muted hover:text-white bg-black/40 hover:bg-white/10 p-2 rounded-full border border-white/10 transition-colors cursor-pointer"
                title="Close modal and review board"
              >
                <X size={15} />
              </button>

              {/* Icon */}
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl ${
                  isWinner
                    ? 'bg-primary text-white shadow-[0_0_25px_rgba(255,77,77,0.7)]'
                    : isDraw
                    ? 'bg-[#222222] text-text-muted'
                    : isSpectator
                    ? 'bg-primary text-white shadow-[0_0_25px_rgba(255,77,77,0.7)]'
                    : 'bg-[#1a1a1a] text-text-secondary border border-white/10'
                }`}
              >
                {isWinner ? <Trophy size={32} /> : isDraw ? <User size={32} /> : isSpectator ? <Trophy size={32} /> : <XCircle size={32} />}
              </div>

              {/* Title & Standard Subtitles */}
              <div className="space-y-2">
                <h2 className="font-headline-lg text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {isWinner ? 'You Won!' : isDraw ? 'Match Draw' : isSpectator ? (isDraw ? 'Match Draw' : `${winnerDisplayName} Won!`) : 'You Lost'}
                </h2>
                <div className="text-sm text-text-secondary font-sans space-y-2">
                  {isWinner ? (
                    isFreeGame ? (
                      <div>Free game</div>
                    ) : (
                      <div className="flex flex-col items-center gap-2">
                        <div className="inline-flex items-center gap-1">
                          <span>Prize:</span>
                          <SolAmount amount={game.wager * 2} className="font-bold text-primary font-mono" />
                        </div>
                        {game.payoutTx ? (
                          <div className="flex flex-col items-center gap-1.5 pt-1">
                            {game.payoutStatus === 'completed' ? (
                              <span className="text-xs text-emerald-400 font-mono font-semibold">
                                ✓ Disbursed to your wallet
                              </span>
                            ) : (
                              <div className="inline-flex items-center gap-1.5 text-xs text-amber-300 font-mono">
                                <CircleNotch size={13} className="animate-spin text-primary" />
                                <span>Disbursing winnings to wallet...</span>
                              </div>
                            )}
                            <a
                              href={`https://solscan.io/tx/${game.payoutTx}?cluster=devnet`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-white underline font-mono transition-colors"
                            >
                              <span>View on Solscan</span>
                              <ArrowUpRight size={11} />
                            </a>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 pt-1">
                            <div className="inline-flex items-center gap-1.5 text-xs text-amber-300 font-mono">
                              <CircleNotch size={13} className="animate-spin text-primary" />
                              <span>Disbursing winnings to wallet...</span>
                            </div>
                            {(game.p1DepositTx || game.p2DepositTx) && (
                              <a
                                href={`https://solscan.io/tx/${(game.winner === game.player1 ? game.p1DepositTx : game.p2DepositTx) || game.p1DepositTx}?cluster=devnet`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-white underline font-mono transition-colors"
                              >
                                <span>View match stake on Solscan</span>
                                <ArrowUpRight size={11} />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  ) : isDraw ? (
                    <div>
                      The match ended in a draw.
                      {!isFreeGame && (
                        <div className="flex flex-col items-center gap-1 mt-1">
                          <p className="text-xs text-emerald-400 font-mono">
                            Deposit returned to wallets.
                          </p>
                          {game.payoutTx ? (
                            <a
                              href={`https://solscan.io/tx/${game.payoutTx}?cluster=devnet`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-white underline font-mono transition-colors"
                            >
                              <span>View refund on Solscan</span>
                              <ArrowUpRight size={11} />
                            </a>
                          ) : (game.p1DepositTx || game.p2DepositTx) ? (
                            <a
                              href={`https://solscan.io/tx/${game.p1DepositTx || game.p2DepositTx}?cluster=devnet`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-white underline font-mono transition-colors"
                            >
                              <span>View match stake on Solscan</span>
                              <ArrowUpRight size={11} />
                            </a>
                          ) : null}
                        </div>
                      )}
                    </div>
                  ) : isSpectator ? (
                    <div className="space-y-2">
                      {isFreeGame ? (
                        <div>Free match completed</div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <div className="inline-flex items-center gap-1">
                            <span>Prize Won:</span>
                            <SolAmount amount={game.wager * 2} className="font-bold text-primary font-mono" />
                          </div>
                          {game.payoutTx ? (
                            <div className="flex flex-col items-center gap-1.5 pt-1">
                              {game.payoutStatus === 'completed' ? (
                                <span className="text-xs text-emerald-400 font-mono font-semibold">
                                  ✓ Disbursed to winner's wallet
                                </span>
                              ) : (
                                <div className="inline-flex items-center gap-1.5 text-xs text-amber-300 font-mono">
                                  <CircleNotch size={13} className="animate-spin text-primary" />
                                  <span>Disbursing winnings to wallet...</span>
                                </div>
                              )}
                              <a
                                href={`https://solscan.io/tx/${game.payoutTx}?cluster=devnet`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-white underline font-mono transition-colors"
                              >
                                <span>View payout on Solscan</span>
                                <ArrowUpRight size={11} />
                              </a>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center gap-1.5 pt-1">
                              <div className="inline-flex items-center gap-1.5 text-xs text-amber-300 font-mono">
                                <CircleNotch size={13} className="animate-spin text-primary" />
                                <span>Disbursing winnings to wallet...</span>
                              </div>
                              {(game.p1DepositTx || game.p2DepositTx) && (
                                <a
                                  href={`https://solscan.io/tx/${(game.winner === game.player1 ? game.p1DepositTx : game.p2DepositTx) || game.p1DepositTx}?cluster=devnet`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-white underline font-mono transition-colors"
                                >
                                  <span>View match stake on Solscan</span>
                                  <ArrowUpRight size={11} />
                                </a>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div>Match completed. Better luck next time!</div>
                      {!isFreeGame && (
                        game.payoutTx ? (
                          <div className="pt-2">
                            <a
                              href={`https://solscan.io/tx/${game.payoutTx}?cluster=devnet`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-white underline font-mono transition-colors"
                            >
                              <span>View payout on Solscan</span>
                              <ArrowUpRight size={11} />
                            </a>
                          </div>
                        ) : (game.p1DepositTx || game.p2DepositTx) ? (
                          <div className="pt-2">
                            <a
                              href={`https://solscan.io/tx/${(game.winner === game.player1 ? game.p1DepositTx : game.p2DepositTx) || game.p1DepositTx}?cluster=devnet`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[11px] text-text-muted hover:text-white underline font-mono transition-colors"
                            >
                              <span>View match stake on Solscan</span>
                              <ArrowUpRight size={11} />
                            </a>
                          </div>
                        ) : null
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 w-full">
                <button
                  onClick={() => setShowWinModal(false)}
                  className="flex-1 bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white py-3 rounded-full text-xs uppercase tracking-wider font-semibold border border-white/10 transition-all font-mono cursor-pointer hover-magnetic"
                >
                  Review Board
                </button>
                <button
                  onClick={handleLeave}
                  className="flex-1 bg-primary text-white py-3 rounded-full text-xs uppercase tracking-wider font-semibold hover:bg-red-600 transition-all shadow-[0_0_20px_rgba(255,77,77,0.35)] font-mono cursor-pointer hover-magnetic btn-flashy"
                >
                  Back to Lobby
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
