import React, { useState, useEffect, useRef, type MouseEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useGameStore } from '../store';
import UserProfileModal from './UserProfileModal';
import SolAmount from './SolAmount';
import { useSolPrice } from '../utils/solPrice';
import { depositMatchStake, validateSolBalance, MIN_WAGER_SOL, MAX_WAGER_SOL, MIN_TX_FEE_BUFFER_SOL } from '../utils/solanaEscrow';
import { logError } from '../utils/logger';
import { SOLANA_FAUCET_URL } from '../constants';
import { CircleNotch, Play, X, Flask, Coins, CurrencyDollar, WarningCircle, ArrowSquareOut } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

function WagerPill({
  amt,
  isSelected,
  onClick,
}: {
  key?: number;
  amt: number;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const { solPrice, formatUsd } = useSolPrice();
  const usdValueStr = formatUsd(amt);

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <button
        type="button"
        onClick={onClick}
        className={`px-5 py-2.5 font-mono text-sm rounded-full border transition-all cursor-pointer ${
          isSelected
            ? 'border-primary text-primary bg-primary/10 font-bold shadow-[0_0_15px_rgba(255,77,77,0.2)]'
            : 'border-white/10 text-text-secondary hover:border-white/30 hover:text-white bg-black/40'
        }`}
      >
        {amt} SOL
      </button>

      {/* Floating Real-Time USD Tooltip over whole pill */}
      <AnimatePresence>
        {isHovered && usdValueStr && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="absolute z-[200] bottom-full mb-2 left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap"
          >
            <div className="bg-[#121212]/95 backdrop-blur-xl border border-white/20 px-3 py-1.5 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.9)] flex flex-col items-center gap-0.5 font-mono text-center">
              <div className="flex items-center gap-1 text-emerald-400 font-bold text-xs">
                <CurrencyDollar size={11} className="-mr-0.5" />
                <span>≈ {usdValueStr} USD</span>
              </div>
              {solPrice && (
                <div className="text-[9px] text-text-muted">
                  @ ${solPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/SOL
                </div>
              )}
              {/* Tooltip caret */}
              <div className="absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-[#121212] border-r border-b border-white/20 rotate-45 -bottom-1" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { user, addToast, solBalance } = useGameStore();
  const { formatUsd } = useSolPrice();

  const [waitingGames, setWaitingGames] = useState<any[]>([]);
  const [activeGames, setActiveGames] = useState<any[]>([]);
  const [loadingGames, setLoadingGames] = useState(true);
  const [wagerType, setWagerType] = useState<'SOL' | 'FREE'>(user?.isTestUser ? 'FREE' : 'SOL');
  const [wagerAmount, setWagerAmount] = useState<number>(0.1);
  const [customWager, setCustomWager] = useState<string>('');
  const [isCreating, setIsCreating] = useState(false);
  const [creationStatus, setCreationStatus] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [testUserToast, setTestUserToast] = useState<{ matchId: string; message: string } | null>(null);

  const isCreatingRef = useRef(false);
  const isJoiningRef = useRef(false);

  useEffect(() => {
    document.title = 'bobsled.gg - Connect 4';
  }, []);

  useEffect(() => {
    if (user?.isTestUser) {
      setWagerType('FREE');
    }
  }, [user?.isTestUser]);

  useEffect(() => {
    let receivedWaiting = false;
    let receivedActive = false;
    const startTime = Date.now();
    const checkDone = () => {
      if (receivedWaiting && receivedActive) {
        const elapsed = Date.now() - startTime;
        const delay = Math.max(0, 350 - elapsed);
        setTimeout(() => {
          setLoadingGames(false);
        }, delay);
      }
    };

    // Listen for waiting games
    const qWaiting = query(collection(db, 'games'), where('status', '==', 'waiting'));
    const unsubWaiting = onSnapshot(
      qWaiting,
      (snapshot) => {
        const games = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }));
        setWaitingGames(games);
        receivedWaiting = true;
        checkDone();
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'games');
        receivedWaiting = true;
        checkDone();
      }
    );

    // Listen for active games
    const qActive = query(collection(db, 'games'), where('status', '==', 'active'));
    const unsubActive = onSnapshot(
      qActive,
      (snapshot) => {
        const games = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }));
        setActiveGames(games);
        receivedActive = true;
        checkDone();
      },
      (err) => {
        receivedActive = true;
        checkDone();
      }
    );

    return () => {
      unsubWaiting();
      unsubActive();
    };
  }, []);

  const handleCreateMatch = async () => {
    if (!user || isCreatingRef.current) return;
    isCreatingRef.current = true;
    setIsCreating(true);
    setCreationStatus('Preparing match...');
    let createdDocId: string | null = null;
    let broadcastTxHash: string | null = null;

    try {
      const parsedCustom = customWager.trim() ? parseFloat(customWager.trim()) : NaN;
      const finalWager = user.isTestUser || wagerType === 'FREE' ? 0 : !isNaN(parsedCustom) ? parsedCustom : wagerAmount;
      const finalCurrency = user.isTestUser ? 'FREE' : wagerType;

      if (finalCurrency === 'SOL') {
        if (isNaN(finalWager) || finalWager < MIN_WAGER_SOL) {
          throw new Error(`Minimum wager is ${MIN_WAGER_SOL} SOL.`);
        }
        if (finalWager > MAX_WAGER_SOL) {
          throw new Error(`Maximum wager is ${MAX_WAGER_SOL} SOL.`);
        }
        if (!publicKey || !signTransaction) {
          throw new Error('Please connect your Solana wallet to create a staked game.');
        }

        // Pre-validate balance before initiating transaction
        const balanceCheck = await validateSolBalance(connection, publicKey, finalWager, MIN_TX_FEE_BUFFER_SOL);
        if (!balanceCheck.valid) {
          throw new Error(balanceCheck.error || `Insufficient SOL balance. Required: ${(finalWager + MIN_TX_FEE_BUFFER_SOL).toFixed(4)} SOL.`);
        }
      }

      const inviteCode = Math.random().toString(36).substring(2, 8);
      const isHostRed = Math.random() > 0.5;
      const player1Color = isHostRed ? 'red' : 'white';
      const player2Color = isHostRed ? 'white' : 'red';

      // 1. If it's a SOL staked match, deposit into Escrow FIRST before creating the match
      if (finalCurrency === 'SOL' && finalWager > 0 && publicKey) {
        setCreationStatus(`Approve ${finalWager} SOL deposit in your wallet...`);
        
        const depositSig = await depositMatchStake({
          connection,
          signTransaction,
          publicKey,
          amountSol: finalWager,
          onSigned: async (signature) => {
            broadcastTxHash = signature;
            setCreationStatus('Registering match on platform...');
          }
        });
        broadcastTxHash = depositSig;
      }

      // 2. Create the match in the database only AFTER the transaction has been signed
      setCreationStatus('Registering match...');
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
        escrowStatus: finalWager > 0 ? 'verifying_deposit' : 'free',
        p1DepositTx: broadcastTxHash,
        p1Wallet: publicKey ? publicKey.toBase58() : null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      createdDocId = docRef.id;

      // 3. Once created, verify on backend server to transition escrowStatus -> 'p1_funded'
      if (finalCurrency === 'SOL' && finalWager > 0 && publicKey && broadcastTxHash) {
        setCreationStatus('Verifying deposit on backend...');
        const verifyRes = await fetch('/api/escrow/verify-deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: docRef.id,
            role: 'player1',
            txHash: broadcastTxHash,
            senderWallet: publicKey.toBase58(),
          }),
        });

        if (!verifyRes.ok) {
          const errData = await verifyRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to verify deposit on-chain');
        }
      }

      navigate(`/game/${docRef.id}`);
    } catch (e: any) {
      logError('Match creation failed:', e);
      if (createdDocId) {
        if (broadcastTxHash && user) {
          setCreationStatus('Processing automatic refund...');
          try {
            await fetch('/api/escrow/refund-cancel', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                gameId: createdDocId,
                userId: user.id,
                txHash: broadcastTxHash,
                walletAddress: publicKey ? publicKey.toBase58() : undefined,
              }),
            });
            addToast('info', 'Deposit safely refunded to your wallet');
          } catch (refundErr) {
            logError('Auto-refund request failed:', refundErr);
          }
        } else {
          deleteDoc(doc(db, 'games', createdDocId)).catch(() => {});
        }
      }
      const msg = e?.message || '';
      if (msg.includes('rejected') || msg.includes('cancelled') || msg.includes('canceled')) {
        addToast('info', 'Transaction cancelled in wallet');
      } else {
        addToast('error', msg || 'Failed to create match');
      }
    } finally {
      isCreatingRef.current = false;
      setIsCreating(false);
      setCreationStatus(null);
    }
  };

  const handleJoinMatch = async (game: any) => {
    if (!user || isJoiningRef.current) return;
    
    if (user.isTestUser && game.wager > 0) {
      addToast('warning', 'Guest users can only join Free games. Connect a wallet to play with SOL stakes.');
      return;
    }

    if (game.wager > 0 && game.wagerCurrency !== 'FREE') {
      if (game.escrowStatus !== 'p1_funded' || !game.p1DepositTx) {
        addToast('error', 'Cannot join match: host stake deposit has not been confirmed on-chain yet.');
        return;
      }
      if (!publicKey || !signTransaction) {
        addToast('warning', 'Please connect your Solana wallet to join this staked match.');
        return;
      }

      const balanceCheck = await validateSolBalance(connection, publicKey, game.wager, MIN_TX_FEE_BUFFER_SOL);
      if (!balanceCheck.valid) {
        addToast('error', balanceCheck.error || 'Insufficient SOL balance to join match.');
        return;
      }
    }

    isJoiningRef.current = true;
    try {
      let p2DepositTx: string | null = null;

      // If it's a SOL staked game, deposit stake FIRST
      if (game.wager > 0 && game.wagerCurrency !== 'FREE') {
        p2DepositTx = await depositMatchStake({
          connection,
          signTransaction,
          publicKey: publicKey!,
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
        status: game.wager > 0 ? 'waiting' : 'active',
        turn: firstTurn,
        updatedAt: serverTimestamp(),
      };

      if (publicKey) {
        updates.p2Wallet = publicKey.toBase58();
      }

      await updateDoc(gameRef, updates);

      if (p2DepositTx && publicKey) {
        const verifyRes = await fetch('/api/escrow/verify-deposit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gameId: game.id,
            role: 'player2',
            txHash: p2DepositTx,
            senderWallet: publicKey.toBase58(),
          }),
        });

        if (!verifyRes.ok) {
          const errData = await verifyRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to verify join deposit on-chain');
        }
      }

      navigate(`/game/${game.id}`);
    } catch (e: any) {
      logError('Failed to join match:', e);
      const msg = e?.message || '';
      if (msg.includes('rejected') || msg.includes('cancelled') || msg.includes('canceled')) {
        addToast('info', 'Transaction cancelled in wallet');
      } else {
        addToast('error', msg || 'Failed to join match');
      }
    } finally {
      isJoiningRef.current = false;
    }
  };

  const handleCancelMatch = async (gameId: string) => {
    if (!user) return;
    try {
      const response = await fetch('/api/escrow/refund-cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId, userId: user.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to cancel match');
      }
    } catch (e: any) {
      logError('Failed to cancel match:', e);
      addToast('error', e.message || 'Failed to cancel match');
    }
  };

  const handlePlayerClick = (e: MouseEvent, playerId: string | null, isGuest: boolean, matchSlotKey: string) => {
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

  
  const availableWaitingGames = waitingGames.filter(
    (g) => g.wagerCurrency === 'FREE' || g.wager === 0 || g.escrowStatus === 'p1_funded'
  );
  const myWaitingGame = waitingGames.find(
    (g) => g.player1 === user?.id && (g.wagerCurrency === 'FREE' || g.wager === 0 || g.escrowStatus === 'p1_funded' || g.escrowStatus === 'verifying_deposit')
  );
  const myActiveGame = activeGames.find((g) => g.player1 === user?.id || g.player2 === user?.id);

  return (
    <div className="relative min-h-[calc(100vh-76px)] flex flex-col w-full overflow-y-auto">
      {/* Radial glows for Ethereal Glass vibe */}
      <div className="radial-glow top-0 left-1/2 -translate-x-1/2 opacity-60" />
      
      {selectedProfileId && (
        <UserProfileModal
          userId={selectedProfileId}
          onClose={() => setSelectedProfileId(null)}
        />
      )}

      <main className="flex-grow w-full max-w-5xl mx-auto px-4 md:px-8 py-24 md:py-32">
        <div className="space-y-32">
          
          {/* Main Matchmaking Card */}
          <div className="double-bezel-outer mx-auto max-w-2xl w-full">
            <div className="double-bezel-inner relative flex flex-col items-center justify-center p-10 md:p-16 gap-10 text-center overflow-hidden">
              <div className="absolute top-0 right-0 w-96 h-96 bg-primary-dim rounded-full blur-[100px] pointer-events-none" />

              <div className="space-y-4 z-10">
                {!myActiveGame && !myWaitingGame && (
                  <div className="inline-block rounded-full px-3 py-1 bg-white/5 border border-white/10 text-[10px] uppercase tracking-[0.2em] font-medium text-text-secondary mb-4">
                    Connect 4
                  </div>
                )}
                <h1 className="text-white font-display text-4xl sm:text-5xl md:text-6xl tracking-tight leading-[1.1]">
                  {myActiveGame ? 'Match in Progress' : myWaitingGame ? 'Awaiting Player' : 'Create a Game'}
                </h1>
                <p className="text-text-secondary text-sm md:text-base max-w-sm mx-auto">
                  {myActiveGame
                    ? 'You have an active match waiting for your move.'
                    : myWaitingGame
                    ? 'Your game is open for another player to join.'
                    : user?.isTestUser
                    ? 'Guest mode: Free play matches only.'
                    : 'Select your wager amount or play for free.'}
                </p>
              </div>

              {!myWaitingGame && !myActiveGame && (
                <div className="flex flex-col items-center gap-8 w-full max-w-md z-10">
                  <div className="flex flex-col gap-4 items-center w-full">
                    {user?.isTestUser ? (
                      <div className="flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-primary-dim border border-primary/30 text-primary font-mono text-xs font-bold">
                        <Flask size={16} />
                        <span>Free Play Only (Guest Mode)</span>
                      </div>
                    ) : (
                      <div className="flex p-1.5 rounded-full bg-black/40 border border-white/10 w-full">
                        <button
                          onClick={() => setWagerType('SOL')}
                          className={`flex-1 py-3 text-xs rounded-full transition-all font-semibold uppercase tracking-wider font-mono cursor-pointer ${
                            wagerType === 'SOL'
                              ? 'bg-primary text-white shadow-[0_0_24px_rgba(255,77,77,0.4)]'
                              : 'text-text-secondary hover:text-white'
                          }`}
                        >
                          SOL Stakes
                        </button>
                        <button
                          onClick={() => setWagerType('FREE')}
                          className={`flex-1 py-3 text-xs rounded-full transition-all font-semibold uppercase tracking-wider font-mono cursor-pointer ${
                            wagerType === 'FREE'
                              ? 'bg-primary text-white shadow-[0_0_24px_rgba(255,77,77,0.4)]'
                              : 'text-text-secondary hover:text-white'
                          }`}
                        >
                          Free Play
                        </button>
                      </div>
                    )}

                    {!user?.isTestUser && wagerType === 'SOL' && (
                      <div className="flex flex-col gap-4 mt-2 items-center w-full">
                        <div className="flex gap-2 justify-center w-full flex-wrap">
                          {[0.05, 0.1, 0.25, 0.5, 1].map((amt) => (
                            <WagerPill
                              key={amt}
                              amt={amt}
                              isSelected={wagerAmount === amt && customWager === ''}
                              onClick={() => {
                                setWagerAmount(amt);
                                setCustomWager('');
                              }}
                            />
                          ))}
                        </div>
                        <input
                          id="customWagerInput"
                          name="customWager"
                          autoComplete="off"
                          type="number"
                          step="0.01"
                          min={MIN_WAGER_SOL}
                          max={MAX_WAGER_SOL}
                          placeholder="Custom SOL amount (0.001 - 100)..."
                          value={customWager}
                          onChange={(e) => {
                            setCustomWager(e.target.value);
                            setWagerAmount(0);
                          }}
                          className="w-full h-12 bg-black/40 border border-white/10 rounded-full px-6 font-mono text-sm text-white outline-none focus:border-primary text-center transition-colors"
                        />
                        {customWager && !isNaN(parseFloat(customWager)) && (
                          <div className="flex flex-col items-center gap-1 w-full">
                            {parseFloat(customWager) < MIN_WAGER_SOL && (
                              <div className="text-xs text-red-400 font-mono text-center">
                                Minimum custom wager is {MIN_WAGER_SOL} SOL
                              </div>
                            )}
                            {parseFloat(customWager) > MAX_WAGER_SOL && (
                              <div className="text-xs text-red-400 font-mono text-center">
                                Maximum custom wager is {MAX_WAGER_SOL} SOL
                              </div>
                            )}
                            {parseFloat(customWager) >= MIN_WAGER_SOL && parseFloat(customWager) <= MAX_WAGER_SOL && (
                              <div className="text-xs text-text-muted font-mono text-center">
                                USD Value: <span className="text-white font-bold">{formatUsd(parseFloat(customWager)) || '---'}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Faucet Guidance Banner if Balance is Low */}
                        {(() => {
                          const currentWager = customWager ? parseFloat(customWager) : wagerAmount;
                          const hasLowBalance = !isNaN(currentWager) && currentWager > 0 && solBalance !== null && solBalance < (currentWager + MIN_TX_FEE_BUFFER_SOL);
                          if (!hasLowBalance) return null;
                          return (
                            <div className="w-full bg-red-950/40 border border-red-500/30 rounded-xl p-3 flex items-center justify-between gap-3 text-xs font-mono text-red-200">
                              <div className="flex items-center gap-2 text-[11px] leading-tight">
                                <WarningCircle size={16} className="text-primary shrink-0" />
                                <span>
                                  Balance ({solBalance.toFixed(3)} SOL) is below required {(currentWager + MIN_TX_FEE_BUFFER_SOL).toFixed(3)} SOL reserve.
                                </span>
                              </div>
                              <a
                                href={SOLANA_FAUCET_URL}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-2.5 py-1 rounded bg-primary/20 hover:bg-primary/30 border border-primary/40 text-white font-bold text-[11px] flex items-center gap-1 shrink-0 transition-colors"
                              >
                                <span>Faucet</span>
                                <ArrowSquareOut size={12} />
                              </a>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleCreateMatch}
                    disabled={isCreating}
                    className="group relative flex cursor-pointer items-center justify-between w-full rounded-full h-14 pl-8 pr-2 bg-primary hover:bg-red-500 hover-magnetic btn-flashy text-white font-semibold shadow-[0_0_30px_rgba(255,77,77,0.3)] uppercase tracking-widest text-xs disabled:opacity-50 font-sans"
                  >
                    <span>
                      {isCreating ? creationStatus || 'Processing...' : (`Create ${user?.isTestUser ? 'Free' : wagerType} Game`)}
                    </span>
                    <div className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center group-hover:translate-x-1 transition-transform ease-premium">
                      {isCreating ? <CircleNotch size={18} className="animate-spin" /> : <Play size={18} weight="fill" />}
                    </div>
                  </button>
                </div>
              )}

              {/* Waiting for Opponent */}
              {myWaitingGame && !myActiveGame && (
                <div className="flex flex-col items-center gap-6 justify-center w-full z-10 mt-4">
                  <div className="text-white text-sm font-medium bg-black/40 px-6 py-3 rounded-full border border-white/10 flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary animate-ping" />
                    <span>
                      Awaiting opponent... <span className="text-text-muted px-2">|</span> {myWaitingGame.wager > 0 ? <SolAmount amount={myWaitingGame.wager} /> : 'Free'}
                    </span>
                  </div>
                  <div className="flex gap-4">
                    <button
                      onClick={() => navigate(`/game/${myWaitingGame.id}`)}
                      className="group flex items-center justify-between rounded-full h-12 pl-6 pr-2 bg-primary hover:bg-red-500 hover-magnetic btn-flashy text-white font-semibold text-xs uppercase tracking-widest cursor-pointer"
                    >
                      <span className="mr-6">Open Game</span>
                      <div className="w-8 h-8 rounded-full bg-black/20 flex items-center justify-center group-hover:translate-x-0.5 transition-transform">
                        <Play size={14} weight="fill" />
                      </div>
                    </button>
                    <button
                      onClick={() => handleCancelMatch(myWaitingGame.id)}
                      className="group flex items-center justify-between rounded-full h-12 pl-6 pr-2 bg-white/5 hover:bg-white/10 hover-magnetic text-white font-semibold text-xs uppercase tracking-widest border border-white/10 cursor-pointer"
                    >
                      <span className="mr-6">Cancel</span>
                      <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-red-500/20 transition-colors">
                        <X size={14} />
                      </div>
                    </button>
                  </div>
                </div>
              )}

              {/* Active Game */}
              {myActiveGame && (
                <div className="flex flex-col items-center gap-6 justify-center w-full z-10 mt-4">
                  <div className="text-primary text-sm font-medium bg-primary/5 px-6 py-3 rounded-full border border-primary/20 flex items-center gap-3">
                    <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
                    Match is live!
                  </div>
                  <button
                    onClick={() => navigate(`/game/${myActiveGame.id}`)}
                    className="group flex items-center justify-between rounded-full h-14 pl-8 pr-2 bg-primary hover:bg-red-500 hover-magnetic btn-flashy text-white font-semibold text-xs uppercase tracking-widest cursor-pointer shadow-[0_0_30px_rgba(255,77,77,0.3)]"
                  >
                    <span className="mr-8">Resume Game</span>
                    <div className="w-10 h-10 rounded-full bg-black/20 flex items-center justify-center group-hover:translate-x-1 transition-transform ease-premium">
                      <Play size={18} weight="fill" />
                    </div>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Live Games List */}
          <div className="space-y-8 w-full max-w-3xl mx-auto">
            <div className="flex items-end justify-between border-b border-white/10 pb-4">
              <div>
                <h2 className="font-display text-white text-2xl sm:text-3xl font-bold flex items-center gap-3">
                  Live Games
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  </span>
                </h2>
              </div>
              <span className="text-xs sm:text-sm text-text-muted font-mono">
                {loadingGames ? 'Loading...' : `${activeGames.length + availableWaitingGames.length} Open`}
              </span>
            </div>

            {loadingGames ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="double-bezel-outer">
                    <div className="double-bezel-inner p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-6">
                      <div className="flex items-center gap-4 w-full sm:w-auto">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full skeleton-shimmer shrink-0" />
                          <div className="h-4 w-24 skeleton-shimmer" />
                        </div>
                        <span className="text-xs font-mono text-text-muted px-2">VS</span>
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-full skeleton-shimmer shrink-0" />
                          <div className="h-4 w-24 skeleton-shimmer" />
                        </div>
                      </div>
                      <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="h-6 w-16 skeleton-shimmer rounded-full" />
                        <div className="h-10 w-28 skeleton-shimmer rounded-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : [...activeGames, ...availableWaitingGames].length > 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                {[...activeGames, ...availableWaitingGames].map((game, idx) => {
                const isWaiting = game.status === 'waiting' || game.status === 'joining';
                const isMyGame = game.player1 === user?.id;

                const isP1Test = game.player1IsTest || game.player1?.startsWith?.('test_');
                const isP2Test = game.player2IsTest || game.player2?.startsWith?.('test_');

                const p1Label = isP1Test ? (game.player1Name || 'Guest') : `@${game.player1Name || 'Player 1'}`;
                const p2Label = isP2Test ? (game.player2Name || 'Guest') : `@${game.player2Name || 'Player 2'}`;

                return (
                  <motion.div
                    key={game.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: idx * 0.04, ease: [0.32, 0.72, 0, 1] }}
                    className="double-bezel-outer group"
                  >
                    <div className="double-bezel-inner p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-6 hover:bg-[#0c0c0c] transition-colors ease-premium">
                      {/* Players Info */}
                      <div className="flex items-center gap-6 w-full sm:w-auto">
                        
                        {/* Player 1 */}
                        <div
                          onClick={(e) => handlePlayerClick(e, game.player1, isP1Test, `${game.id}-p1`)}
                          className="flex items-center gap-4 cursor-pointer group/p1 hover:opacity-90 transition-all select-none relative"
                        >
                          <div className="w-12 h-12 rounded-full border border-white/10 group-hover/p1:border-primary bg-black overflow-hidden flex items-center justify-center font-bold text-xs text-primary shrink-0 transition-colors">
                            {game.player1Avatar ? (
                              <img src={game.player1Avatar} alt="" className="w-full h-full object-cover" />
                            ) : (
                              game.player1Name ? game.player1Name.substring(0, 2).toUpperCase() : 'P1'
                            )}
                          </div>
                          <span className="text-base text-white font-semibold group-hover/p1:text-primary transition-colors">
                            {p1Label}
                          </span>
                        </div>

                        <span className="text-xs italic font-medium text-text-muted font-mono px-2">VS</span>

                        {/* Player 2 */}
                        <div
                          onClick={(e) => game.player2 && handlePlayerClick(e, game.player2, isP2Test, `${game.id}-p2`)}
                          className={`flex items-center gap-4 ${game.player2 ? 'cursor-pointer group/p2 hover:opacity-90 transition-all select-none relative' : ''}`}
                        >
                          {game.status === 'active' ? (
                            <>
                              <span className="text-base text-white font-semibold group-hover/p2:text-primary transition-colors">
                                {p2Label}
                              </span>
                              <div className="w-12 h-12 rounded-full border border-white/10 group-hover/p2:border-white bg-black overflow-hidden flex items-center justify-center font-bold text-xs text-white shrink-0 transition-colors">
                                {game.player2Avatar ? (
                                  <img src={game.player2Avatar} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  game.player2Name ? game.player2Name.substring(0, 2).toUpperCase() : 'P2'
                                )}
                              </div>
                            </>
                          ) : (
                            <span className="text-sm text-text-muted italic">Awaiting...</span>
                          )}
                        </div>
                      </div>

                      {/* Stakes & Action Buttons */}
                      <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end border-t border-white/5 pt-4 sm:pt-0 sm:border-0 mt-2 sm:mt-0">
                        <div className="text-sm font-mono text-right">
                          {game.wager > 0 ? (
                            <div className="flex items-center gap-2 text-primary">
                              <Coins size={16} />
                              <SolAmount amount={game.wager} className="font-bold text-primary" />
                            </div>
                          ) : (
                            <span className="text-text-muted">Free</span>
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
                          className={`group/btn flex items-center justify-between rounded-full h-10 pl-5 pr-1 text-[10px] font-bold uppercase tracking-widest transition-all ease-premium cursor-pointer hover-magnetic ${
                            game.status === 'active'
                              ? 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
                              : isMyGame
                              ? 'bg-white/5 text-white border border-white/10 hover:bg-white/10'
                              : 'bg-primary hover:bg-red-500 text-white shadow-[0_0_20px_rgba(255,77,77,0.3)] hover:shadow-[0_0_30px_rgba(255,77,77,0.5)] btn-flashy'
                          }`}
                        >
                          <span className="mr-4">{game.status === 'active' ? 'Watch' : isMyGame ? 'Your Game' : 'Join Game'}</span>
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform group-hover/btn:translate-x-0.5 ${game.status === 'active' || isMyGame ? 'bg-white/10' : 'bg-black/20'}`}>
                            <Play size={12} weight="fill" />
                          </div>
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
              </motion.div>
            ) : (
              <div className="text-center text-text-muted text-sm py-20 border border-white/5 rounded-[2rem] bg-black/20 font-mono">
                No active games right now. Create a match above to start playing.
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}
