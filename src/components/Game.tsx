import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
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
import { logError } from '../utils/logger';
import {
  ArrowLeft,
  Copy,
  Check,
  Trophy,
  Flag,
  AlertTriangle,
  XCircle,
  ArrowRight,
  User,
  MessageSquareOff,
  UserPlus,
  Eye,
  Swords,
  X,
  ExternalLink,
} from 'lucide-react';
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
  const heartbeatIntervalRef = useRef<any>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

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
        }
      } else {
        navigate('/');
      }
    });

    return () => unsub();
  }, [gameId, navigate]);

  // Dynamic Browser Title: "bobsled vs {user}"
  useEffect(() => {
    if (!game) {
      document.title = 'bobsled';
      return;
    }

    const isP1 = user?.id === game.player1;
    const isP2 = user?.id === game.player2;

    let opponentName: string | null = null;
    if (isP1) {
      opponentName = game.player2Name || null;
    } else if (isP2) {
      opponentName = game.player1Name || null;
    } else {
      // Spectator
      if (game.player1Name && game.player2Name) {
        opponentName = `${game.player1Name} vs ${game.player2Name}`;
      } else if (game.player1Name) {
        opponentName = game.player1Name;
      }
    }

    if (opponentName) {
      document.title = `bobsled vs ${opponentName}`;
    } else {
      document.title = 'bobsled';
    }

    return () => {
      document.title = 'bobsled';
    };
  }, [game, user]);

  // Guest User Auto-Forfeit on Disconnect / Tab Close
  useEffect(() => {
    if (!game || game.status !== 'active' || !user?.id) return;

    const isGuestUser = user.isTestUser || user.id.startsWith('test_');
    const isP1 = game.player1 === user.id;
    const isP2 = game.player2 === user.id;
    if (!isP1 && !isP2) return;

    const opponentId = isP1 ? game.player2 : game.player1;

    // 1. Unload & Pagehide listener
    const handleForfeitOnDisconnect = () => {
      if (isGuestUser && game.status === 'active' && opponentId) {
        updateDoc(doc(db, 'games', game.id), {
          status: 'finished',
          winner: opponentId,
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleForfeitOnDisconnect);
    window.addEventListener('pagehide', handleForfeitOnDisconnect);

    // 2. Periodic Heartbeat for guest users
    if (isGuestUser) {
      const field = isP1 ? 'player1Heartbeat' : 'player2Heartbeat';
      heartbeatIntervalRef.current = setInterval(() => {
        updateDoc(doc(db, 'games', game.id), {
          [field]: Date.now(),
          updatedAt: serverTimestamp(),
        }).catch(() => {});
      }, 3000);
    }

    // 3. Opponent checks if the guest user has disconnected (no heartbeat for > 8s)
    const opponentIsGuest = isP1
      ? (game.player2IsTest || game.player2?.startsWith('test_'))
      : (game.player1IsTest || game.player1?.startsWith('test_'));

    let disconnectCheckInterval: any = null;

    if (opponentIsGuest) {
      const oppHeartbeatField = isP1 ? 'player2Heartbeat' : 'player1Heartbeat';
      disconnectCheckInterval = setInterval(() => {
        const lastHb = game[oppHeartbeatField] || game.updatedAt?.toMillis?.() || 0;
        if (Date.now() - lastHb > 8000 && game.status === 'active') {
          updateDoc(doc(db, 'games', game.id), {
            status: 'finished',
            winner: user.id,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
      }, 2000);
    }

    return () => {
      window.removeEventListener('beforeunload', handleForfeitOnDisconnect);
      window.removeEventListener('pagehide', handleForfeitOnDisconnect);
      if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
      if (disconnectCheckInterval) clearInterval(disconnectCheckInterval);
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
      let p2DepositTx: string | null = null;

      // If it's a SOL staked match, deposit into Escrow
      if (game.wager > 0 && game.wagerCurrency !== 'FREE') {
        if (!publicKey || !signTransaction) {
          setWalletModalVisible(true);
          return;
        }

        setJoiningStatus(`Approve ${game.wager} SOL deposit in your wallet...`);

        p2DepositTx = await depositMatchStake({
          connection,
          signTransaction,
          publicKey,
          amountSol: game.wager,
        });

        setJoiningStatus('Entering match...');
      }

      // Randomly assign who goes first
      const firstTurn = Math.random() > 0.5 ? game.player1 : user.id;

      const updates: any = {
        player2: user.id,
        player2Name: user.username || 'Player 2',
        player2Avatar: user.avatarUrl || null,
        player2IsTest: !!user.isTestUser,
        players: [game.player1, user.id],
        status: 'active',
        turn: firstTurn,
        updatedAt: serverTimestamp(),
      };

      if (p2DepositTx) {
        updates.p2DepositTx = p2DepositTx;
        updates.escrowStatus = 'fully_funded';
      }

      if (publicKey) {
        updates.p2Wallet = publicKey.toBase58();
      }

      await updateDoc(doc(db, 'games', game.id), updates);
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
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] bg-[#0e0e0e]">
        <div className="w-8 h-8 border-2 border-velocity-red/30 border-t-velocity-red rounded-full animate-spin mb-4" />
        <p className="text-xs uppercase tracking-wider text-text-muted font-mono">Loading Game...</p>
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
  const opponentAvatar = isPlayer1 ? game.player2Avatar : game.player1Avatar;

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

  return (
    <div className="min-h-[calc(100vh-76px)] flex flex-col bg-[#0e0e0e] text-text-primary antialiased w-full overflow-y-auto">
      
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
        <div className="w-full bg-[#141414] border-b border-white/10 py-2 text-center text-text-secondary text-xs tracking-wider z-40 flex items-center justify-center gap-2 font-mono">
          <span className="w-2 h-2 rounded-full bg-velocity-red animate-pulse" />
          <span>Watching Match <strong className="text-white">#{game.id.substring(0, 8).toUpperCase()}</strong> as Spectator</span>
        </div>
      )}

      {/* Arena Main Container */}
      <main className="flex-grow w-full max-w-6xl mx-auto px-3 sm:px-6 md:px-8 py-4 sm:py-6 md:py-8 flex flex-col lg:flex-row gap-5 lg:gap-6">
        
        {/* Right Column: Game Board & Actions (Rendered Top on Mobile, Right on Desktop) */}
        <section className="flex-1 flex flex-col items-center justify-start gap-4 sm:gap-6 order-1 lg:order-2 w-full">
          
          {/* Top Bar Actions with Enhanced 'Back to Lobby' Button */}
          <div className="w-full flex justify-between items-center">
            <button
              onClick={handleLeave}
              className="flex items-center gap-2 text-xs sm:text-sm text-white font-bold py-2 sm:py-2.5 px-4 sm:px-5 rounded-full bg-[#1c1c1c] hover:bg-[#262626] border border-white/20 hover:border-velocity-red transition-all shadow-md font-mono cursor-pointer group shrink-0"
            >
              <ArrowLeft size={15} className="text-velocity-red group-hover:-translate-x-1 transition-transform" />
              <span>Back to Lobby</span>
            </button>

            {/* Mobile-Only Inactivity Timer pill */}
            {game.status === 'active' && !isMyTurn && isParticipant && (
              <div className="lg:hidden px-3 py-1.5 rounded-full bg-[#141414] border border-white/10 flex items-center gap-1.5 text-[11px] font-mono">
                <AlertTriangle size={12} className="text-yellow-500" />
                <span className={`font-bold ${afkSecondsLeft < 15 ? 'text-velocity-red animate-pulse' : 'text-text-secondary'}`}>
                  {afkSecondsLeft}s
                </span>
              </div>
            )}
          </div>

          {/* Mobile-Only Player Summary Bar Above Board */}
          <div className="lg:hidden w-full bg-[#141414] border border-white/10 rounded-2xl p-2.5 flex items-center justify-between shadow-md font-mono text-xs">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className={`w-3 h-3 rounded-full shrink-0 ${p1IsRed ? 'bg-velocity-red shadow-[0_0_8px_rgba(255,77,77,0.6)]' : 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'}`} />
              <div className="min-w-0">
                <p className={`truncate font-semibold text-xs ${game.turn === game.player1 && game.status === 'active' ? 'text-velocity-red font-bold' : 'text-white'}`}>
                  {p1DisplayName}
                </p>
                <p className="text-[10px] text-text-muted">{p1ColorLabel}</p>
              </div>
            </div>

            <div className="px-2.5 py-1 rounded-full bg-[#0e0e0e] border border-white/10 text-[10px] text-text-secondary font-bold shrink-0 mx-2">
              {isFreeGame ? 'FREE' : <SolAmount amount={game.wager} />}
            </div>

            <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right">
              <div className="min-w-0">
                <p className={`truncate font-semibold text-xs ${game.turn === game.player2 && game.status === 'active' ? 'text-velocity-red font-bold' : 'text-white'}`}>
                  {game.player2 ? p2DisplayName : '...'}
                </p>
                <p className="text-[10px] text-text-muted">{p2ColorLabel}</p>
              </div>
              <span className={`w-3 h-3 rounded-full shrink-0 ${p2IsRed ? 'bg-velocity-red shadow-[0_0_8px_rgba(255,77,77,0.6)]' : 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.4)]'}`} />
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
                className="bg-[#141414] hover:bg-red-950/40 border border-white/10 hover:border-red-900/60 text-text-secondary hover:text-red-400 px-6 py-2.5 rounded-full text-xs uppercase tracking-wider transition-all flex items-center gap-2 font-semibold font-mono cursor-pointer"
              >
                <Flag size={14} /> Resign
              </button>
            )}

            {/* Claim Victory (AFK) */}
            {canClaimAfk && (
              <button
                onClick={handleClaimAfk}
                className="w-full sm:w-auto bg-velocity-red text-white text-xs uppercase tracking-wider px-6 py-2.5 rounded-full hover:bg-red-600 transition-all shadow-[0_0_20px_rgba(255,77,77,0.6)] animate-bounce flex items-center justify-center gap-2 font-bold font-mono cursor-pointer"
              >
                <Trophy size={14} /> Claim Win (Opponent Inactive)
              </button>
            )}

            {/* Finished Action */}
            {isFinished && (
              <button
                onClick={handleLeave}
                className="w-full sm:w-auto bg-velocity-red text-white text-xs uppercase tracking-wider px-8 py-3 rounded-full hover:bg-red-600 transition-all shadow-[0_0_20px_rgba(255,77,77,0.4)] font-bold flex items-center justify-center gap-2 font-mono cursor-pointer"
              >
                <span>Return to Lobby</span>
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </section>

        {/* Left Column: Match Details & Chat (1/3) */}
        <aside className="w-full lg:w-80 flex flex-col gap-5 order-2 lg:order-1 shrink-0">
          
          {/* Match Info Panel */}
          <div className="rounded-2xl p-4 sm:p-5 border border-white/10 shadow-2xl bg-[#141414] space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <div>
                <span className="text-[10px] text-text-muted uppercase tracking-wider block font-semibold font-mono">Match ID</span>
                <h2 className="font-headline-lg text-lg text-white font-bold font-mono">
                  #{game.id.substring(0, 8).toUpperCase()}
                </h2>
              </div>
              <span
                className={`text-[11px] px-3 py-1 rounded-full font-semibold uppercase tracking-wider font-mono ${
                  game.status === 'active'
                    ? 'bg-velocity-red/10 text-velocity-red border border-velocity-red/30'
                    : game.status === 'waiting'
                    ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'
                    : 'bg-[#1e1e1e] text-text-secondary border border-white/10'
                }`}
              >
                {game.status === 'active' ? 'Live' : game.status === 'waiting' ? 'Waiting' : 'Finished'}
              </span>
            </div>

            {/* Stakes */}
            <div className="flex justify-between items-center bg-[#0e0e0e] p-3.5 rounded-xl border border-white/5">
              <div>
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5 font-mono">Stakes</p>
                <div className="font-headline-lg text-xl text-velocity-red font-bold font-mono">
                  {isFreeGame ? 'Free' : <SolAmount amount={game.wager} className="font-bold text-velocity-red" />}
                </div>
              </div>
              {!isFreeGame && (
                <span className="text-xs text-text-secondary bg-[#1a1a1a] px-3 py-1 rounded-full border border-white/10 font-mono font-bold">
                  SOL
                </span>
              )}
            </div>

            {/* Player VS Player */}
            <div className="bg-[#0e0e0e] rounded-xl p-4 border border-white/5 space-y-3.5">
              
              {/* Player 1 */}
              <div
                onClick={() => !isP1Guest && game.player1 && setSelectedProfileId(game.player1)}
                className={`flex items-center justify-between p-1.5 -m-1.5 rounded-xl transition-colors ${!isP1Guest ? 'group cursor-pointer hover:bg-white/5' : ''}`}
                title={!isP1Guest ? 'View Profile' : 'Guest Player'}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full bg-[#181818] border-2 flex items-center justify-center shrink-0 overflow-hidden ${
                    p1IsRed ? 'border-velocity-red shadow-[0_0_10px_rgba(255,77,77,0.35)]' : 'border-white shadow-[0_0_10px_rgba(255,255,255,0.25)]'
                  }`}>
                    {game.player1Avatar ? (
                      <img src={game.player1Avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className={`w-3.5 h-3.5 rounded-full ${p1IsRed ? 'bg-velocity-red' : 'bg-white'}`} />
                    )}
                  </div>
                  <div>
                    <p className="font-headline-lg text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-1.5 group-hover:text-velocity-red transition-colors">
                      <span>{p1DisplayName}</span>
                      <span className={`text-[11px] font-semibold font-mono tracking-normal ${p1IsRed ? 'text-velocity-red' : 'text-text-secondary'}`}>
                        ({p1ColorLabel})
                      </span>
                    </p>
                    <p className="text-xs text-text-muted font-mono">
                      {game.turn === game.player1 && game.status === 'active' ? 'Thinking...' : 'Ready'}
                    </p>
                  </div>
                </div>
                {game.status === 'active' && game.turn === game.player1 && (
                  <span className={`w-2.5 h-2.5 rounded-full animate-ping ${p1IsRed ? 'bg-velocity-red' : 'bg-white'}`} />
                )}
              </div>

              {/* Minimal Divider */}
              <div className="relative flex items-center justify-center my-1">
                <div className="w-full border-t border-white/5" />
                <span className="absolute bg-[#0e0e0e] px-2 text-[10px] text-text-muted uppercase font-semibold tracking-wider font-mono">vs</span>
              </div>

              {/* Player 2 */}
              <div
                onClick={() => !isP2Guest && game.player2 && setSelectedProfileId(game.player2)}
                className={`flex items-center justify-between ${!isP2Guest && game.player2 ? 'group cursor-pointer hover:bg-white/5' : ''} p-1.5 -m-1.5 rounded-xl transition-colors`}
                title={!isP2Guest && game.player2 ? 'View Profile' : ''}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-full bg-[#181818] border-2 flex items-center justify-center shrink-0 overflow-hidden ${
                    p2IsRed ? 'border-velocity-red shadow-[0_0_10px_rgba(255,77,77,0.35)]' : 'border-white shadow-[0_0_10px_rgba(255,255,255,0.25)]'
                  }`}>
                    {opponentAvatar && game.player2 ? (
                      <img src={opponentAvatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className={`w-3.5 h-3.5 rounded-full ${p2IsRed ? 'bg-velocity-red' : 'bg-white'}`} />
                    )}
                  </div>
                  <div>
                    <p className="font-headline-lg text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-1.5 group-hover:text-velocity-red transition-colors">
                      <span>{game.player2 ? p2DisplayName : '...'}</span>
                      <span className={`text-[11px] font-semibold font-mono tracking-normal ${p2IsRed ? 'text-velocity-red' : 'text-text-secondary'}`}>
                        ({p2ColorLabel})
                      </span>
                    </p>
                    <p className="text-xs text-text-muted font-mono">
                      {game.player2 ? (game.turn === game.player2 && game.status === 'active' ? 'Thinking...' : 'Ready') : '...'}
                    </p>
                  </div>
                </div>
                {game.status === 'active' && game.turn === game.player2 && (
                  <span className={`w-2.5 h-2.5 rounded-full animate-ping ${p2IsRed ? 'bg-velocity-red' : 'bg-white'}`} />
                )}
              </div>
            </div>

            {/* Inactivity warning (Desktop) */}
            {game.status === 'active' && !isMyTurn && isParticipant && (
              <div className="hidden lg:flex p-2.5 rounded-full bg-[#0e0e0e] border border-white/5 items-center justify-between text-xs px-4">
                <span className="text-text-muted flex items-center gap-1.5 font-mono">
                  <AlertTriangle size={13} className="text-yellow-500" />
                  Opponent Timer:
                </span>
                <span className={`font-mono font-bold ${afkSecondsLeft < 15 ? 'text-velocity-red animate-pulse' : 'text-text-secondary'}`}>
                  {afkSecondsLeft}s
                </span>
              </div>
            )}
          </div>

          {/* Share Links & On-Chain Audit Panel */}
          <div className="rounded-2xl p-4 border border-white/10 bg-[#141414] space-y-3">
            <h3 className="text-xs text-white font-bold uppercase tracking-wider font-mono">
              Share Links
            </h3>

            {/* One-Time Player Invite Link */}
            {game.status === 'waiting' && isPlayer1 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1 text-[11px] text-velocity-red font-semibold font-headline-lg">
                  <UserPlus size={12} />
                  <span>Invite Player Link (To Play)</span>
                </div>
                <div className="flex gap-2">
                  <input
                    className="flex-grow bg-[#0e0e0e] border border-white/10 text-white text-xs px-3 py-1.5 rounded-full focus:border-velocity-red outline-none select-all font-mono"
                    readOnly
                    type="text"
                    value={getInviteUrl()}
                  />
                  <button
                    onClick={handleCopyInvite}
                    className="bg-velocity-red hover:bg-red-600 text-white px-3.5 py-1.5 rounded-full text-xs flex items-center gap-1 transition-colors font-medium cursor-pointer shadow-md font-mono shrink-0"
                  >
                    {copiedInvite ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copiedInvite ? 'Copied' : 'Invite'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Public Spectator Link */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-[11px] text-text-secondary font-semibold font-headline-lg">
                <Eye size={12} />
                <span>Spectator Link (To Watch)</span>
              </div>
              <div className="flex gap-2">
                <input
                  className="flex-grow bg-[#0e0e0e] border border-white/10 text-white text-xs px-3 py-1.5 rounded-full focus:border-velocity-red outline-none select-all font-mono"
                  readOnly
                  type="text"
                  value={getSpectateUrl()}
                />
                <button
                  onClick={handleCopySpectate}
                  className="bg-[#1e1e1e] border border-white/10 hover:border-velocity-red text-white px-3.5 py-1.5 rounded-full text-xs flex items-center gap-1 transition-colors font-medium cursor-pointer font-mono shrink-0"
                >
                  {copiedSpectate ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                  <span>{copiedSpectate ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* On-Chain Solscan Proof Link */}
            {game.p1DepositTx && (
              <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono">
                <span className="text-text-muted">Host Deposit Proof:</span>
                <a
                  href={`https://solscan.io/tx/${game.p1DepositTx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-velocity-red hover:underline flex items-center gap-1"
                >
                  <span>Solscan</span>
                  <ExternalLink size={10} />
                </a>
              </div>
            )}
            {game.p2DepositTx && (
              <div className="pt-1 flex items-center justify-between text-[11px] font-mono">
                <span className="text-text-muted">Player 2 Deposit:</span>
                <a
                  href={`https://solscan.io/tx/${game.p2DepositTx}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-velocity-red hover:underline flex items-center gap-1"
                >
                  <span>Solscan</span>
                  <ExternalLink size={10} />
                </a>
              </div>
            )}
          </div>

          {/* Chat Panel */}
          <div className="rounded-2xl border border-white/10 overflow-hidden flex flex-col h-64 bg-[#141414] shadow-xl">
            {isSpectator ? (
              <div className="flex-1 flex flex-col items-center justify-center p-6 text-center gap-2 bg-[#121212]">
                <MessageSquareOff size={24} className="text-text-muted mb-1" />
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
              className="w-full max-w-md bg-[#141414] border border-white/10 shadow-2xl rounded-3xl p-6 sm:p-8 space-y-5"
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
              className="rounded-3xl p-8 sm:p-10 max-w-md w-full flex flex-col items-center text-center gap-6 border border-velocity-red/50 shadow-[0_0_50px_rgba(255,77,77,0.25)] bg-[#141414] relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-velocity-red" />

              {/* Icon */}
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center shadow-xl ${
                  isWinner
                    ? 'bg-velocity-red text-white shadow-[0_0_25px_rgba(255,77,77,0.7)]'
                    : isDraw
                    ? 'bg-[#222222] text-text-muted'
                    : 'bg-[#1a1a1a] text-text-secondary border border-white/10'
                }`}
              >
                {isWinner ? <Trophy size={32} /> : isDraw ? <User size={32} /> : <XCircle size={32} />}
              </div>

              {/* Title & Standard Subtitles */}
              <div className="space-y-2">
                <h2 className="font-headline-lg text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {isWinner ? 'You Won!' : isDraw ? 'Match Draw' : isSpectator ? 'Match Finished' : 'You Lost'}
                </h2>
                <div className="text-sm text-text-secondary font-sans">
                  {isWinner ? (
                    isFreeGame ? (
                      'Free game'
                    ) : (
                      <span className="inline-flex items-center gap-1">
                        Prize: <SolAmount amount={game.wager * 2} className="font-bold text-velocity-red" />
                      </span>
                    )
                  ) : isDraw ? (
                    'The match ended in a draw.'
                  ) : isSpectator ? (
                    `Winner: ${game.winner === game.player1 ? 'Player 1' : 'Player 2'}`
                  ) : (
                    'Match completed.'
                  )}
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => {
                  setShowWinModal(false);
                  handleLeave();
                }}
                className="w-full bg-velocity-red text-white py-3 rounded-full text-xs uppercase tracking-wider font-semibold hover:bg-red-600 transition-all shadow-[0_0_20px_rgba(255,77,77,0.35)] font-mono cursor-pointer"
              >
                Back to Lobby
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
