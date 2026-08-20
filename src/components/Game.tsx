import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useGameStore } from '../store';
import Chat from './Chat';
import Connect4 from './games/Connect4';

export default function Game() {
  const { user, currentGameId, spectatingGameId, setCurrentGameId, setSpectatingGameId } = useGameStore();
  const [game, setGame] = useState<any>(null);

  const gameId = currentGameId || spectatingGameId;
  const isSpectator = !!spectatingGameId;

  useEffect(() => {
    if (!gameId) return;
    const unsub = onSnapshot(doc(db, 'games', gameId), (docSnap) => {
      if (docSnap.exists()) {
        setGame({ id: docSnap.id, ...docSnap.data() });
      } else {
        handleLeave();
      }
    });
    return () => unsub();
  }, [gameId]);

  const handleLeave = () => {
    setSpectatingGameId(null);
    setCurrentGameId(null);
  };

  const handleMove = async (newBoard: number[], winner: string | null) => {
    if (!user || !game) return;
    const updates: any = {
      board: newBoard,
      turn: game.turn === game.player1 ? game.player2 : game.player1,
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

  if (!game) return <div className="flex-1 flex items-center justify-center text-[10px] uppercase tracking-widest text-neutral-500 font-mono">Connecting to Signal...</div>;

  return (
    <div className="flex flex-col lg:flex-row flex-1 w-full h-full overflow-hidden">
      
      {/* Left Sidebar - Chat */}
      <aside className="w-full lg:w-72 border-r border-neutral-800 flex flex-col bg-[#0D0D0D] shrink-0 h-64 lg:h-full order-2 lg:order-1">
        <Chat gameId={game.id} />
      </aside>

      {/* Center Stage - Game Board */}
      <section className="flex-1 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,_#111_0%,_#0A0A0A_100%)] relative overflow-hidden order-1 lg:order-2 h-full py-12 lg:py-0">
        
        {isSpectator && (
          <div className="absolute top-0 w-full bg-[#AB9FF2]/10 border-b border-[#AB9FF2]/30 py-2 text-center text-[#AB9FF2] text-[10px] font-bold uppercase tracking-widest z-50">
            Spectator Mode
          </div>
        )}

        {/* Top Info */}
        <div className="absolute top-12 sm:top-16 flex gap-6 sm:gap-12 text-center w-full justify-center z-10">
          <div>
            <p className="text-[8px] sm:text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-1">Player One</p>
            <p className={`text-base sm:text-xl font-bold ${game.turn === game.player1 ? 'text-[#14F195]' : 'text-neutral-400'}`}>
              {game.player1 === user?.id ? 'YOU' : game.player1.substring(0,6)}
            </p>
          </div>
          <div className="flex flex-col items-center justify-center text-center">
            <span className="text-xl sm:text-2xl font-black text-neutral-800 italic leading-none">VS</span>
          </div>
          <div>
            <p className="text-[8px] sm:text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-1">Player Two</p>
            <p className={`text-base sm:text-xl font-bold ${game.turn === game.player2 ? 'text-[#AB9FF2]' : 'text-neutral-400'}`}>
              {game.player2 ? (game.player2 === user?.id ? 'YOU' : game.player2.substring(0,6)) : 'Searching...'}
            </p>
          </div>
        </div>

        {/* Game Status overlay (if finished) */}
        {game.status === 'finished' && (
          <div className="absolute top-32 z-20 flex flex-col items-center justify-center backdrop-blur-md bg-black/80 p-8 border border-neutral-800 shadow-2xl">
            <div className="text-[12px] sm:text-[14px] uppercase tracking-[0.3em] font-bold text-white mb-6 text-center">
              {game.winner === 'draw' ? 'STALEMATE' : game.winner === user?.id ? 'VICTORY ACHIEVED' : isSpectator ? `PLAYER ${game.winner === game.player1 ? 1 : 2} WON` : 'SIGNAL LOST'}
            </div>
            <button onClick={handleLeave} className="px-8 py-3 border border-[#14F195] text-[#14F195] text-[10px] uppercase tracking-widest hover:bg-[#14F195]/10 transition-colors">
              Return to Grid
            </button>
          </div>
        )}

        {/* Board */}
        {(!game.gameType || game.gameType === 'connect4') ? (
          <Connect4 game={game} user={user} isSpectator={isSpectator} onMove={handleMove} />
        ) : (
          <div className="text-white">Unknown Game Type</div>
        )}

        {isSpectator && game.status !== 'finished' && (
          <div className="absolute bottom-4 sm:bottom-12">
            <button onClick={handleLeave} className="px-6 py-2 border border-neutral-800 text-[10px] uppercase tracking-widest text-[#AB9FF2] hover:bg-[#AB9FF2]/10 transition-colors">
              Leave Spectator Mode
            </button>
          </div>
        )}

        {!isSpectator && game.status === 'waiting' && (
          <div className="absolute bottom-4 sm:bottom-12 flex flex-col items-center">
            <p className="text-[10px] text-neutral-500 uppercase tracking-widest font-mono mb-2">Waiting for opponent</p>
            <button 
              onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/?game=${game.id}`);
                alert("Invite link copied to clipboard!");
              }} 
              className="px-6 py-3 border border-[#14F195] bg-[#14F195]/5 text-[10px] uppercase tracking-widest text-[#14F195] hover:bg-[#14F195]/20 transition-all font-bold"
            >
              Copy Invite Link
            </button>
          </div>
        )}

        {!isSpectator && game.status === 'active' && (
          <div className="absolute bottom-4 sm:bottom-12 flex gap-4">
            <button className="px-4 sm:px-6 py-2 border border-neutral-800 text-[10px] uppercase tracking-widest text-neutral-500 hover:text-white hover:border-white transition-colors">Offer Draw</button>
            <button className="px-4 sm:px-6 py-2 border border-red-900/50 text-[10px] uppercase tracking-widest text-red-500 hover:bg-red-500/10 transition-colors">Resign</button>
          </div>
        )}
      </section>

    </div>
  );
}
