import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useGameStore } from '../store';
import { Loader2, Play, X } from 'lucide-react';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user } = useGameStore();
  const [waitingGames, setWaitingGames] = useState<any[]>([]);
  const [activeGames, setActiveGames] = useState<any[]>([]);
  const [wagerType, setWagerType] = useState<'SOL' | 'FREE'>(user?.isTestUser ? 'FREE' : 'SOL');
  const [wagerAmount, setWagerAmount] = useState<number>(0.1);
  const [customWager, setCustomWager] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    if (user?.isTestUser) {
      setWagerType('FREE');
    }
  }, [user?.isTestUser]);

  useEffect(() => {
    // Listen for waiting games
    const qWaiting = query(collection(db, 'games'), where('status', '==', 'waiting'));
    const unsubWaiting = onSnapshot(
      qWaiting,
      (snapshot) => {
        const games = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }));
        setWaitingGames(games);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'games')
    );

    // Listen for active games
    const qActive = query(collection(db, 'games'), where('status', '==', 'active'));
    const unsubActive = onSnapshot(qActive, (snapshot) => {
      const games = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }));
      setActiveGames(games);
    });

    return () => {
      unsubWaiting();
      unsubActive();
    };
  }, []);

  const handleCreateMatch = async () => {
    if (!user) return;
    setIsCreating(true);
    try {
      const finalWager = wagerType === 'FREE' ? 0 : customWager ? parseFloat(customWager) : wagerAmount;
      const finalCurrency = wagerType;

      if (finalCurrency === 'SOL' && (isNaN(finalWager) || finalWager <= 0)) {
        throw new Error('Please enter a valid SOL wager.');
      }

      const docRef = await addDoc(collection(db, 'games'), {
        player1: user.id,
        player1Name: user.username,
        player1Avatar: user.avatarUrl || null,
        player2: null,
        player2Name: null,
        player2Avatar: null,
        players: [user.id],
        status: 'waiting',
        wager: finalWager,
        wagerCurrency: finalCurrency,
        board: Array(42).fill(0),
        turn: user.id,
        winner: null,
        gameType: 'connect4',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      navigate(`/game/${docRef.id}`);
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'Failed to create match');
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
        player2Name: user.username,
        player2Avatar: user.avatarUrl || null,
        players: [player1Id, user.id],
        status: 'active',
        turn: Math.random() > 0.5 ? player1Id : user.id,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(gameRef, updates);
      navigate(`/game/${gameId}`);
    } catch (e) {
      console.error(e);
      alert('Failed to join match');
    }
  };

  const handleCancelMatch = async (gameId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'games', gameId));
    } catch (e) {
      console.error('Failed to cancel match:', e);
    }
  };

  const myWaitingGame = waitingGames.find((g) => g.player1 === user?.id);
  const myActiveGame = activeGames.find((g) => g.player1 === user?.id || g.player2 === user?.id);

  return (
    <div className="bg-[#0e0e0e] text-text-primary antialiased min-h-[calc(100vh-64px)] flex flex-col font-body-md w-full overflow-y-auto">
      <main className="flex-grow w-full max-w-4xl mx-auto px-4 md:px-8 py-8 md:py-12">
        <div className="space-y-10">
          
          {/* Main Matchmaking Card */}
          <div className="rounded-xl flex flex-col relative overflow-hidden group shadow-[0_4px_32px_rgba(0,0,0,0.6)] border border-white/10 bg-[#141414]">
            <div className="absolute top-0 left-0 w-full h-1 bg-velocity-red" />
            <div className="absolute top-0 right-0 w-80 h-80 bg-velocity-red/5 rounded-full blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center justify-center p-8 md:p-12 gap-6 w-full text-center">
              
              <div className="space-y-1.5">
                <h1 className="text-white font-headline-lg text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
                  {myActiveGame ? 'Game In Progress' : myWaitingGame ? 'Waiting For Opponent' : 'Play Connect 4'}
                </h1>
                <p className="text-text-secondary text-sm">
                  {myActiveGame
                    ? 'You have an active match waiting for your move.'
                    : myWaitingGame
                    ? 'Your game is open for another player to join.'
                    : 'Choose your stakes and enter a game.'}
                </p>
              </div>

              {!myWaitingGame && !myActiveGame && (
                <div className="flex flex-col items-center gap-6 justify-center w-full max-w-md mt-2">
                  
                  {/* Mode Selector */}
                  <div className="flex flex-col gap-3 items-center w-full">
                    <div className="flex gap-2 p-1 rounded-lg bg-[#0e0e0e] border border-white/10 w-full max-w-xs">
                      <button
                        onClick={() => setWagerType('SOL')}
                        className={`flex-1 py-2 text-xs rounded-md transition-all font-semibold uppercase tracking-wider ${
                          wagerType === 'SOL'
                            ? 'bg-velocity-red text-white shadow-[0_0_12px_rgba(255,77,77,0.4)]'
                            : 'text-text-secondary hover:text-white'
                        }`}
                      >
                        SOL Stakes
                      </button>
                      <button
                        onClick={() => setWagerType('FREE')}
                        className={`flex-1 py-2 text-xs rounded-md transition-all font-semibold uppercase tracking-wider ${
                          wagerType === 'FREE'
                            ? 'bg-velocity-red text-white shadow-[0_0_12px_rgba(255,77,77,0.4)]'
                            : 'text-text-secondary hover:text-white'
                        }`}
                      >
                        Free Play
                      </button>
                    </div>

                    {/* SOL Preset Chips */}
                    {wagerType === 'SOL' && (
                      <div className="flex flex-col gap-2 mt-1 items-center w-full">
                        <div className="flex gap-2 justify-center w-full flex-wrap">
                          {[0.05, 0.1, 0.25, 0.5, 1].map((amt) => (
                            <button
                              key={amt}
                              onClick={() => {
                                setWagerAmount(amt);
                                setCustomWager('');
                              }}
                              className={`px-3.5 py-2 font-mono text-xs rounded-md border transition-all ${
                                wagerAmount === amt && customWager === ''
                                  ? 'border-velocity-red text-velocity-red bg-velocity-red/10 font-bold'
                                  : 'border-white/10 text-text-secondary hover:border-white/20 bg-[#0e0e0e]'
                              }`}
                            >
                              {amt} SOL
                            </button>
                          ))}
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Custom SOL amount..."
                          value={customWager}
                          onChange={(e) => {
                            setCustomWager(e.target.value);
                            setWagerAmount(0);
                          }}
                          className="w-full h-10 bg-[#0e0e0e] border border-white/10 rounded-md px-3 font-mono text-xs text-white outline-none focus:border-velocity-red text-center"
                        />
                      </div>
                    )}
                  </div>

                  {/* Start Match Button */}
                  <button
                    onClick={handleCreateMatch}
                    disabled={isCreating}
                    className="w-full flex cursor-pointer items-center justify-center rounded-md h-12 px-8 bg-velocity-red hover:bg-red-600 active:scale-[0.99] transition-all text-white font-semibold shadow-[0_0_20px_rgba(255,77,77,0.35)] uppercase tracking-wider text-xs sm:text-sm disabled:opacity-50"
                  >
                    {isCreating ? (
                      <Loader2 className="animate-spin w-5 h-5" />
                    ) : (
                      <span className="flex items-center gap-2">
                        <Play size={15} /> Create Game
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* Waiting for Opponent */}
              {myWaitingGame && !myActiveGame && (
                <div className="flex flex-col items-center gap-5 justify-center w-full">
                  <div className="text-white text-xs sm:text-sm font-medium bg-[#0e0e0e] px-4 py-2 rounded-full border border-white/10 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-velocity-red animate-ping" />
                    Waiting for opponent to join... ({myWaitingGame.wager > 0 ? `${myWaitingGame.wager} SOL` : 'Free'})
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => navigate(`/game/${myWaitingGame.id}`)}
                      className="items-center justify-center rounded-md h-10 px-5 bg-velocity-red hover:bg-red-600 transition-colors text-white font-semibold shadow-[0_0_15px_rgba(255,77,77,0.3)] text-xs flex gap-2 uppercase tracking-wide"
                    >
                      <Play size={13} /> Open Game
                    </button>
                    <button
                      onClick={() => handleCancelMatch(myWaitingGame.id)}
                      className="items-center justify-center rounded-md h-10 px-5 bg-[#0e0e0e] hover:bg-[#1a1a1a] transition-colors text-red-400 hover:text-red-300 font-semibold border border-white/10 text-xs flex gap-2 uppercase tracking-wide"
                    >
                      <X size={13} /> Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Active Game */}
              {myActiveGame && (
                <div className="flex flex-col items-center gap-5 justify-center w-full">
                  <div className="text-velocity-red text-xs sm:text-sm font-medium bg-[#0e0e0e] px-4 py-2 rounded-full border border-velocity-red/40 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-velocity-red animate-pulse" />
                    Your match is live!
                  </div>
                  <button
                    onClick={() => navigate(`/game/${myActiveGame.id}`)}
                    className="items-center justify-center rounded-md h-11 px-8 bg-velocity-red hover:bg-red-600 transition-colors text-white font-semibold shadow-[0_0_20px_rgba(255,77,77,0.4)] text-xs sm:text-sm flex items-center gap-2 uppercase tracking-wide"
                  >
                    <Play size={15} /> Resume Game
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Live Games List */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h2 className="font-headline-lg text-white text-xl font-bold flex items-center gap-3">
                Live Games
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-velocity-red relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-velocity-red opacity-75" />
                </span>
              </h2>
              <span className="text-xs text-text-muted font-mono">
                {activeGames.length + waitingGames.length} Open
              </span>
            </div>

            <div className="space-y-3">
              {[...activeGames, ...waitingGames].map((game) => {
                const isWaiting = game.status === 'waiting';
                const isMyGame = game.player1 === user?.id;

                return (
                  <div
                    key={game.id}
                    onClick={() => {
                      if (game.status === 'active') {
                        navigate(`/game/${game.id}`);
                      } else if (isWaiting && !isMyGame) {
                        handleJoinMatch(game.id, game.player1);
                      } else if (isWaiting && isMyGame) {
                        navigate(`/game/${game.id}`);
                      }
                    }}
                    className="rounded-lg p-4 sm:p-5 flex items-center justify-between hover:bg-[#181818] transition-colors group cursor-pointer border border-white/10 bg-[#141414]"
                  >
                    {/* Players Info */}
                    <div className="flex items-center gap-4 sm:gap-6">
                      {/* Player 1 */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full border border-white/10 bg-[#0e0e0e] overflow-hidden flex items-center justify-center font-bold text-xs text-velocity-red shrink-0">
                          {game.player1Avatar ? (
                            <img src={game.player1Avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            game.player1Name ? game.player1Name.substring(0, 2).toUpperCase() : 'P1'
                          )}
                        </div>
                        <span className="text-sm text-white font-semibold group-hover:text-velocity-red transition-colors">
                          {game.player1Name || 'Player 1'}
                        </span>
                      </div>

                      <span className="text-xs italic font-semibold text-velocity-red/70 font-mono">VS</span>

                      {/* Player 2 */}
                      <div className="flex items-center gap-3">
                        {game.status === 'active' ? (
                          <>
                            <span className="text-sm text-white font-semibold">
                              {game.player2Name || 'Player 2'}
                            </span>
                            <div className="w-10 h-10 rounded-full border border-white/10 bg-[#0e0e0e] overflow-hidden flex items-center justify-center font-bold text-xs text-white shrink-0">
                              {game.player2Avatar ? (
                                <img src={game.player2Avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                game.player2Name ? game.player2Name.substring(0, 2).toUpperCase() : 'P2'
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-text-muted italic">Waiting for player...</span>
                        )}
                      </div>
                    </div>

                    {/* Stakes & Action */}
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className="hidden sm:block text-xs font-mono text-text-secondary text-right">
                        {game.wager > 0 ? `${game.wager} ${game.wagerCurrency}` : 'Free'}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`inline-flex h-2 w-2 rounded-full ${game.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'}`} />
                        <div className={`text-xs uppercase font-semibold tracking-wider font-mono ${game.status === 'active' ? 'text-emerald-400' : 'text-yellow-400'}`}>
                          {game.status === 'active' ? 'Watch' : isMyGame ? 'Your Game' : 'Join Game'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {activeGames.length === 0 && waitingGames.length === 0 && (
                <div className="text-center text-text-muted text-sm py-12 border border-dashed border-white/10 rounded-lg bg-[#141414]/50 font-mono">
                  No active games right now. Click Create Game to start one!
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
