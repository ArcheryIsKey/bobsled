import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useGameStore } from '../store';
import Chat from './Chat';
import Connect4 from './games/Connect4';
import { ArrowLeft, Copy, Check, Trophy, Flag, AlertTriangle, XCircle, ArrowRight, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Game() {
  const { user, currentGameId, spectatingGameId, setCurrentGameId, setSpectatingGameId, setCurrentView } = useGameStore();
  const [game, setGame] = useState<any>(null);
  const [now, setNow] = useState(Date.now());
  const [copiedLink, setCopiedLink] = useState(false);
  const [showWinModal, setShowWinModal] = useState(true);

  const gameId = currentGameId || spectatingGameId;
  const isSpectator = !!spectatingGameId;

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!gameId) return;
    const unsub = onSnapshot(doc(db, 'games', gameId), (docSnap) => {
      if (docSnap.exists()) {
        const data = { id: docSnap.id, ...docSnap.data() } as any;
        setGame(data);
        if (data.status === 'finished') {
          setShowWinModal(true);
        }
      } else {
        handleLeave();
      }
    });
    return () => unsub();
  }, [gameId]);

  const handleLeave = () => {
    setSpectatingGameId(null);
    setCurrentGameId(null);
    setCurrentView('lobby');
  };

  const handleCancelMatch = async () => {
    if (!user || !game || game.status !== 'waiting') return;
    if (game.player1 !== user.id) return;
    try {
      await deleteDoc(doc(db, 'games', game.id));
      handleLeave();
    } catch (e) {
      console.error('Failed to cancel match:', e);
      handleLeave();
    }
  };

  const handleResign = async () => {
    if (!user || !game || game.status !== 'active') return;
    if (!confirm('Are you sure you want to resign this match?')) return;
    const opponentId = game.player1 === user.id ? game.player2 : game.player1;
    try {
      await updateDoc(doc(db, 'games', game.id), {
        status: 'finished',
        winner: opponentId,
        updatedAt: serverTimestamp(),
      });
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
    const url = `${window.location.origin}/?watch=${game?.id}`;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (!game) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-background">
        <div className="w-8 h-8 border border-velocity-red/30 border-t-velocity-red rounded-full animate-spin mb-4" />
        <p className="text-xs uppercase tracking-widest text-text-muted font-label-caps">Connecting to Arena Signal...</p>
      </div>
    );
  }

  const isPlayer1 = user?.id === game.player1;
  const isMyTurn = !isSpectator && game.turn === user?.id && game.status === 'active';
  const opponentId = isPlayer1 ? game.player2 : game.player1;
  const opponentName = isPlayer1 ? game.player2Name : game.player1Name;
  const timeSinceLastMove = game.updatedAt?.toMillis ? now - game.updatedAt.toMillis() : 0;
  const afkSecondsLeft = Math.max(0, Math.ceil((60000 - timeSinceLastMove) / 1000));
  const canClaimAfk = !isSpectator && !isMyTurn && game.status === 'active' && timeSinceLastMove > 60000;

  const isWinner = game.winner === user?.id;
  const isDraw = game.winner === 'draw';
  const isFinished = game.status === 'finished';

  const stakesDisplay = game.wager > 0 ? `${game.wager} ${game.wagerCurrency}` : 'FREE';

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary antialiased selection:bg-velocity-red selection:text-text-primary w-full overflow-y-auto">
      {/* Spectator Mode Banner */}
      {isSpectator && (
        <div className="w-full bg-surface-elevated border-b border-glass-border py-2 text-center text-text-secondary font-label-caps text-xs tracking-widest z-50 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-velocity-red animate-pulse" />
          SPECTATOR SURVEILLANCE FEED — MATCH #{game.id.substring(0, 8).toUpperCase()}
        </div>
      )}

      {/* Arena Main Container */}
      <main className="flex-grow w-full max-w-max-width mx-auto px-margin-mobile md:px-margin-desktop py-6 md:py-10 flex flex-col lg:flex-row gap-gutter">
        
        {/* Left Column: Match Details & Terminal Chat (1/3) */}
        <aside className="w-full lg:w-1/3 flex flex-col gap-6 order-2 lg:order-1">
          {/* Match Info Panel */}
          <div className="glass-panel rounded-xl p-6 border border-glass-border shadow-xl relative overflow-hidden bg-surface-base">
            <div className="flex justify-between items-center border-b border-glass-border pb-4 mb-4">
              <div>
                <span className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider block">Arena Match</span>
                <h2 className="font-headline-lg text-lg md:text-xl text-text-primary font-bold">
                  #{game.id.substring(0, 8).toUpperCase()}
                </h2>
              </div>
              <span
                className={`font-label-caps text-xs px-2.5 py-1 rounded font-bold uppercase ${
                  game.status === 'active'
                    ? 'bg-velocity-red/20 text-velocity-red border border-velocity-red/30'
                    : game.status === 'waiting'
                    ? 'bg-surface-variant text-text-muted border border-glass-border'
                    : 'bg-surface-container text-text-secondary border border-glass-border'
                }`}
              >
                {game.status === 'active' ? 'LIVE NOW' : game.status === 'waiting' ? 'WAITING' : 'COMPLETED'}
              </span>
            </div>

            <div className="space-y-4">
              {/* Stakes readout */}
              <div className="flex justify-between items-end bg-surface-container/60 p-4 rounded border border-glass-border">
                <div>
                  <p className="font-label-caps text-[10px] text-text-muted uppercase tracking-wider mb-1">
                    {isFinished ? 'Total Stakes Settled' : 'Current Match Stakes'}
                  </p>
                  <p className="font-display-lg text-2xl md:text-3xl text-velocity-red font-bold">
                    {stakesDisplay}
                  </p>
                </div>
                <span className="font-label-caps text-xs text-text-secondary bg-surface-base px-2 py-1 rounded border border-glass-border">
                  {game.wagerCurrency || 'FREE'}
                </span>
              </div>

              {/* Player VS Player Card */}
              <div className="bg-surface-container rounded p-4 border border-glass-border space-y-3">
                {/* Player 1 (Red) */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-surface-base border-2 border-velocity-red flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(255,77,77,0.4)]">
                      <span className="w-5 h-5 rounded-full bg-velocity-red" />
                    </div>
                    <div>
                      <p className="font-body-md text-xs font-bold text-text-primary flex items-center gap-1.5">
                        {game.player1 === user?.id ? 'You' : game.player1Name || 'Player 1'}
                        <span className="text-[10px] text-velocity-red font-label-caps">(Red)</span>
                      </p>
                      <p className="font-label-caps text-[10px] text-text-muted">
                        {game.turn === game.player1 && game.status === 'active' ? 'Thinking...' : 'Ready'}
                      </p>
                    </div>
                  </div>
                  {game.status === 'active' && game.turn === game.player1 && (
                    <span className="w-2 h-2 rounded-full bg-velocity-red animate-ping" />
                  )}
                </div>

                <div className="flex items-center justify-center my-1">
                  <span className="font-label-caps text-[10px] text-text-muted uppercase tracking-widest">VS</span>
                </div>

                {/* Player 2 (White) */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-surface-base border-2 border-white flex items-center justify-center shrink-0 shadow-[0_0_10px_rgba(255,255,255,0.3)]">
                      <span className="w-5 h-5 rounded-full bg-white" />
                    </div>
                    <div>
                      <p className="font-body-md text-xs font-bold text-text-primary flex items-center gap-1.5">
                        {game.player2 ? (game.player2 === user?.id ? 'You' : game.player2Name || 'Player 2') : 'Searching...'}
                        <span className="text-[10px] text-white font-label-caps">(White)</span>
                      </p>
                      <p className="font-label-caps text-[10px] text-text-muted">
                        {game.player2 ? (game.turn === game.player2 && game.status === 'active' ? 'Thinking...' : 'Ready') : 'Waiting for challenger'}
                      </p>
                    </div>
                  </div>
                  {game.status === 'active' && game.turn === game.player2 && (
                    <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                  )}
                </div>
              </div>

              {/* AFK Timer Alert if opponent is stalling */}
              {game.status === 'active' && !isMyTurn && !isSpectator && (
                <div className="p-3 rounded bg-surface-elevated border border-glass-border flex items-center justify-between">
                  <span className="font-label-caps text-[11px] text-text-muted flex items-center gap-1.5">
                    <AlertTriangle size={14} className="text-yellow-500" />
                    Opponent Turn Timer:
                  </span>
                  <span className={`font-mono text-xs font-bold ${afkSecondsLeft < 15 ? 'text-velocity-red animate-pulse' : 'text-text-secondary'}`}>
                    {afkSecondsLeft}s
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Spectator Share Box */}
          <div className="glass-panel rounded-xl p-5 border border-glass-border bg-surface-base">
            <h3 className="font-label-caps text-xs text-text-primary font-bold uppercase tracking-wider mb-1">
              Spectator Uplink
            </h3>
            <p className="font-body-sm text-xs text-text-muted mb-3">
              Share this link to broadcast your match live to spectators.
            </p>
            <div className="flex gap-2">
              <input
                className="flex-grow bg-surface-container border border-glass-border text-text-primary font-label-caps text-xs px-3 py-2 rounded focus:border-velocity-red outline-none select-all"
                readOnly
                type="text"
                value={`${window.location.origin}/?watch=${game.id}`}
              />
              <button
                onClick={handleCopyLink}
                className="bg-surface-elevated border border-glass-border hover:border-velocity-red text-text-primary px-3 py-2 rounded font-label-caps text-xs flex items-center gap-1.5 transition-colors"
              >
                {copiedLink ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                <span>{copiedLink ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Terminal Chat & Move Feed */}
          <div className="glass-panel rounded-xl border border-glass-border overflow-hidden flex flex-col h-72 bg-surface-base shadow-xl">
            <Chat gameId={game.id} />
          </div>
        </aside>

        {/* Right Column: Game Board & Action Controls (2/3) */}
        <section className="w-full lg:w-2/3 flex flex-col items-center justify-start gap-6 order-1 lg:order-2">
          {/* Top Return Button */}
          <div className="w-full flex justify-between items-center">
            <button
              onClick={handleLeave}
              className="flex items-center gap-2 font-label-caps text-xs text-text-secondary hover:text-text-primary py-2 px-3.5 rounded bg-surface-base border border-glass-border hover:border-velocity-red transition-colors"
            >
              <ArrowLeft size={14} /> Exit to Lobby
            </button>

            {game.status === 'waiting' && game.player1 === user?.id && (
              <button
                onClick={handleCancelMatch}
                className="font-label-caps text-xs text-red-400 hover:text-red-300 py-2 px-3 rounded bg-red-900/20 border border-red-900/40 hover:bg-red-900/40 transition-colors"
              >
                Cancel &amp; Discard Match
              </button>
            )}
          </div>

          {/* Connect 4 Board Component */}
          <Connect4 game={game} user={user} isSpectator={isSpectator} onMove={handleMove} />

          {/* Action Bar Beneath Board */}
          <div className="flex flex-wrap items-center justify-center gap-4 mt-2 w-full max-w-2xl">
            {/* Resign Button */}
            {game.status === 'active' && !isSpectator && (
              <button
                onClick={handleResign}
                className="bg-surface-container border border-glass-border hover:border-red-900 text-text-secondary hover:text-red-400 px-6 py-2.5 rounded font-label-caps text-xs uppercase tracking-wider transition-colors flex items-center gap-2"
              >
                <Flag size={14} /> Resign Match
              </button>
            )}

            {/* Claim Victory (AFK) */}
            {canClaimAfk && (
              <button
                onClick={handleClaimAfk}
                className="bg-velocity-red text-text-primary font-label-caps text-xs uppercase tracking-wider px-6 py-2.5 rounded hover:bg-primary-container transition-all shadow-[0_0_15px_rgba(255,77,77,0.5)] animate-bounce flex items-center gap-2 font-bold"
              >
                <Trophy size={14} /> Claim Victory (Opponent AFK)
              </button>
            )}

            {/* Finished Actions */}
            {isFinished && (
              <button
                onClick={handleLeave}
                className="bg-velocity-red text-text-primary font-label-caps text-xs uppercase tracking-wider px-8 py-3 rounded hover:bg-primary-container transition-all shadow-[0_0_15px_rgba(255,77,77,0.4)] font-bold flex items-center gap-2"
              >
                <span>Return to Lobby</span>
                <ArrowRight size={16} />
              </button>
            )}
          </div>
        </section>
      </main>

      {/* Victory / Defeat Modal Overlay (Stitch Screen d30c585692fd47c690109958a4cea8a0) */}
      <AnimatePresence>
        {isFinished && showWinModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="glass-panel rounded-2xl p-8 sm:p-12 max-w-md w-full flex flex-col items-center text-center gap-6 border-2 border-velocity-red shadow-[0_0_50px_rgba(255,77,77,0.3)] bg-surface-elevated relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-velocity-red" />

              {/* Icon */}
              <div
                className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl ${
                  isWinner
                    ? 'bg-velocity-red text-white shadow-[0_0_30px_rgba(255,77,77,0.8)]'
                    : isDraw
                    ? 'bg-surface-variant text-text-muted'
                    : 'bg-surface-container text-text-secondary border border-glass-border'
                }`}
              >
                {isWinner ? <Trophy size={40} /> : isDraw ? <ShieldAlert size={40} /> : <XCircle size={40} />}
              </div>

              {/* Title */}
              <div className="space-y-1">
                <h2 className="font-display-lg text-3xl sm:text-4xl font-bold text-white tracking-tight">
                  {isWinner ? 'VICTORY ACHIEVED!' : isDraw ? 'MATCH DRAW' : isSpectator ? 'MATCH CONCLUDED' : 'DEFEAT'}
                </h2>
                <p className="font-body-md text-sm text-text-secondary">
                  {isWinner
                    ? `You won the match! Stakes of ${stakesDisplay} secured.`
                    : isDraw
                    ? 'Stalemate reached. Stakes refunded.'
                    : isSpectator
                    ? `Player ${game.winner === game.player1 ? '1 (Red)' : '2 (White)'} won the match.`
                    : 'Signal severed. Better luck next deployment.'}
                </p>
              </div>

              {/* Action Button */}
              <button
                onClick={() => {
                  setShowWinModal(false);
                  handleLeave();
                }}
                className="mt-2 w-full bg-velocity-red text-text-primary py-3.5 rounded font-label-caps text-xs uppercase tracking-widest font-bold hover:bg-primary-container transition-all shadow-[0_0_20px_rgba(255,77,77,0.4)]"
              >
                Return to Lobby
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
