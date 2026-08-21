import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useGameStore } from '../store';
import { processImageFile, processBannerFile } from '../utils/image';
import UserProfileModal from './UserProfileModal';
import SolAmount from './SolAmount';
import { OWNER_WALLET } from '../constants';
import { logError } from '../utils/logger';
import { Camera, Check, Copy, ArrowLeft, Loader2, Trophy, Swords, XCircle, Image as ImageIcon, FlaskConical, Crown, ShieldCheck } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';


export default function Profile() {
  const { userId: paramUserId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const { user: currentUser, solBalance } = useGameStore();

  const isOwnProfile = !paramUserId || paramUserId === currentUser?.id;
  const targetUserId = paramUserId || currentUser?.id;
  const isTestUser = (isOwnProfile && currentUser?.isTestUser) || targetUserId?.startsWith('test_');

  const [profileData, setProfileData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [testUserToast, setTestUserToast] = useState<{ matchId: string; message: string } | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  // Fetch profile user document
  useEffect(() => {
    if (!targetUserId) {
      setIsLoading(false);
      return;
    }

    if (isOwnProfile && currentUser) {
      setProfileData(currentUser);
      setIsLoading(false);
    } else {
      const fetchTargetProfile = async () => {
        setIsLoading(true);
        try {
          const docSnap = await getDoc(doc(db, 'users', targetUserId));
          if (docSnap.exists() && docSnap.data()?.walletAddress) {
            setProfileData({ id: docSnap.id, ...docSnap.data() });
          } else {
            setProfileData(null);
          }
        } catch (e) {
          logError('Error fetching profile:', e);
        } finally {
          setIsLoading(false);
        }
      };
      fetchTargetProfile();
    }
  }, [targetUserId, isOwnProfile, currentUser]);

  useEffect(() => {
    if (isOwnProfile && currentUser) {
      setProfileData(currentUser);
    }
  }, [currentUser, isOwnProfile]);

  useEffect(() => {
    if (!targetUserId) return;

    const q = query(
      collection(db, 'games'),
      where('players', 'array-contains', targetUserId),
      where('status', '==', 'finished')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      let games = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      games.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setHistory(games);
    });

    return () => unsub();
  }, [targetUserId]);

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isTestUser) return;
    const file = e.target.files?.[0];
    if (!file || !currentUser?.id || !isOwnProfile) return;

    setIsUploadingAvatar(true);
    try {
      const dataUrl = await processImageFile(file, 256, 0.8);
      await updateDoc(doc(db, 'users', currentUser.id), {
        avatarUrl: dataUrl,
      });
    } catch (err) {
      logError('Failed to upload avatar:', err);
      alert('Failed to process image. Please try a standard image file.');
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleBannerSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isTestUser) return;
    const file = e.target.files?.[0];
    if (!file || !currentUser?.id || !isOwnProfile) return;

    setIsUploadingBanner(true);
    try {
      const dataUrl = await processBannerFile(file, 1000, 300, 0.8);
      await updateDoc(doc(db, 'users', currentUser.id), {
        bannerUrl: dataUrl,
      });
    } catch (err) {
      console.error('Failed to upload banner:', err);
      alert('Failed to process banner image. Please try a standard image file.');
    } finally {
      setIsUploadingBanner(false);
      if (bannerInputRef.current) bannerInputRef.current.value = '';
    }
  };

  const handleCopyWallet = () => {
    const wallet = profileData?.walletAddress;
    if (!wallet) return;
    navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpponentClick = async (e: React.MouseEvent, oppId: string | null, game: any) => {
    e.stopPropagation();
    const isOppP1 = game.player1 !== targetUserId;
    const isOppTest = (isOppP1 ? game.player1IsTest : game.player2IsTest) || !oppId || oppId.startsWith('test_');

    if (isOppTest) {
      setTestUserToast({ matchId: game.id, message: 'Guest User (Temporary Account)' });
      setTimeout(() => {
        setTestUserToast((prev) => (prev?.matchId === game.id ? null : prev));
      }, 2500);
      return;
    }

    try {
      const oppDoc = await getDoc(doc(db, 'users', oppId));
      if (!oppDoc.exists() || oppDoc.data()?.isTestUser || !oppDoc.data()?.walletAddress) {
        setTestUserToast({ matchId: game.id, message: 'Guest User (Temporary Account)' });
        setTimeout(() => {
          setTestUserToast((prev) => (prev?.matchId === game.id ? null : prev));
        }, 2500);
        return;
      }
    } catch {
      // ignore
    }

    setSelectedProfileId(oppId);
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-velocity-red" size={32} />
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <h2 className="text-xl font-bold text-white">User not found</h2>
        <p className="text-xs text-text-muted">This profile does not exist or was a temporary guest session.</p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2 bg-[#141414] border border-white/10 rounded-full text-xs font-semibold hover:border-velocity-red transition-colors cursor-pointer"
        >
          Back to Lobby
        </button>
      </div>
    );
  }

  const totalGames = history.length;
  const wins = history.filter((g) => g.winner === targetUserId).length;
  const losses = history.filter((g) => g.winner && g.winner !== targetUserId && g.winner !== 'draw').length;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const lossRate = totalGames > 0 ? Math.round((losses / totalGames) * 100) : 0;

  const isOwner = profileData.walletAddress === OWNER_WALLET;
  const isAdmin = isOwner || profileData.isAdmin || profileData.role === 'admin';

  const userDisplayName = isTestUser
    ? (profileData.username || 'Guest Player')
    : `@${profileData.username || 'Player'}`;

  const walletDisplay = profileData.walletAddress
    ? `${profileData.walletAddress.substring(0, 6)}...${profileData.walletAddress.substring(profileData.walletAddress.length - 6)}`
    : 'No Wallet Connected';

  return (
    <div className="bg-[#0e0e0e] text-text-primary min-h-[calc(100vh-64px)] flex flex-col font-body-md antialiased w-full overflow-y-auto">
      
      {/* Floating User Profile Modal for inspected opponents */}
      {selectedProfileId && (
        <UserProfileModal
          userId={selectedProfileId}
          onClose={() => setSelectedProfileId(null)}
        />
      )}

      {/* Hidden File Inputs */}
      {isOwnProfile && !isTestUser && (
        <>
          <input
            type="file"
            ref={avatarInputRef}
            onChange={handleAvatarSelect}
            accept="image/*"
            className="hidden"
          />
          <input
            type="file"
            ref={bannerInputRef}
            onChange={handleBannerSelect}
            accept="image/*"
            className="hidden"
          />
        </>
      )}

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-8">
        
        {/* Top Back Link */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-xs text-text-secondary hover:text-white transition-colors py-2 px-3.5 rounded-full bg-[#141414] border border-white/10 hover:border-velocity-red cursor-pointer"
          >
            <ArrowLeft size={14} /> Back to Lobby
          </button>
        </div>

        {/* Profile Card with Banner */}
        <section className="mb-5 rounded-2xl bg-[#141414] border border-white/10 overflow-hidden shadow-2xl relative">
          
          {/* Banner Container: Natural aspect ratio with black background (no stretch) */}
          <div className="relative w-full h-36 sm:h-44 md:h-48 bg-black border-b border-white/10 overflow-hidden group flex items-center justify-center">
            {profileData.bannerUrl ? (
              <img
                src={profileData.bannerUrl}
                alt="Banner"
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_#262626_0%,_#0a0a0a_100%)]">
                <div className="w-96 h-96 bg-velocity-red/5 rounded-full blur-3xl pointer-events-none" />
              </div>
            )}

            {/* Banner edit button for own profile */}
            {isOwnProfile && !isTestUser && (
              <button
                onClick={() => bannerInputRef.current?.click()}
                disabled={isUploadingBanner}
                className="absolute top-3 right-3 bg-black/80 hover:bg-black border border-white/15 text-white text-xs px-3.5 py-1.5 rounded-full flex items-center gap-1.5 transition-all opacity-90 backdrop-blur-md shadow-md cursor-pointer"
              >
                {isUploadingBanner ? (
                  <Loader2 size={13} className="animate-spin text-velocity-red" />
                ) : (
                  <ImageIcon size={13} />
                )}
                <span>Change Banner</span>
              </button>
            )}
          </div>

          {/* Profile Header Content */}
          <div className="px-6 md:px-8 pb-4 pt-0 relative z-10">
            
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 text-center sm:text-left">
              
              {/* Avatar */}
              <div
                onClick={() => isOwnProfile && !isTestUser && avatarInputRef.current?.click()}
                className={`-mt-12 sm:-mt-14 w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-4 border-[#141414] bg-surface-elevated relative group shrink-0 shadow-2xl ${
                  isOwnProfile && !isTestUser ? 'cursor-pointer hover:border-velocity-red transition-all' : ''
                }`}
                title={isOwnProfile && !isTestUser ? 'Click to change profile picture' : ''}
              >
                {profileData.avatarUrl ? (
                  <img
                    src={profileData.avatarUrl}
                    alt={profileData.username}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-[#1e1e1e] flex items-center justify-center">
                    <span className="text-3xl sm:text-4xl font-headline-lg font-bold text-white">
                      {profileData.username ? profileData.username.substring(0, 2).toUpperCase() : 'U'}
                    </span>
                  </div>
                )}

                {/* Avatar hover camera overlay */}
                {isOwnProfile && !isTestUser && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px] cursor-pointer">
                    {isUploadingAvatar ? (
                      <Loader2 size={20} className="animate-spin text-velocity-red" />
                    ) : (
                      <>
                        <Camera size={18} className="text-white mb-0.5" />
                        <span className="text-[10px] text-white font-medium">Edit</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Names & Role Badges */}
              <div className="space-y-1 pt-1 sm:pt-2">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h1 className="font-headline-lg text-2xl sm:text-3xl md:text-4xl text-white font-bold tracking-tight">
                    {userDisplayName}
                  </h1>
                  {isOwner && (
                    <span className="text-[11px] font-mono text-amber-400 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center gap-1 font-bold">
                      <Crown size={12} />
                      <span>Owner</span>
                    </span>
                  )}
                  {isAdmin && !isOwner && (
                    <span className="text-[11px] font-mono text-velocity-red px-2.5 py-0.5 rounded-full bg-velocity-red/10 border border-velocity-red/30 flex items-center gap-1 font-bold">
                      <ShieldCheck size={12} />
                      <span>Admin</span>
                    </span>
                  )}
                  {isTestUser && (
                    <span className="text-[11px] font-mono text-velocity-red px-2.5 py-0.5 rounded-full bg-velocity-red/10 border border-velocity-red/30 flex items-center gap-1 font-bold">
                      <FlaskConical size={11} />
                      <span>Guest Mode</span>
                    </span>
                  )}
                </div>

                {profileData.walletAddress && (
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <button
                      onClick={handleCopyWallet}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#0e0e0e] border border-white/10 hover:border-velocity-red text-xs text-text-secondary hover:text-white font-mono transition-colors cursor-pointer"
                      title="Copy wallet address"
                    >
                      <span>{walletDisplay}</span>
                      {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    </button>
                    {copied && (
                      <span className="text-xs text-emerald-400 font-mono">Copied!</span>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        </section>

        {/* Stats Grid */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          
          {/* Card 1: Matches */}
          <div className="bg-[#141414] border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs text-text-secondary font-medium uppercase tracking-wider font-mono">Matches</span>
              <Swords size={16} className="text-text-muted group-hover:text-velocity-red transition-colors" />
            </div>
            <div className="font-headline-lg text-2xl md:text-3xl text-white font-bold mb-0.5">
              {totalGames}
            </div>
            <div className="text-xs text-text-muted">
              Total games played
            </div>
          </div>

          {/* Card 2: Wins */}
          <div className="bg-[#141414] border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs text-text-secondary font-medium uppercase tracking-wider font-mono">Wins</span>
              <Trophy size={16} className="text-velocity-red transition-colors" />
            </div>
            <div className="font-headline-lg text-2xl md:text-3xl text-velocity-red font-bold mb-0.5">
              {wins}
            </div>
            <div className="text-xs text-velocity-red font-medium">
              {winRate}% win rate
            </div>
          </div>

          {/* Card 3: Losses */}
          <div className="bg-[#141414] border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs text-text-secondary font-medium uppercase tracking-wider font-mono">Losses</span>
              <XCircle size={16} className="text-text-muted group-hover:text-text-secondary transition-colors" />
            </div>
            <div className="font-headline-lg text-2xl md:text-3xl text-white font-bold mb-0.5 text-text-secondary">
              {losses}
            </div>
            <div className="text-xs text-text-muted">
              {lossRate}% loss rate
            </div>
          </div>

          {/* Card 4: SOL Holdings */}
          <div className="bg-[#141414] border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs text-text-secondary font-medium uppercase tracking-wider font-mono">SOL Balance</span>
              <span className="text-xs font-mono font-bold text-velocity-red">SOL</span>
            </div>
            <div className="font-headline-lg text-2xl md:text-3xl text-white font-bold mb-0.5 font-mono">
              {isOwnProfile && solBalance !== null ? (
                <SolAmount amount={parseFloat(solBalance.toFixed(3))} suffix="" />
              ) : isTestUser ? (
                '—'
              ) : (
                '0.000'
              )}
            </div>
            <div className="text-xs text-text-muted">
              {isOwnProfile ? 'In connected wallet' : 'Solana network'}
            </div>
          </div>
        </section>

        {/* Match History Table */}
        <section>
          <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
            <h2 className="font-headline-lg text-xl text-white font-bold">
              Match History
            </h2>
            <span className="text-xs text-text-muted font-mono">
              {history.length} Matches
            </span>
          </div>

          <div className="bg-[#141414] border border-white/10 rounded-2xl overflow-hidden shadow-xl">
            {history.length === 0 ? (
              <div className="p-10 text-center text-text-muted text-sm font-mono">
                No match history recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#181818] border-b border-white/10">
                      <th className="py-3 px-5 text-xs text-text-secondary font-medium uppercase tracking-wider font-mono">Match ID</th>
                      <th className="py-3 px-5 text-xs text-text-secondary font-medium uppercase tracking-wider font-mono">Opponent</th>
                      <th className="py-3 px-5 text-xs text-text-secondary font-medium uppercase tracking-wider font-mono">Date</th>
                      <th className="py-3 px-5 text-xs text-text-secondary font-medium uppercase tracking-wider font-mono">Result</th>
                      <th className="py-3 px-5 text-xs text-text-secondary font-medium uppercase tracking-wider text-right font-mono">Stakes</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-white/5 font-body-sm">
                    {history.map((game) => {
                      const isWin = game.winner === targetUserId;
                      const isDraw = game.winner === 'draw';
                      const opponentId = game.player1 === targetUserId ? game.player2 : game.player1;
                      const opponentName = game.player1 === targetUserId ? game.player2Name : game.player1Name;
                      const isOppP1 = game.player1 !== targetUserId;
                      const isOppTest = (isOppP1 ? game.player1IsTest : game.player2IsTest) || opponentId?.startsWith('test_');
                      const opponentDisplay = isOppTest ? (opponentName || 'Guest') : `@${opponentName || 'Opponent'}`;
                      const matchDate = game.createdAt?.toDate
                        ? game.createdAt.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                        : 'Recent';

                      return (
                        <tr key={game.id} className="hover:bg-[#1c1c1c] transition-colors">
                          <td className="py-3.5 px-5 text-xs text-text-secondary font-mono">
                            #{game.id.substring(0, 8).toUpperCase()}
                          </td>
                          <td className="py-3.5 px-5 relative">
                            {/* Small fading popup for test user click */}
                            <AnimatePresence>
                              {testUserToast?.matchId === game.id && (
                                <motion.div
                                  initial={{ opacity: 0, y: 6, scale: 0.95 }}
                                  animate={{ opacity: 1, y: -4, scale: 1 }}
                                  exit={{ opacity: 0, y: -4, scale: 0.95 }}
                                  className="absolute -top-7 left-4 z-30 px-3 py-1 bg-black/95 text-velocity-red border border-velocity-red/40 rounded-full text-[10px] font-mono font-bold shadow-lg flex items-center gap-1.5 pointer-events-none whitespace-nowrap"
                                >
                                  <FlaskConical size={11} className="shrink-0" />
                                  <span>{testUserToast.message}</span>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            <button
                              onClick={(e) => handleOpponentClick(e, opponentId, game)}
                              className="text-white hover:text-velocity-red font-medium transition-colors cursor-pointer text-left flex items-center gap-1.5"
                            >
                              <span>{opponentDisplay}</span>
                            </button>
                          </td>
                          <td className="py-3.5 px-5 text-text-muted text-xs font-mono">
                            {matchDate}
                          </td>
                          <td className="py-3.5 px-5">
                            {isWin ? (
                              <span className="bg-velocity-red/10 text-velocity-red border border-velocity-red/30 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase font-mono">
                                Win
                              </span>
                            ) : isDraw ? (
                              <span className="bg-[#222] text-text-secondary border border-white/10 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase font-mono">
                                Draw
                              </span>
                            ) : (
                              <span className="bg-[#1e1e1e] text-text-muted border border-white/10 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase font-mono">
                                Loss
                              </span>
                            )}
                          </td>
                          <td className={`py-3.5 px-5 text-right font-mono text-xs ${isWin ? 'text-velocity-red font-bold' : 'text-text-muted'}`}>
                            {game.wager > 0 ? (
                              <SolAmount
                                amount={game.wager}
                                prefix={isWin ? '+' : '-'}
                                className={isWin ? 'text-velocity-red font-bold' : 'text-text-muted'}
                              />
                            ) : (
                              'Free'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
