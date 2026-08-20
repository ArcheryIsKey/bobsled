import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, orderBy, limit, getDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useGameStore } from '../store';
import { Loader2, Edit2, Check, X, Eye, Plus, Trophy } from 'lucide-react';
import { motion } from 'motion/react';
import PublicProfileModal from './PublicProfileModal';

export default function Dashboard() {
  const { user, setCurrentGameId, setSpectatingGameId } = useGameStore();
  const [waitingGames, setWaitingGames] = useState<any[]>([]);
  const [activeGames, setActiveGames] = useState<any[]>([]);
  const [pastGames, setPastGames] = useState<any[]>([]);
  
  const [wagerType, setWagerType] = useState<'SOL' | 'FREE'>('SOL');
  const [wagerAmount, setWagerAmount] = useState<number>(0.05);
  const [customWager, setCustomWager] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Invite handling
  const [invitedGameId, setInvitedGameId] = useState<string | null>(null);
  const [invitedGameData, setInvitedGameData] = useState<any>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const gId = params.get('game');
    if (gId && user) {
      const checkInvite = async () => {
        const docRef = doc(db, 'games', gId);
        const snap = await getDoc(docRef);
        if (snap.exists() && snap.data().status === 'waiting' && snap.data().player1 !== user.id) {
          setInvitedGameId(gId);
          setInvitedGameData(snap.data());
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      };
      checkInvite();
    }
  }, [user]);

  useEffect(() => {
    // Listen for waiting games
    const qWaiting = query(collection(db, 'games'), where('status', '==', 'waiting'));
    const unsubWaiting = onSnapshot(qWaiting, (snapshot) => {
      const games = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setWaitingGames(games);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'games'));

    // Listen for active games (for spectating)
    const qActive = query(collection(db, 'games'), where('status', '==', 'active'));
    const unsubActive = onSnapshot(qActive, (snapshot) => {
      const games = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setActiveGames(games);
    });
    
    // Listen for past games (history)
    if (user?.id) {
      const qPast = query(
        collection(db, 'games'), 
        where('players', 'array-contains', user.id), 
        where('status', '==', 'finished'),
      );
      const unsubPast = onSnapshot(qPast, (snapshot) => {
        let games = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
        games.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
        setPastGames(games.slice(0, 20));
      });
      
      // Leaderboard
      const qLeaderboard = query(collection(db, 'users'), orderBy('elo', 'desc'), limit(10));
      const unsubLeaderboard = onSnapshot(qLeaderboard, (snap) => {
        setLeaderboard(snap.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) })));
      });

      return () => { unsubWaiting(); unsubActive(); unsubPast(); unsubLeaderboard(); };
    }

    return () => { unsubWaiting(); unsubActive(); };
  }, [user?.id, setCurrentGameId]);

  const handleCreateMatch = async () => {
    if (!user) return;
    setIsCreating(true);
    try {
      const isTestGame = !!user.isTestUser;
      const finalWager = isTestGame ? 0 : (wagerType === 'FREE' ? 0 : customWager ? parseFloat(customWager) : wagerAmount);
      const finalCurrency = isTestGame ? 'FREE' : wagerType;

      if (finalCurrency === 'SOL' && (isNaN(finalWager) || finalWager <= 0)) {
        throw new Error("Invalid wager");
      }
      
      const docRef = await addDoc(collection(db, 'games'), {
        player1: user.id,
        player2: null,
        players: [user.id],
        status: 'waiting',
        wager: finalWager,
        wagerCurrency: finalCurrency,
        isTestGame: isTestGame,
        board: Array(42).fill(0),
        turn: user.id,
        winner: null,
        gameType: 'connect4',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setCurrentGameId(docRef.id);
    } catch (e) {
      console.error(e);
      alert('Failed to create match');
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinMatch = async (gameId: string, player1Id: string) => {
    if (!user) return;
    try {
      const gameRef = doc(db, 'games', gameId);
      
      const updates: any = {
        player2: user.id,
        players: [player1Id, user.id],
        status: 'active',
        turn: Math.random() > 0.5 ? player1Id : user.id,
        updatedAt: serverTimestamp(),
      };

      if (user.isTestUser) {
        updates.wager = 0;
        updates.wagerCurrency = 'FREE';
        updates.isTestGame = true;
      }

      await updateDoc(gameRef, updates);
      setCurrentGameId(gameId);
    } catch (e) {
      console.error(e);
      alert('Failed to join match');
    }
  };

  const totalGames = pastGames.length;
  const wins = pastGames.filter(g => g.winner === user?.id).length;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

  return (
    <div className="flex flex-col lg:flex-row flex-1 w-full h-full overflow-hidden">
      
      {/* LEFT PANEL - MAIN LOBBY */}
      <section className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_center,_#111_0%,_#0A0A0A_100%)] p-4 sm:p-8 flex flex-col gap-8">
        
        {/* Waiting Games Section */}
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-[#14F195] mb-4 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#14F195] animate-pulse"></span>
            Waiting for Opponent
          </h2>
          
          {waitingGames.length === 0 ? (
            <div className="border border-neutral-800 bg-neutral-900/30 p-8 text-center text-xs text-neutral-500 font-mono uppercase tracking-widest">
              Lobby is empty. Create a match to broadcast.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {waitingGames.map(game => (
                <div key={game.id} className="flex items-center justify-between bg-neutral-900/50 p-4 border border-neutral-800 hover:border-neutral-700 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 border border-[#14F195]/30 bg-[#14F195]/10 flex items-center justify-center font-mono text-sm font-bold text-[#14F195]">
                      {game.player1.substring(0,2)}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold uppercase tracking-wider text-white">Player {game.player1.substring(0,6)}</span>
                      <span className="text-[10px] font-mono text-neutral-400">
                        {game.wagerCurrency === 'FREE' || game.wager === 0 ? 'Friendly Match' : `${game.wager} SOL Wager`}
                        {game.isTestGame && ' (Test)'}
                      </span>
                    </div>
                  </div>
                  {game.player1 !== user?.id && (
                    <button 
                      onClick={() => handleJoinMatch(game.id, game.player1)}
                      className="px-6 py-2 bg-[#14F195]/10 border border-[#14F195]/50 text-[10px] font-bold uppercase tracking-widest text-[#14F195] hover:bg-[#14F195] hover:text-black transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      Join
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Games (Spectate) */}
        <div>
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-[#AB9FF2] mb-4 flex items-center gap-2">
            <Eye size={14} />
            Live Matches
          </h2>
          
          {activeGames.length === 0 ? (
            <div className="border border-neutral-800 bg-neutral-900/30 p-8 text-center text-xs text-neutral-500 font-mono uppercase tracking-widest">
              No ongoing matches to spectate.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeGames.map(game => (
                <div key={game.id} className="flex items-center justify-between bg-neutral-900/50 p-4 border border-neutral-800 hover:border-neutral-700 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="flex -space-x-3">
                      <div className="w-10 h-10 rounded-full border-2 border-neutral-900 bg-[#AB9FF2]/20 flex items-center justify-center font-mono text-sm text-[#AB9FF2] z-10">{game.player1.substring(0,2)}</div>
                      <div className="w-10 h-10 rounded-full border-2 border-neutral-900 bg-neutral-800 flex items-center justify-center font-mono text-sm text-neutral-400 z-0">{game.player2.substring(0,2)}</div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs font-bold uppercase tracking-wider text-neutral-300">{game.player1.substring(0,4)} <span className="text-neutral-600">vs</span> {game.player2.substring(0,4)}</span>
                      <span className="text-[10px] font-mono text-neutral-500">
                        {game.wagerCurrency === 'FREE' || game.wager === 0 ? 'Free Play' : `${game.wager} SOL`}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => setSpectatingGameId(game.id)}
                    className="px-4 py-2 border border-neutral-800 text-[10px] uppercase tracking-widest text-[#AB9FF2] hover:bg-[#AB9FF2]/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                  >
                    Spectate
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

      </section>

      {/* RIGHT SIDEBAR - PROFILE & CONTROLS */}
      <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-neutral-800 flex flex-col bg-[#0D0D0D] overflow-y-auto">
        <div className="p-6 flex flex-col gap-6">
          
          {/* Compact Profile */}
          <div className="bg-neutral-900/50 border border-neutral-800 p-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 border border-[#AB9FF2]/50 bg-[#AB9FF2]/10 flex items-center justify-center overflow-hidden shrink-0">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-sm font-mono font-bold text-[#AB9FF2]">{user?.username?.substring(0,2).toUpperCase()}</span>
                )}
              </div>
              <div>
                <h2 className="text-sm font-bold text-white uppercase tracking-wider truncate max-w-[120px]">{user?.username}</h2>
                <p className="text-[10px] text-neutral-500 font-mono tracking-widest">{user?.elo} ELO • {winRate}% WR</p>
              </div>
            </div>
            <div className="flex justify-between border-t border-neutral-800 pt-3">
              <div className="flex flex-col">
                <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">{user?.isTestUser ? 'Test SOL' : 'Tokens'}</span>
                <span className="text-sm font-mono text-white">{user?.isTestUser ? user?.testSolBalance : user?.freeTokens}</span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[9px] font-bold text-neutral-500 uppercase tracking-widest">Status</span>
                <span className="text-sm font-mono text-[#14F195]">Online</span>
              </div>
            </div>
          </div>

          {/* Create Match */}
          <div>
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-3 flex items-center gap-2"><Plus size={12}/> Host Match</h2>
            
            <div className="space-y-2 mb-4">
              <div className="flex gap-2">
                <button 
                  onClick={() => { setWagerType('SOL'); setWagerAmount(0.05); setCustomWager(''); }} 
                  className={`flex-1 py-2 text-xs font-mono border ${wagerType === 'SOL' && wagerAmount === 0.05 && !customWager ? 'border-[#14F195] text-[#14F195] bg-[#14F195]/10' : 'border-neutral-800 text-neutral-500 hover:border-neutral-700'}`}
                >
                  0.05 SOL
                </button>
                <button 
                  onClick={() => { setWagerType('SOL'); setWagerAmount(0.1); setCustomWager(''); }} 
                  className={`flex-1 py-2 text-xs font-mono border ${wagerType === 'SOL' && wagerAmount === 0.1 && !customWager ? 'border-[#14F195] text-[#14F195] bg-[#14F195]/10' : 'border-neutral-800 text-neutral-500 hover:border-neutral-700'}`}
                >
                  0.1 SOL
                </button>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => { setWagerType('FREE'); setWagerAmount(0); setCustomWager(''); }} 
                  className={`flex-1 py-2 text-xs font-mono border ${wagerType === 'FREE' ? 'border-[#14F195] text-[#14F195] bg-[#14F195]/10' : 'border-neutral-800 text-neutral-500 hover:border-neutral-700'}`}
                >
                  FREE
                </button>
                <input 
                  type="number" 
                  step="0.01"
                  placeholder="Custom SOL"
                  value={customWager}
                  onChange={e => { setWagerType('SOL'); setCustomWager(e.target.value); }}
                  className={`flex-1 w-full min-w-0 bg-transparent border py-2 px-3 text-xs font-mono focus:outline-none transition-colors ${wagerType === 'SOL' && customWager !== '' ? 'border-[#14F195] text-[#14F195] bg-[#14F195]/10' : 'border-neutral-800 text-white hover:border-neutral-700'}`}
                />
              </div>
            </div>

            <button 
              disabled={isCreating}
              onClick={handleCreateMatch}
              className="w-full bg-[#14F195] text-black font-bold text-xs uppercase tracking-widest py-3 hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isCreating ? <Loader2 className="animate-spin" size={14} /> : 'Broadcast Game'}
            </button>
          </div>
          
          {/* Leaderboard */}
          <div className="flex-1 mt-2">
            <h2 className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-3 flex items-center gap-2"><Trophy size={12}/> Top Ranked</h2>
            <div className="space-y-2">
              {leaderboard.length === 0 && <p className="text-[10px] text-neutral-600 font-mono uppercase tracking-widest">No players yet.</p>}
              {leaderboard.slice(0,5).map((u, i) => (
                <div 
                  key={u.id} 
                  className="flex items-center justify-between cursor-pointer hover:bg-neutral-900/50 p-2 -mx-2 rounded transition-colors"
                  onClick={() => setSelectedUserId(u.id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-neutral-600 font-mono">{(i + 1).toString().padStart(2, '0')}</span>
                    <span className="text-xs font-medium text-neutral-300">{u.username}</span>
                  </div>
                  <span className="text-[10px] font-mono text-[#14F195]">{u.elo} ELO</span>
                </div>
              ))}
            </div>
          </div>

        </div>
      </aside>

      {selectedUserId && (
        <PublicProfileModal 
          userId={selectedUserId} 
          onClose={() => setSelectedUserId(null)} 
        />
      )}

      {/* Invite Modal */}
      {invitedGameId && invitedGameData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#0D0D0D] border border-neutral-800 p-8 max-w-sm w-full shadow-2xl relative"
          >
            <h2 className="text-xl font-bold uppercase tracking-widest text-white mb-2 text-center">Match Invite</h2>
            <p className="text-xs text-neutral-400 font-mono text-center mb-8">
              You've been invited to play for <span className="text-[#14F195]">{invitedGameData.wager} {invitedGameData.wagerCurrency}</span>
            </p>
            
            <div className="flex gap-4">
              <button 
                onClick={() => { setInvitedGameId(null); setInvitedGameData(null); }}
                className="flex-1 py-3 text-xs uppercase tracking-widest border border-neutral-800 text-neutral-400 hover:text-white transition-colors"
              >
                Decline
              </button>
              <button 
                onClick={() => {
                  handleJoinMatch(invitedGameId, invitedGameData.player1);
                  setInvitedGameId(null);
                  setInvitedGameData(null);
                }}
                className="flex-1 py-3 text-xs uppercase tracking-widest bg-[#14F195] text-black font-bold hover:opacity-90 transition-opacity"
              >
                Accept
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
