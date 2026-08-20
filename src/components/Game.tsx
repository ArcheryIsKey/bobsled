import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, onSnapshot, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useGameStore } from '../store';
import Chat from './Chat';
import Connect4 from './games/Connect4';
import { ArrowLeft, Copy, Check, Trophy, Flag, AlertTriangle, XCircle, ArrowRight, User, MessageSquareOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Game() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const { user } = useGameStore();

  const [game, setGame] = useState<any>(null);
  const [now, setNow] = useState(Date.now());
  const [copiedLink, setCopiedLink] = useState(false);
  const [showWinModal, setShowWinModal] = useState(true);
  const [showResignModal, setShowResignModal] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

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

  const handleLeave = () => {
    navigate('/');
  };

  const handleCancelMatch = async () => {
    if (!user || !game || game.status !== 'waiting') return;
    if (game.player1 !== user.id) return;
    try {
      await deleteDoc(doc(db, 'games', game.id));
      navigate('/');
    } catch (e) {
      console.error('Failed to cancel match:', e);
      navigate('/');
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
      console.error(e);
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
      console.error(e);
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
      console.error(err);
    }
  };

  const handleCopyLink = () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
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
  const isSpectator = !isParticipant;

  const isMyTurn = isParticipant && game.turn === user?.id && game.status === 'active';
  const opponentAvatar = isPlayer1 ? game.player2Avatar : game.player1Avatar;

  const timeSinceLastMove = game.updatedAt?.toMillis ? now - game.updatedAt.toMillis() : 0;
  const afkSecondsLeft = Math.max(0, Math.ceil((60000 - timeSinceLastMove) / 1000));
  const canClaimAfk = isParticipant && !isMyTurn && game.status === 'active' && timeSinceLastMove > 60000;

  const isWinner = isParticipant && game.winner === user?.id;
  const isDraw = game.winner === 'draw';
  const isFinished = game.status === 'finished';

  const isFreeGame = game.wager === 0 || game.wagerCurrency === 'FREE';

  return (
    <div className="min-h-[calc(100vh-76px)] flex flex-col bg-[#0e0e0e] text-text-primary antialiased w-full overflow-y-auto">
      
      {/* Spectator Mode Banner */}
      {isSpectator && (
        <div className="w-full bg-[#141414] border-b border-white/10 py-2.5 text-center text-text-secondary text-xs tracking-wider z-40 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-velocity-red animate-pulse" />
          <span>Watching Match <strong className="font-mono text-white">#{game.id.substring(0, 8).toUpperCase()}</strong> as Spectator</span>
        </div>
      )}

      {/* Arena Main Container */}
      <main className="flex-grow w-full max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8 flex flex-col lg:flex-row gap-6">
        
        {/* Left Column: Match Details & Chat (1/3) */}
        <aside className="w-full lg:w-80 flex flex-col gap-5 order-2 lg:order-1 shrink-0">
          
          {/* Match Info Panel */}
          <div className="rounded-2xl p-5 border border-white/10 shadow-2xl bg-[#141414] space-y-4">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <div>
                <span className="text-[10px] text-text-muted uppercase tracking-wider block font-semibold">Match ID</span>
                <h2 className="font-headline-lg text-lg text-white font-bold font-mono">
                  #{game.id.substring(0, 8).toUpperCase()}
                </h2>
              </div>
              <span
                className={`text-[11px] px-3 py-1 rounded-full font-semibold uppercase tracking-wider ${
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
                <p className="text-[10px] text-text-muted uppercase tracking-wider mb-0.5">Stakes</p>
                <p className="font-headline-lg text-xl text-velocity-red font-bold">
                  {isFreeGame ? 'Free' : `${game.wager} SOL`}
                </p>
              </div>
              {!isFreeGame && (
                <span className="text-xs text-text-secondary bg-[#1a1a1a] px-3 py-1 rounded-full border border-white/10 font-mono font-bold">
                  SOL
                </span>
              )}
            </div>

            {/* Player VS Player */}
            <div className="bg-[#0e0e0e] rounded-xl p-4 border border-white/5 space-y-3.5">
              
              {/* Player 1 (Red) */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#181818] border-2 border-velocity-red flex items-center justify-center shrink-0 overflow-hidden shadow-[0_0_10px_rgba(255,77,77,0.35)]">
                    {game.player1Avatar ? (
                      <img src={game.player1Avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full bg-velocity-red" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>{game.player1 === user?.id ? 'You' : game.player1Name || 'Player 1'}</span>
                      <span className="text-[11px] text-velocity-red font-medium">(Red)</span>
                    </p>
                    <p className="text-xs text-text-muted">
                      {game.turn === game.player1 && game.status === 'active' ? 'Thinking...' : 'Ready'}
                    </p>
                  </div>
                </div>
                {game.status === 'active' && game.turn === game.player1 && (
                  <span className="w-2.5 h-2.5 rounded-full bg-velocity-red animate-ping" />
                )}
              </div>

              {/* Minimal Divider */}
              <div className="relative flex items-center justify-center my-1">
                <div className="w-full border-t border-white/5" />
                <span className="absolute bg-[#0e0e0e] px-2 text-[10px] text-text-muted uppercase font-semibold tracking-wider">vs</span>
              </div>

              {/* Player 2 (White) */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#181818] border-2 border-white flex items-center justify-center shrink-0 overflow-hidden shadow-[0_0_10px_rgba(255,255,255,0.25)]">
                    {opponentAvatar && game.player2 ? (
                      <img src={opponentAvatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-3.5 h-3.5 rounded-full bg-white" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white flex items-center gap-1.5">
                      <span>{game.player2 ? (game.player2 === user?.id ? 'You' : game.player2Name || 'Player 2') : 'Waiting...'}</span>
                      <span className="text-[11px] text-text-secondary font-medium">(White)</span>
                    </p>
                    <p className="text-xs text-text-muted">
                      {game.player2 ? (game.turn === game.player2 && game.status === 'active' ? 'Thinking...' : 'Ready') : 'Waiting for opponent'}
                    </p>
                  </div>
                </div>
                {game.status === 'active' && game.turn === game.player2 && (
                  <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
                )}
              </div>
            </div>

            {/* Inactivity warning */}
            {game.status === 'active' && !isMyTurn && isParticipant && (
              <div className="p-2.5 rounded-full bg-[#0e0e0e] border border-white/5 flex items-center justify-between text-xs px-4">
                <span className="text-text-muted flex items-center gap-1.5">
                  <AlertTriangle size={13} className="text-yellow-500" />
                  Opponent Timer:
                </span>
                <span className={`font-mono font-bold ${afkSecondsLeft < 15 ? 'text-velocity-red animate-pulse' : 'text-text-secondary'}`}>
                  {afkSecondsLeft}s
                </span>
              </div>
            )}
          </div>

          {/* Share Game Link Box */}
          <div className="rounded-2xl p-4 border border-white/10 bg-[#141414]">
            <h3 className="text-xs text-white font-bold uppercase tracking-wider mb-1">
              Share Game Link
            </h3>
            <p className="text-xs text-text-muted mb-2.5">
              Anyone with this link can watch or join this game.
            </p>
            <div className="flex gap-2">
              <input
                className="flex-grow bg-[#0e0e0e] border border-white/10 text-white text-xs px-3.5 py-1.5 rounded-full focus:border-velocity-red outline-none select-all font-mono"
                readOnly
                type="text"
                value={window.location.href}
              />
              <button
                onClick={handleCopyLink}
                className="bg-[#1e1e1e] border border-white/10 hover:border-velocity-red text-white px-3.5 py-1.5 rounded-full text-xs flex items-center gap-1.5 transition-colors font-medium cursor-pointer"
              >
                {copiedLink ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Chat Panel: Spectators cannot type nor see chat */}
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

        {/* Right Column: Game Board & Actions (2/3) */}
        <section className="flex-1 flex flex-col items-center justify-start gap-6 order-1 lg:order-2">
          
          {/* Top Bar Actions */}
          <div className="w-full flex justify-between items-center">
            <button
              onClick={handleLeave}
              className="flex items-center gap-2 text-xs text-text-secondary hover:text-white py-2 px-4 rounded-full bg-[#141414] hover:bg-[#1e1e1e] border border-white/10 hover:border-velocity-red transition-all font-medium cursor-pointer"
            >
              <ArrowLeft size={14} />
              <span>Back to Lobby</span>
            </button>

            {game.status === 'waiting' && game.player1 === user?.id && (
              <button
                onClick={handleCancelMatch}
                className="text-xs text-red-400 hover:text-white py-2 px-4 rounded-full bg-red-950/30 border border-red-900/50 hover:bg-red-900/60 transition-all font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <span>Cancel Game</span>
              </button>
            )}
          </div>

          {/* Connect 4 Board Component */}
          <Connect4 game={game} user={user} isSpectator={isSpectator} onMove={handleMove} />

          {/* Action Bar Beneath Board */}
          <div className="flex flex-wrap items-center justify-center gap-4 mt-2 w-full max-w-2xl">
            {/* Resign Button */}
            {game.status === 'active' && isParticipant && (
              <button
                onClick={() => setShowResignModal(true)}
                className="bg-[#141414] hover:bg-red-950/40 border border-white/10 hover:border-red-900/60 text-text-secondary hover:text-red-400 px-6 py-2 rounded-full text-xs uppercase tracking-wider transition-all flex items-center gap-2 font-semibold font-mono cursor-pointer"
              >
                <Flag size={14} /> Resign
              </button>
            )}

            {/* Claim Victory (AFK) */}
            {canClaimAfk && (
              <button
                onClick={handleClaimAfk}
                className="bg-velocity-red text-white text-xs uppercase tracking-wider px-6 py-2.5 rounded-full hover:bg-red-600 transition-all shadow-[0_0_20px_rgba(255,77,77,0.6)] animate-bounce flex items-center gap-2 font-bold font-mono cursor-pointer"
              >
                <Trophy size={14} /> Claim Win (Opponent Inactive)
              </button>
            )}

            {/* Finished Action */}
            {isFinished && (
              <button
                onClick={handleLeave}
                className="bg-velocity-red text-white text-xs uppercase tracking-wider px-8 py-2.5 rounded-full hover:bg-red-600 transition-all shadow-[0_0_20px_rgba(255,77,77,0.4)] font-bold flex items-center gap-2 font-mono cursor-pointer"
              >
                <span>Return to Lobby</span>
                <ArrowRight size={15} />
              </button>
            )}
          </div>
        </section>
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
              <h3 className="text-lg font-bold text-white">Resign Match</h3>
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

              {/* Title */}
              <div className="space-y-1">
                <h2 className="font-headline-lg text-2xl sm:text-3xl font-bold text-white tracking-tight">
                  {isWinner ? 'You Won!' : isDraw ? 'Match Draw' : isSpectator ? 'Match Finished' : 'You Lost'}
                </h2>
                <p className="text-sm text-text-secondary">
                  {isWinner
                    ? isFreeGame ? 'Free match victory.' : `Stakes of ${game.wager} SOL secured.`
                    : isDraw
                    ? 'Match ended in a tie.'
                    : isSpectator
                    ? `Player ${game.winner === game.player1 ? '1 (Red)' : '2 (White)'} won the match.`
                    : 'Better luck in the next game.'}
                </p>
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
