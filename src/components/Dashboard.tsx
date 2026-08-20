import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, orderBy, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useGameStore } from '../store';
import { Loader2 } from 'lucide-react';

export default function Dashboard() {
  const { user, setCurrentGameId, setSpectatingGameId } = useGameStore();
  const [waitingGames, setWaitingGames] = useState<any[]>([]);
  const [activeGames, setActiveGames] = useState<any[]>([]);
  const [pastGames, setPastGames] = useState<any[]>([]);
  
  const [wagerType, setWagerType] = useState<'SOL' | 'FREE'>('FREE');
  const [wagerAmount, setWagerAmount] = useState<number>(0);
  const [customWager, setCustomWager] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  
  const [leaderboard, setLeaderboard] = useState<any[]>([]);

  useEffect(() => {
    // Listen for waiting games
    const qWaiting = query(collection(db, 'games'), where('status', '==', 'waiting'));
    const unsubWaiting = onSnapshot(qWaiting, (snapshot) => {
      const games = snapshot.docs.map(doc => ({ id: doc.id, ...(doc.data() as any) }));
      setWaitingGames(games);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'games'));

    // Listen for active games
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
        player1Name: user.username,
        player1IsTest: !!user.isTestUser,
        player2: null,
        player2Name: null,
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

  const myWaitingGame = waitingGames.find(g => g.player1 === user?.id);
  const myActiveGame = activeGames.find(g => g.player1 === user?.id || g.player2 === user?.id);

  return (
    <div className="bg-background text-text-primary antialiased min-h-screen flex flex-col font-body-md selection:bg-velocity-red selection:text-text-primary w-full overflow-y-auto">
      <div className="flex-1 w-full max-w-max-width mx-auto px-margin-mobile md:px-margin-desktop py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start relative z-10 w-full h-full">
          
          <div className="lg:col-span-8 flex flex-col gap-8 w-full order-2 lg:order-1 h-full">
            <div className="bg-surface-base border border-glass-border p-6 rounded-lg relative overflow-hidden group hover:border-velocity-red/30 transition-colors w-full h-full">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h1 className="font-display-lg text-display-lg text-text-primary mb-1 tracking-tighter uppercase">Arena</h1>
                  <p className="font-body-sm text-body-sm text-text-secondary leading-relaxed">Select your wager to enter the queue.</p>
                </div>
                <span className="material-symbols-outlined text-text-muted">videogame_asset</span>
              </div>
              
              <div className="h-px w-full bg-glass-border mb-6"></div>
              
              <div className="relative group w-full">
                <div className="absolute inset-0 bg-gradient-to-r from-velocity-red/10 via-surface-elevated to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 rounded-lg pointer-events-none"></div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-velocity-red/5 rounded-full blur-3xl group-hover:bg-velocity-red/10 transition-colors pointer-events-none"></div>
                
                <div className="relative z-10 flex flex-col items-center justify-center p-8 md:p-12 gap-8 w-full text-center">
                  <div className="relative z-10 flex w-full flex-col items-center justify-center gap-6">
                    <h2 className="text-text-primary font-headline-lg text-4xl md:text-5xl tracking-[-0.015em] mb-2 uppercase group-hover:text-velocity-red transition-colors duration-300">
                      {myActiveGame ? 'Game In Progress' : myWaitingGame ? 'Waiting...' : 'Start Game'}
                    </h2>
                    
                    {!myWaitingGame && !myActiveGame && (
                      <div className="flex flex-col items-center gap-6 justify-center w-full">
                        <div className="flex flex-col gap-2 items-center">
                           <div className="flex gap-2">
                            <button onClick={() => setWagerType('FREE')} className={`px-4 py-2 font-label-caps text-label-caps cursor-pointer rounded-DEFAULT transition-all ${wagerType === 'FREE' ? 'bg-velocity-red text-text-primary' : 'bg-surface-variant text-text-secondary hover:text-text-primary border border-glass-border'}`}>FREE</button>
                            {!user?.isTestUser && <button onClick={() => setWagerType('SOL')} className={`px-4 py-2 font-label-caps text-label-caps cursor-pointer rounded-DEFAULT transition-all ${wagerType === 'SOL' ? 'bg-velocity-red text-text-primary' : 'bg-surface-variant text-text-secondary hover:text-text-primary border border-glass-border'}`}>SOL</button>}
                           </div>
                           {wagerType === 'SOL' && (
                             <div className="flex flex-col gap-2 mt-2 items-center">
                               <div className="flex gap-2">
                                 {[0.05, 0.1, 0.25, 0.5, 1].map(amt => (
                                   <button key={amt} onClick={() => { setWagerAmount(amt); setCustomWager(''); }} className={`w-12 h-10 font-mono text-sm cursor-pointer border rounded flex items-center justify-center transition-all ${wagerAmount === amt && customWager === '' ? 'border-velocity-red text-velocity-red bg-velocity-red/10' : 'border-glass-border text-text-muted hover:border-text-secondary'}`}>{amt}</button>
                                 ))}
                               </div>
                               <input type="number" placeholder="Custom..." value={customWager} onChange={e => { setCustomWager(e.target.value); setWagerAmount(0); }} className="w-full h-10 bg-surface-container border border-glass-border rounded px-3 font-mono text-sm text-text-primary outline-none focus:border-velocity-red text-center" />
                             </div>
                           )}
                        </div>
                        
                        <button 
                          onClick={handleCreateMatch}
                          disabled={isCreating}
                          className="flex min-w-[200px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-14 px-10 bg-velocity-red hover:bg-primary-container transition-colors text-text-primary font-bold shadow-[0_0_15px_rgba(255,77,77,0.3)] hover:shadow-[0_0_20px_rgba(255,77,77,0.5)] uppercase tracking-wider text-lg disabled:opacity-50"
                        >
                          {isCreating ? <Loader2 className="animate-spin w-5 h-5" /> : <span className="truncate">Enter Match</span>}
                        </button>
                      </div>
                    )}
  
                    {myWaitingGame && !myActiveGame && (
                       <div className="flex flex-col items-center gap-6 justify-center w-full">
                        <p className="text-text-primary font-body-md font-medium leading-relaxed bg-surface-container-high w-fit px-4 py-2 rounded-full border border-glass-border">
                          Waiting for Opponent
                        </p>
                        <div className="flex gap-4">
                          <button 
                            onClick={() => setCurrentGameId(myWaitingGame.id)}
                            className="flex min-w-[150px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-6 bg-velocity-red hover:bg-primary-container transition-colors text-text-primary font-bold shadow-[0_0_15px_rgba(255,77,77,0.2)] uppercase tracking-wider text-sm"
                          >
                            <span className="truncate">Go to Game</span>
                          </button>
                          <button 
                            onClick={() => handleCancelMatch(myWaitingGame.id)}
                            className="flex min-w-[150px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-12 px-6 bg-surface-variant hover:bg-surface-bright transition-colors text-text-primary font-bold shadow-[0_0_15px_rgba(255,255,255,0.05)] uppercase tracking-wider text-sm border border-glass-border"
                          >
                            <span className="truncate">Cancel Match</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {myActiveGame && (
                       <div className="flex flex-col items-center gap-6 justify-center w-full">
                        <p className="text-text-primary font-body-md font-medium leading-relaxed bg-surface-container-high w-fit px-4 py-2 rounded-full border border-glass-border">
                          You have a game in progress!
                        </p>
                        <button 
                          onClick={() => setCurrentGameId(myActiveGame.id)}
                          className="flex min-w-[200px] cursor-pointer items-center justify-center overflow-hidden rounded-lg h-14 px-10 bg-velocity-red hover:bg-primary-container transition-colors text-text-primary font-bold shadow-[0_0_15px_rgba(255,77,77,0.3)] hover:shadow-[0_0_20px_rgba(255,77,77,0.5)] uppercase tracking-wider text-lg"
                        >
                          <span className="truncate">Resume Game</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* LIVE ARENA Section */}
            <div className="mt-12 flex flex-col gap-6 max-w-2xl mx-auto">
              <div className="flex items-center justify-center mb-4">
                <h3 className="font-headline-lg text-text-primary text-3xl uppercase tracking-wider flex items-center">
                  Live Games 
                  <span className="ml-4 inline-flex h-3 w-3 rounded-full bg-velocity-red relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-velocity-red opacity-75"></span>
                  </span>
                </h3>
              </div>

              {[...activeGames, ...waitingGames].map(game => (
                <div key={game.id} onClick={() => {
                  if (game.status === 'active') {
                    setSpectatingGameId(game.id);
                  } else if (game.status === 'waiting' && game.player1 !== user?.id) {
                    handleJoinMatch(game.id, game.player1);
                  }
                }} className="bg-[rgba(18,18,18,0.8)] backdrop-blur-[16px] rounded-lg p-5 flex items-center justify-between hover:bg-surface-container-highest/30 transition-colors group cursor-pointer shadow-[0_0_15px_rgba(0,0,0,0.5)] border border-[rgba(255,255,255,0.1)]">
                  <div className="flex items-center space-x-6">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 rounded-full border border-glass-border bg-surface-variant flex items-center justify-center font-bold text-sm text-velocity-red">
                        {game.player1Name ? game.player1Name.substring(0,2).toUpperCase() : 'P1'}
                      </div>
                      <span className="font-label-caps text-sm text-text-primary font-bold">
                        {game.player1Name || 'Player 1'}
                        {game.player1IsTest && ' (Test)'}
                      </span>
                    </div>
                    
                    <span className={`font-body-sm text-base italic font-semibold ${game.status === 'active' ? 'text-velocity-red/70' : 'text-text-muted'}`}>VS</span>
                    
                    <div className="flex items-center space-x-4">
                      {game.status === 'active' ? (
                        <>
                           <span className="font-label-caps text-sm text-text-primary font-bold">
                             {game.player2Name || 'Player 2'}
                             {game.player2IsTest && ' (Test)'}
                           </span>
                           <div className="w-10 h-10 rounded-full border border-glass-border bg-surface-variant flex items-center justify-center font-bold text-sm text-text-primary">
                             {game.player2Name ? game.player2Name.substring(0,2).toUpperCase() : 'P2'}
                           </div>
                        </>
                      ) : (
                         <span className="font-label-caps text-sm text-text-muted italic">Waiting...</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-6">
                    <div className="text-right flex items-center gap-2">
                      <span className={`inline-flex h-2 w-2 rounded-full ${game.status === 'active' ? 'bg-green-500' : 'bg-yellow-500'}`}></span>
                      <div className={`font-label-caps text-xs uppercase font-bold ${game.status === 'active' ? 'text-green-400' : 'text-yellow-400'}`}>
                        {game.status === 'active' ? 'Live Now' : 'Waiting'}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              
              {activeGames.length === 0 && waitingGames.length === 0 && (
                <div className="text-center text-text-muted font-body-sm py-8 border border-dashed border-glass-border rounded-lg">
                  No games currently active.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
