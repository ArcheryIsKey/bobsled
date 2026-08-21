import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useGameStore } from '../store';
import UserProfileModal from './UserProfileModal';
import SolAmount from './SolAmount';
import { useSolPrice } from '../utils/solPrice';
import { depositMatchStake } from '../utils/solanaEscrow';
import { logError } from '../utils/logger';
import { Loader2, Play, X, FlaskConical, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function Dashboard() {
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { user, addToast } = useGameStore();
  const { formatUsd } = useSolPrice();

  const [waitingGames, setWaitingGames] = useState<any[]>([]);
  const [activeGames, setActiveGames] = useState<any[]>([]);
  const [wagerType, setWagerType] = useState<'SOL' | 'FREE'>(user?.isTestUser ? 'FREE' : 'SOL');
  const [wagerAmount, setWagerAmount] = useState<number>(0.1);
  const [customWager, setCustomWager] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [creationStatus, setCreationStatus] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [testUserToast, setTestUserToast] = useState<{ matchId: string; message: string } | null>(null);

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
    setCreationStatus('Preparing match...');
    let createdDocId: string | null = null;

    try {
      const finalWager = user.isTestUser || wagerType === 'FREE' ? 0 : customWager ? parseFloat(customWager) : wagerAmount;
      const finalCurrency = user.isTestUser ? 'FREE' : wagerType;

      if (finalCurrency === 'SOL' && (isNaN(finalWager) || finalWager <= 0)) {
        throw new Error('Please enter a valid SOL wager.');
      }

      if (finalCurrency === 'SOL' && (!publicKey || !signTransaction)) {
        throw new Error('Please connect your Solana wallet to create a staked game.');
      }

      let depositTx: string | null = null;

      // If it's a SOL staked match, deposit into Escrow
      if (finalCurrency === 'SOL' && finalWager > 0 && publicKey) {
        setCreationStatus(`Approve ${finalWager} SOL deposit in your wallet...`);
        
        depositTx = await depositMatchStake({
          connection,
          signTransaction,
          publicKey,
          amountSol: finalWager,
        });

        setCreationStatus('Creating match on-chain...');
      }

      const inviteCode = Math.random().toString(36).substring(2, 8);

      const isHostRed = Math.random() > 0.5;
      const player1Color = isHostRed ? 'red' : 'white';
      const player2Color = isHostRed ? 'white' : 'red';

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
        player1Color,
        player2Color,
        status: 'waiting',
        wager: finalWager,
        wagerCurrency: finalCurrency,
        board: Array(42).fill(0),
        turn: user.id,
        winner: null,
        gameType: 'connect4',
        inviteCode,
        escrowStatus: finalWager > 0 ? 'p1_funded' : 'free',
        p1DepositTx: depositTx,
        p1Wallet: publicKey ? publicKey.toBase58() : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      createdDocId = docRef.id;
      navigate(`/game/${docRef.id}`);
    } catch (e: any) {
      logError('Match creation failed:', e);
      if (createdDocId) {
        deleteDoc(doc(db, 'games', createdDocId)).catch(() => {});
      }
      addToast('error', e.message || 'Failed to create match');
    } finally {
      setIsCreating(false);
      setCreationStatus(null);
    }
  };

  const handleJoinMatch = async (game: any) => {
    if (!user) return;
    
    if (user.isTestUser && game.wager > 0) {
      addToast('warning', 'Guest users can only join Free games. Connect a wallet to play with SOL stakes.');
      return;
    }

    try {
      let p2DepositTx: string | null = null;

      // If it's a SOL staked game, deposit stake
      if (game.wager > 0 && game.wagerCurrency !== 'FREE') {
        if (!publicKey || !signTransaction) {
          addToast('warning', 'Please connect your Solana wallet to join this staked match.');
          return;
        }

        p2DepositTx = await depositMatchStake({
          connection,
          signTransaction,
          publicKey,
          amountSol: game.wager,
        });
      }

      const gameRef = doc(db, 'games', game.id);

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

      await updateDoc(gameRef, updates);
      navigate(`/game/${game.id}`);
    } catch (e: any) {
      logError('Failed to join match:', e);
      addToast('error', e?.message || 'Failed to join match');
    }
  };

  const handleCancelMatch = async (gameId: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'games', gameId));
    } catch (e) {
      logError('Failed to cancel match:', e);
      addToast('error', 'Failed to cancel match');
    }
  };

  const handlePlayerClick = (e: React.MouseEvent, playerId: string | null, isGuest: boolean, matchSlotKey: string) => {
    e.stopPropagation();
    if (!playerId) return;
    if (isGuest || playerId.startsWith('test_')) {
      setTestUserToast({ matchId: matchSlotKey, message: 'Guest User (Temporary Account)' });
      setTimeout(() => {
        setTestUserToast((prev) => (prev?.matchId === matchSlotKey ? null : prev));
      }, 2500);
      return;
    }
    setSelectedProfileId(playerId);
  };

  const myWaitingGame = waitingGames.find((g) => g.player1 === user?.id);
  const myActiveGame = activeGames.find((g) => g.player1 === user?.id || g.player2 === user?.id);

  return (
    <div className="bg-[#0e0e0e] text-text-primary antialiased min-h-[calc(100vh-76px)] flex flex-col font-body-md w-full overflow-y-auto">
      
      {/* Floating User Profile Modal */}
      {selectedProfileId && (
        <UserProfileModal
          userId={selectedProfileId}
          onClose={() => setSelectedProfileId(null)}
        />
      )}

      <main className="flex-grow w-full max-w-4xl mx-auto px-4 md:px-8 py-6 md:py-10">
        <div className="space-y-8">
          
          {/* Main Matchmaking Card */}
          <div className="rounded-2xl flex flex-col relative overflow-hidden group shadow-[0_8px_32px_rgba(0,0,0,0.6)] border border-white/10 bg-[#141414]">
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
                    : user?.isTestUser
                    ? 'Guest mode: Free play matches only.'
                    : 'Choose your stakes and enter a game.'}
                </p>
              </div>

              {!myWaitingGame && !myActiveGame && (
                <div className="flex flex-col items-center gap-6 justify-center w-full max-w-md mt-2">
                  
                  {/* Mode Selector */}
                  <div className="flex flex-col gap-3 items-center w-full">
                    {user?.isTestUser ? (
                      <div className="flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-velocity-red/10 border border-velocity-red/30 text-velocity-red font-mono text-xs font-bold">
                        <FlaskConical size={14} />
                        <span>Free Play Only (Guest Mode)</span>
                      </div>
                    ) : (
                      <div className="flex gap-1.5 p-1 rounded-full bg-[#0e0e0e] border border-white/10 w-full max-w-xs">
                        <button
                          onClick={() => setWagerType('SOL')}
                          className={`flex-1 py-2 text-xs rounded-full transition-all font-semibold uppercase tracking-wider font-mono cursor-pointer ${
                            wagerType === 'SOL'
                              ? 'bg-velocity-red text-white shadow-[0_0_12px_rgba(255,77,77,0.4)]'
                              : 'text-text-secondary hover:text-white'
                          }`}
                        >
                          SOL Stakes
                        </button>
                        <button
                          onClick={() => setWagerType('FREE')}
                          className={`flex-1 py-2 text-xs rounded-full transition-all font-semibold uppercase tracking-wider font-mono cursor-pointer ${
                            wagerType === 'FREE'
                              ? 'bg-velocity-red text-white shadow-[0_0_12px_rgba(255,77,77,0.4)]'
                              : 'text-text-secondary hover:text-white'
                          }`}
                        >
                          Free Play
                        </button>
                      </div>
                    )}

                    {/* SOL Preset Chips */}
                    {!user?.isTestUser && wagerType === 'SOL' && (
                      <div className="flex flex-col gap-2 mt-1 items-center w-full">
                        <div className="flex gap-2 justify-center w-full flex-wrap">
                          {[0.05, 0.1, 0.25, 0.5, 1].map((amt) => (
                            <button
                              key={amt}
                              onClick={() => {
                                setWagerAmount(amt);
                                setCustomWager('');
                              }}
                              className={`px-3.5 py-1.5 font-mono text-xs rounded-full border transition-all cursor-pointer ${
                                wagerAmount === amt && customWager === ''
                                  ? 'border-velocity-red text-velocity-red bg-velocity-red/10 font-bold'
                                  : 'border-white/10 text-text-secondary hover:border-white/20 bg-[#0e0e0e]'
                              }`}
                            >
                              <SolAmount amount={amt} />
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
                          className="w-full h-10 bg-[#0e0e0e] border border-white/10 rounded-full px-4 font-mono text-xs text-white outline-none focus:border-velocity-red text-center"
                        />
                        {customWager && !isNaN(parseFloat(customWager)) && parseFloat(customWager) > 0 && (
                          <div className="text-[11px] text-text-secondary font-mono text-center">
                            USD Price: <span className="text-emerald-400 font-bold">{formatUsd(parseFloat(customWager)) || '---'}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Start Match Button */}
                  <button
                    onClick={handleCreateMatch}
                    disabled={isCreating}
                    className="w-full flex cursor-pointer items-center justify-center rounded-full h-12 px-8 bg-velocity-red hover:bg-red-600 active:scale-[0.99] transition-all text-white font-semibold shadow-[0_0_20px_rgba(255,77,77,0.35)] uppercase tracking-wider text-xs sm:text-sm disabled:opacity-50 font-mono"
                  >
                    {isCreating ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="animate-spin w-4 h-4" />
                        <span>{creationStatus || 'Processing...'}</span>
                      </div>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Play size={15} /> Create {user?.isTestUser ? 'Free' : wagerType} Game
                      </span>
                    )}
                  </button>
                </div>
              )}

              {/* Waiting for Opponent */}
              {myWaitingGame && !myActiveGame && (
                <div className="flex flex-col items-center gap-5 justify-center w-full">
                  <div className="text-white text-xs sm:text-sm font-medium bg-[#0e0e0e] px-5 py-2.5 rounded-full border border-white/10 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-velocity-red animate-ping" />
                    <span>
                      Waiting for opponent... ({myWaitingGame.wager > 0 ? <SolAmount amount={myWaitingGame.wager} /> : 'Free'})
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <button
                      onClick={() => navigate(`/game/${myWaitingGame.id}`)}
                      className="items-center justify-center rounded-full h-10 px-6 bg-velocity-red hover:bg-red-600 transition-colors text-white font-semibold shadow-[0_0_15px_rgba(255,77,77,0.3)] text-xs flex gap-2 uppercase tracking-wide font-mono cursor-pointer"
                    >
                      <Play size={13} /> Open Game
                    </button>
                    <button
                      onClick={() => handleCancelMatch(myWaitingGame.id)}
                      className="items-center justify-center rounded-full h-10 px-5 bg-[#0e0e0e] hover:bg-[#1a1a1a] transition-colors text-red-400 hover:text-red-300 font-semibold border border-white/10 text-xs flex gap-2 uppercase tracking-wide font-mono cursor-pointer"
                    >
                      <X size={13} /> Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Active Game */}
              {myActiveGame && (
                <div className="flex flex-col items-center gap-5 justify-center w-full">
                  <div className="text-velocity-red text-xs sm:text-sm font-medium bg-[#0e0e0e] px-5 py-2.5 rounded-full border border-velocity-red/40 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-velocity-red animate-pulse" />
                    Your match is live!
                  </div>
                  <button
                    onClick={() => navigate(`/game/${myActiveGame.id}`)}
                    className="items-center justify-center rounded-full h-11 px-8 bg-velocity-red hover:bg-red-600 transition-colors text-white font-semibold shadow-[0_0_20px_rgba(255,77,77,0.4)] text-xs sm:text-sm flex items-center gap-2 uppercase tracking-wide font-mono cursor-pointer"
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

                const isP1Test = game.player1IsTest || game.player1?.startsWith?.('test_');
                const isP2Test = game.player2IsTest || game.player2?.startsWith?.('test_');

                const p1Label = isP1Test ? (game.player1Name || 'Guest') : `@${game.player1Name || 'Player 1'}`;
                const p2Label = isP2Test ? (game.player2Name || 'Guest') : `@${game.player2Name || 'Player 2'}`;

                return (
                  <div
                    key={game.id}
                    className="rounded-2xl p-4 sm:p-5 flex items-center justify-between hover:bg-[#181818] transition-colors group border border-white/10 bg-[#141414]"
                  >
                    {/* Players Info */}
                    <div className="flex items-center gap-4 sm:gap-6">
                      
                      {/* Player 1 */}
                      <div
                        onClick={(e) => handlePlayerClick(e, game.player1, isP1Test, `${game.id}-p1`)}
                        className="flex items-center gap-3 cursor-pointer group/p1 hover:opacity-90 transition-all select-none relative"
                        title={!isP1Test ? 'View Profile' : 'Guest Player'}
                      >
                        {/* Guest toast popup */}
                        <AnimatePresence>
                          {testUserToast?.matchId === `${game.id}-p1` && (
                            <motion.div
                              initial={{ opacity: 0, y: 4, scale: 0.95 }}
                              animate={{ opacity: 1, y: -26, scale: 1 }}
                              exit={{ opacity: 0, y: -26, scale: 0.95 }}
                              className="absolute -top-2 left-0 z-30 px-3 py-1 bg-black/95 text-velocity-red border border-velocity-red/40 rounded-full text-[10px] font-mono font-bold shadow-lg flex items-center gap-1.5 pointer-events-none whitespace-nowrap"
                            >
                              <FlaskConical size={11} className="shrink-0" />
                              <span>{testUserToast.message}</span>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        <div className="w-10 h-10 rounded-full border border-white/10 group-hover/p1:border-velocity-red bg-[#0e0e0e] overflow-hidden flex items-center justify-center font-bold text-xs text-velocity-red shrink-0 transition-colors shadow-sm">
                          {game.player1Avatar ? (
                            <img src={game.player1Avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            game.player1Name ? game.player1Name.substring(0, 2).toUpperCase() : 'P1'
                          )}
                        </div>
                        <span className="text-sm text-white font-semibold group-hover/p1:text-velocity-red transition-colors underline-offset-2 hover:underline">
                          {p1Label}
                        </span>
                      </div>

                      <span className="text-xs italic font-semibold text-velocity-red/70 font-mono">VS</span>

                      {/* Player 2 */}
                      <div
                        onClick={(e) => game.player2 && handlePlayerClick(e, game.player2, isP2Test, `${game.id}-p2`)}
                        className={`flex items-center gap-3 ${game.player2 ? 'cursor-pointer group/p2 hover:opacity-90 transition-all select-none relative' : ''}`}
                        title={game.player2 ? (!isP2Test ? 'View Profile' : 'Guest Player') : ''}
                      >
                        {/* Guest toast popup */}
                        <AnimatePresence>
                          {testUserToast?.matchId === `${game.id}-p2` && (
                            <motion.div
                              initial={{ opacity: 0, y: 4, scale: 0.95 }}
                              animate={{ opacity: 1, y: -26, scale: 1 }}
                              exit={{ opacity: 0, y: -26, scale: 0.95 }}
                              className="absolute -top-2 right-0 z-30 px-3 py-1 bg-black/95 text-velocity-red border border-velocity-red/40 rounded-full text-[10px] font-mono font-bold shadow-lg flex items-center gap-1.5 pointer-events-none whitespace-nowrap"
                            >
                              <FlaskConical size={11} className="shrink-0" />
                              <span>{testUserToast.message}</span>
                            </motion.div>
                          )}
                        </AnimatePresence>

                        {game.status === 'active' ? (
                          <>
                            <span className="text-sm text-white font-semibold group-hover/p2:text-velocity-red transition-colors underline-offset-2 hover:underline">
                              {p2Label}
                            </span>
                            <div className="w-10 h-10 rounded-full border border-white/10 group-hover/p2:border-white bg-[#0e0e0e] overflow-hidden flex items-center justify-center font-bold text-xs text-white shrink-0 transition-colors shadow-sm">
                              {game.player2Avatar ? (
                                <img src={game.player2Avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                game.player2Name ? game.player2Name.substring(0, 2).toUpperCase() : 'P2'
                              )}
                            </div>
                          </>
                        ) : (
                          <span className="text-xs text-text-muted italic">...</span>
                        )}
                      </div>
                    </div>

                    {/* Stakes & Action Buttons */}
                    <div className="flex items-center gap-4 sm:gap-6">
                      <div className="hidden sm:block text-xs font-mono text-text-secondary text-right">
                        {game.wager > 0 ? (
                          <div className="flex items-center gap-1 text-velocity-red font-bold">
                            <Coins size={12} />
                            <SolAmount amount={game.wager} className="font-bold text-velocity-red" />
                          </div>
                        ) : (
                          'Free'
                        )}
                      </div>

                      <button
                        onClick={() => {
                          if (game.status === 'active') {
                            navigate(`/game/${game.id}`);
                          } else if (isWaiting && !isMyGame) {
                            handleJoinMatch(game);
                          } else if (isWaiting && isMyGame) {
                            navigate(`/game/${game.id}`);
                          }
                        }}
                        className={`px-4 py-1.5 rounded-full text-xs font-semibold font-mono uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                          game.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                            : isMyGame
                            ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 hover:bg-yellow-500/20'
                            : 'bg-velocity-red hover:bg-red-600 text-white shadow-[0_0_12px_rgba(255,77,77,0.3)]'
                        }`}
                      >
                        <span className={`inline-flex h-2 w-2 rounded-full ${game.status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'}`} />
                        <span>{game.status === 'active' ? 'Watch' : isMyGame ? 'Your Game' : 'Join Game'}</span>
                      </button>
                    </div>
                  </div>
                );
              })}

              {activeGames.length === 0 && waitingGames.length === 0 && (
                <div className="text-center text-text-muted text-sm py-12 border border-dashed border-white/10 rounded-2xl bg-[#141414]/50 font-mono">
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
