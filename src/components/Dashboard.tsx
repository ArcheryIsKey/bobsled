import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useGameStore } from '../store';
import { Loader2, Swords, Trophy, Play, X, User } from 'lucide-react';
import PublicProfileModal from './PublicProfileModal';

export default function Dashboard() {
  const { user, setCurrentGameId, setSpectatingGameId } = useGameStore();
  const [waitingGames, setWaitingGames] = useState<any[]>([]);
  const [activeGames, setActiveGames] = useState<any[]>([]);
  const [wagerType, setWagerType] = useState<'SOL' | 'FREE'>('FREE');
  const [wagerAmount, setWagerAmount] = useState<number>(0);
  const [customWager, setCustomWager] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

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
  }, [user?.id, setCurrentGameId]);

  const handleCreateMatch = async () => {
    if (!user) return;
    setIsCreating(true);
    try {
      const isTestGame = !!user.isTestUser;
      const finalWager = isTestGame ? 0 : wagerType === 'FREE' ? 0 : customWager ? parseFloat(customWager) : wagerAmount;
      const finalCurrency = isTestGame ? 'FREE' : wagerType;

      if (finalCurrency === 'SOL' && (isNaN(finalWager) || finalWager <= 0)) {
        throw new Error('Invalid wager amount.');
      }

      const docRef = await addDoc(collection(db, 'games'), {
        player1: user.id,
        player1Name: user.username,
        player1Avatar: user.avatarUrl || null,
        player1IsTest: !!user.isTestUser,
        player2: null,
        player2Name: null,
        player2Avatar: null,
        player2IsTest: null,
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
        player2Name: user.username,
        player2Avatar: user.avatarUrl || null,
        player2IsTest: !!user.isTestUser,
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
    <div className="bg-background text-text-primary antialiased min-h-screen flex flex-col font-body-md selection:bg-velocity-red selection:text-text-primary w-full overflow-y-auto">
      {/* Public Profile Modal */}
      {selectedProfileId && (
        <PublicProfileModal userId={selectedProfileId} onClose={() => setSelectedProfileId(null)} />
      )}

      <main className="flex-grow w-full max-w-max-width mx-auto px-margin-mobile md:px-margin-desktop py-8 md:py-12">
        <div className="max-w-3xl mx-auto space-y-10">
          
          {/* Main Matchmaking Card (Stitch Screen 7509149ac996406897714f8bd4de335b) */}
          <div className="glass-panel rounded-xl flex flex-col h-full relative overflow-hidden group shadow-[0_0_30px_rgba(255,77,77,0.1)] border border-velocity-red/30 bg-surface-base">
            <div className="absolute top-0 left-0 w-full h-1 bg-velocity-red" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-velocity-red/5 rounded-full blur-3xl group-hover:bg-velocity-red/10 transition-colors pointer-events-none" />

            <div className="relative z-10 flex flex-col items-center justify-center p-8 md:p-12 gap-6 w-full text-center">
              <h2 className="text-text-primary font-headline-lg text-3xl sm:text-4xl md:text-5xl tracking-tight mb-1 uppercase group-hover:text-velocity-red transition-colors duration-300">
                {myActiveGame ? 'Game In Progress' : myWaitingGame ? 'Matchmaking Active' : 'Start Match'}
              </h2>

              {!myWaitingGame && !myActiveGame && (
                <div className="flex flex-col items-center gap-6 justify-center w-full max-w-md">
                  {/* Wager Mode Selector */}
                  <div className="flex flex-col gap-3 items-center w-full">
                    <p className="font-label-caps text-xs text-text-muted uppercase tracking-wider">
                      Select Stakes Currency
                    </p>
                    <div className="flex gap-2 p-1 rounded bg-surface-container border border-glass-border">
                      <button
                        onClick={() => setWagerType('FREE')}
                        className={`px-5 py-2 font-label-caps text-xs rounded transition-all font-bold ${
                          wagerType === 'FREE'
                            ? 'bg-velocity-red text-text-primary shadow-[0_0_10px_rgba(255,77,77,0.4)]'
                            : 'text-text-secondary hover:text-text-primary'
                        }`}
                      >
                        FREE PLAY
                      </button>
                      {!user?.isTestUser && (
                        <button
                          onClick={() => setWagerType('SOL')}
                          className={`px-5 py-2 font-label-caps text-xs rounded transition-all font-bold ${
                            wagerType === 'SOL'
                              ? 'bg-velocity-red text-text-primary shadow-[0_0_10px_rgba(255,77,77,0.4)]'
                              : 'text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          SOL WAGER
                        </button>
                      )}
                    </div>

                    {/* SOL Wager presets */}
                    {wagerType === 'SOL' && !user?.isTestUser && (
                      <div className="flex flex-col gap-2 mt-2 items-center w-full">
                        <div className="flex gap-2 justify-center w-full flex-wrap">
                          {[0.05, 0.1, 0.25, 0.5, 1].map((amt) => (
                            <button
                              key={amt}
                              onClick={() => {
                                setWagerAmount(amt);
                                setCustomWager('');
                              }}
                              className={`px-3 py-2 font-mono text-xs rounded border transition-all ${
                                wagerAmount === amt && customWager === ''
                                  ? 'border-velocity-red text-velocity-red bg-velocity-red/10 font-bold'
                                  : 'border-glass-border text-text-muted hover:border-text-secondary bg-surface-container'
                              }`}
                            >
                              {amt} SOL
                            </button>
                          ))}
                        </div>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Custom SOL wager..."
                          value={customWager}
                          onChange={(e) => {
                            setCustomWager(e.target.value);
                            setWagerAmount(0);
                          }}
                          className="w-full h-10 bg-surface-container border border-glass-border rounded px-3 font-mono text-xs text-text-primary outline-none focus:border-velocity-red text-center"
                        />
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <button
                    onClick={handleCreateMatch}
                    disabled={isCreating}
                    className="w-full flex cursor-pointer items-center justify-center rounded-lg h-13 px-8 bg-velocity-red hover:bg-primary-container transition-all text-text-primary font-bold shadow-[0_0_20px_rgba(255,77,77,0.3)] hover:shadow-[0_0_25px_rgba(255,77,77,0.5)] uppercase tracking-wider text-base disabled:opacity-50"
                  >
                    {isCreating ? (
                      <Loader2 className="animate-spin w-5 h-5" />
                    ) : (
                      <span className="flex items-center gap-2">
                        <Play size={16} /> Enter Arena Queue
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* Waiting state */}
              {myWaitingGame && !myActiveGame && (
                <div className="flex flex-col items-center gap-6 justify-center w-full">
                  <p className="text-text-primary font-body-md font-medium leading-relaxed bg-surface-container px-4 py-2 rounded-full border border-glass-border flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-velocity-red animate-ping" />
                    Broadcast Beacon Active — Waiting for Challenger...
                  </p>
                  <div className="flex gap-4">
                    <button
                      onClick={() => setCurrentGameId(myWaitingGame.id)}
                      className="min-w-[140px] items-center justify-center rounded-lg h-11 px-5 bg-velocity-red hover:bg-primary-container transition-colors text-text-primary font-bold shadow-[0_0_15px_rgba(255,77,77,0.3)] uppercase tracking-wider text-xs flex gap-2"
                    >
                      <Play size={14} /> Open Arena
                    </button>
                    <button
                      onClick={() => handleCancelMatch(myWaitingGame.id)}
                      className="min-w-[140px] items-center justify-center rounded-lg h-11 px-5 bg-surface-container hover:bg-surface-elevated transition-colors text-red-400 hover:text-red-300 font-bold border border-glass-border uppercase tracking-wider text-xs flex gap-2"
                    >
                      <X size={14} /> Cancel Queue
                    </button>
                  </div>
                </div>
              )}

              {/* Active Game State */}
              {myActiveGame && (
                <div className="flex flex-col items-center gap-6 justify-center w-full">
                  <p className="text-text-primary font-body-md font-medium bg-surface-container px-4 py-2 rounded-full border border-velocity-red/50 text-velocity-red flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-velocity-red animate-pulse" />
                    Engagement Underway!
                  </p>
                  <button
                    onClick={() => setCurrentGameId(myActiveGame.id)}
                    className="min-w-[200px] items-center justify-center rounded-lg h-13 px-8 bg-velocity-red hover:bg-primary-container transition-colors text-text-primary font-bold shadow-[0_0_20px_rgba(255,77,77,0.4)] uppercase tracking-wider text-sm flex items-center gap-2"
                  >
                    <Play size={16} /> Resume Live Battle
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Live Games Section (Stitch Screen 7509149ac996406897714f8bd4de335b) */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-glass-border pb-3">
              <h3 className="font-headline-lg text-text-primary text-xl sm:text-2xl uppercase tracking-wider flex items-center gap-3">
                Live Matches
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-velocity-red relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-velocity-red opacity-75" />
                </span>
              </h3>
              <span className="font-label-caps text-xs text-text-muted">
                {activeGames.length + waitingGames.length} Total Signals
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
                        setSpectatingGameId(game.id);
                      } else if (isWaiting && !isMyGame) {
                        handleJoinMatch(game.id, game.player1);
                      }
                    }}
                    className="glass-panel rounded-lg p-4 sm:p-5 flex items-center justify-between hover:bg-surface-elevated transition-colors group cursor-pointer shadow-lg border border-glass-border bg-surface-base"
                  >
                    {/* Players Info */}
                    <div className="flex items-center gap-4 sm:gap-6">
                      {/* Player 1 */}
                      <div className="flex items-center gap-3">
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedProfileId(game.player1);
                          }}
                          className="w-10 h-10 rounded-full border border-glass-border bg-surface-container overflow-hidden flex items-center justify-center font-bold text-xs text-velocity-red hover:border-velocity-red transition-colors"
                          title="View Pilot Profile"
                        >
                          {game.player1Avatar ? (
                            <img src={game.player1Avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            game.player1Name ? game.player1Name.substring(0, 2).toUpperCase() : 'P1'
                          )}
                        </div>
                        <span className="font-label-caps text-xs sm:text-sm text-text-primary font-bold">
                          {game.player1Name || 'Player 1'}
                          {game.player1IsTest && <span className="text-[10px] text-text-muted ml-1">(Test)</span>}
                        </span>
                      </div>

                      <span className="font-body-sm text-xs italic font-semibold text-velocity-red/70">VS</span>

                      {/* Player 2 */}
                      <div className="flex items-center gap-3">
                        {game.status === 'active' ? (
                          <>
                            <span className="font-label-caps text-xs sm:text-sm text-text-primary font-bold">
                              {game.player2Name || 'Player 2'}
                              {game.player2IsTest && <span className="text-[10px] text-text-muted ml-1">(Test)</span>}
                            </span>
                            <div
                              onClick={(e) => {
                                e.stopPropagation();
                                if (game.player2) setSelectedProfileId(game.player2);
                              }}
                              className="w-10 h-10 rounded-full border border-glass-border bg-surface-container overflow-hidden flex items-center justify-center font-bold text-xs text-text-primary hover:border-white transition-colors"
                              title="View Pilot Profile"
                            >
                              {game.player2Avatar ? (
                                <img src={game.player2Avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                game.player2Name ? game.player2Name.substring(0, 2).toUpperCase() : 'P2'
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="font-label-caps text-xs text-text-muted italic">Waiting for Challenger...</span>
                        )}
                      </div>
                    </div>

                    {/* Status & Stakes */}
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className="hidden sm:block font-label-caps text-xs text-text-secondary text-right">
                        {game.wager > 0 ? `${game.wager} ${game.wagerCurrency}` : 'FREE'}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`inline-flex h-2 w-2 rounded-full ${game.status === 'active' ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                        <div className={`font-label-caps text-xs uppercase font-bold ${game.status === 'active' ? 'text-green-400' : 'text-yellow-400'}`}>
                          {game.status === 'active' ? 'Watch' : isMyGame ? 'Your Match' : 'Join Match'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {activeGames.length === 0 && waitingGames.length === 0 && (
                <div className="text-center text-text-muted font-body-sm py-12 border border-dashed border-glass-border rounded-lg bg-surface-base/50">
                  No matches currently in queue. Click Start Match above to create one!
                </div>
              )}
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
