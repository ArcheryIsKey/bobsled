import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { collection, query, where, onSnapshot, doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useGameStore } from '../store';
import { processImageFile, processBannerFile } from '../utils/image';
import { Camera, Check, Copy, ArrowLeft, Loader2, Trophy, Swords, XCircle, ArrowUpRight, Image as ImageIcon } from 'lucide-react';

export default function Profile() {
  const { userId: paramUserId } = useParams<{ userId?: string }>();
  const navigate = useNavigate();
  const { user: currentUser, solBalance } = useGameStore();

  const isOwnProfile = !paramUserId || paramUserId === currentUser?.id;
  const targetUserId = paramUserId || currentUser?.id;

  const [profileData, setProfileData] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

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
          if (docSnap.exists()) {
            setProfileData({ id: docSnap.id, ...docSnap.data() });
          } else {
            setProfileData(null);
          }
        } catch (e) {
          console.error('Error fetching profile:', e);
        } finally {
          setIsLoading(false);
        }
      };
      fetchTargetProfile();
    }
  }, [targetUserId, isOwnProfile, currentUser]);

  // Keep own profile updated when currentUser store updates
  useEffect(() => {
    if (isOwnProfile && currentUser) {
      setProfileData(currentUser);
    }
  }, [currentUser, isOwnProfile]);

  // Fetch match history for this user
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
    const file = e.target.files?.[0];
    if (!file || !currentUser?.id || !isOwnProfile) return;

    setIsUploadingAvatar(true);
    try {
      const dataUrl = await processImageFile(file, 256, 0.8);
      await updateDoc(doc(db, 'users', currentUser.id), {
        avatarUrl: dataUrl,
      });
    } catch (err) {
      console.error('Failed to upload avatar:', err);
      alert('Failed to process image. Please try a standard image file.');
    } finally {
      setIsUploadingAvatar(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  const handleBannerSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        <button
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-surface-container border border-white/10 rounded-md text-sm hover:border-velocity-red transition-colors"
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

  const walletDisplay = profileData.walletAddress
    ? `${profileData.walletAddress.substring(0, 6)}...${profileData.walletAddress.substring(profileData.walletAddress.length - 6)}`
    : 'No Wallet Connected';

  return (
    <div className="bg-background text-text-primary min-h-[calc(100vh-64px)] flex flex-col font-body-md antialiased w-full overflow-y-auto">
      {/* Hidden File Inputs */}
      {isOwnProfile && (
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

      <main className="flex-1 w-full max-w-5xl mx-auto px-4 md:px-8 py-8 md:py-10">
        
        {/* Top Back Link */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-xs text-text-secondary hover:text-text-primary transition-colors py-2 px-3 rounded-md bg-surface-base border border-white/10 hover:border-velocity-red"
          >
            <ArrowLeft size={14} /> Back to Lobby
          </button>
        </div>

        {/* Profile Card with Banner */}
        <section className="mb-10 rounded-xl bg-surface-base border border-white/10 overflow-hidden shadow-2xl relative">
          
          {/* Banner Container */}
          <div className="relative w-full h-40 sm:h-52 md:h-60 bg-gradient-to-r from-surface-elevated via-surface-container to-surface-base border-b border-white/10 overflow-hidden group">
            {profileData.bannerUrl ? (
              <img src={profileData.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_#262626_0%,_#121212_100%)]">
                <div className="w-96 h-96 bg-velocity-red/5 rounded-full blur-3xl pointer-events-none" />
              </div>
            )}

            {/* Banner edit button for own profile */}
            {isOwnProfile && (
              <button
                onClick={() => bannerInputRef.current?.click()}
                disabled={isUploadingBanner}
                className="absolute top-3 right-3 bg-black/70 hover:bg-black/90 border border-white/15 text-white text-xs px-3 py-1.5 rounded-md flex items-center gap-1.5 transition-all opacity-90 backdrop-blur-sm shadow-md"
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

          {/* Profile Header Content: Avatar overlapping cleanly without covering text */}
          <div className="px-6 md:px-8 pb-6 md:pb-8 pt-0 relative z-10">
            
            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-5 text-center sm:text-left">
              
              {/* Avatar (with only the avatar container having the negative top margin) */}
              <div
                onClick={() => isOwnProfile && avatarInputRef.current?.click()}
                className={`-mt-14 sm:-mt-16 w-24 h-24 sm:w-28 sm:h-28 rounded-xl overflow-hidden border-4 border-[#121212] bg-surface-elevated relative group shrink-0 shadow-2xl ${
                  isOwnProfile ? 'cursor-pointer hover:border-velocity-red transition-all' : ''
                }`}
                title={isOwnProfile ? 'Click to change profile picture' : ''}
              >
                {profileData.avatarUrl ? (
                  <img
                    src={profileData.avatarUrl}
                    alt={profileData.username}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full bg-surface-container-high flex items-center justify-center">
                    <span className="text-3xl sm:text-4xl font-headline-lg font-bold text-text-primary">
                      {profileData.username ? profileData.username.substring(0, 2).toUpperCase() : 'U'}
                    </span>
                  </div>
                )}

                {/* Avatar hover camera overlay (own profile only) */}
                {isOwnProfile && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px]">
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

              {/* Names & Wallet — Positioned cleanly below banner */}
              <div className="space-y-1 pt-2 sm:pt-4">
                <h1 className="font-headline-lg text-2xl sm:text-3xl md:text-4xl text-text-primary font-bold tracking-tight">
                  {profileData.username}
                </h1>

                {profileData.walletAddress && (
                  <div className="flex items-center justify-center sm:justify-start gap-2">
                    <button
                      onClick={handleCopyWallet}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-surface-container/80 border border-white/10 hover:border-velocity-red text-xs text-text-secondary hover:text-text-primary font-mono transition-colors"
                      title="Copy wallet address"
                    >
                      <span>{walletDisplay}</span>
                      {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                    </button>
                    {copied && (
                      <span className="text-xs text-green-400 font-mono">Copied!</span>
                    )}
                  </div>
                )}
              </div>
            </div>

          </div>
        </section>

        {/* Stats Grid (4 Cards) */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          
          {/* Card 1: Matches */}
          <div className="bg-surface-base border border-white/10 p-5 rounded-lg relative overflow-hidden group hover:bg-surface-elevated transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs text-text-secondary font-medium uppercase tracking-wider">Matches</span>
              <Swords size={16} className="text-text-muted group-hover:text-velocity-red transition-colors" />
            </div>
            <div className="font-headline-lg text-2xl md:text-3xl text-text-primary font-bold mb-0.5">
              {totalGames}
            </div>
            <div className="text-xs text-text-muted">
              Total games played
            </div>
          </div>

          {/* Card 2: Wins */}
          <div className="bg-surface-base border border-white/10 p-5 rounded-lg relative overflow-hidden group hover:bg-surface-elevated transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs text-text-secondary font-medium uppercase tracking-wider">Wins</span>
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
          <div className="bg-surface-base border border-white/10 p-5 rounded-lg relative overflow-hidden group hover:bg-surface-elevated transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs text-text-secondary font-medium uppercase tracking-wider">Losses</span>
              <XCircle size={16} className="text-text-muted group-hover:text-text-secondary transition-colors" />
            </div>
            <div className="font-headline-lg text-2xl md:text-3xl text-text-primary font-bold mb-0.5 text-text-secondary">
              {losses}
            </div>
            <div className="text-xs text-text-muted">
              {lossRate}% loss rate
            </div>
          </div>

          {/* Card 4: SOL Holdings */}
          <div className="bg-surface-base border border-white/10 p-5 rounded-lg relative overflow-hidden group hover:bg-surface-elevated transition-colors">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs text-text-secondary font-medium uppercase tracking-wider">SOL Balance</span>
              <span className="text-xs font-mono font-bold text-velocity-red">SOL</span>
            </div>
            <div className="font-headline-lg text-2xl md:text-3xl text-text-primary font-bold mb-0.5 font-mono">
              {isOwnProfile && solBalance !== null ? `${solBalance.toFixed(3)}` : '—'}
            </div>
            <div className="text-xs text-text-muted">
              {isOwnProfile ? 'In connected wallet' : 'Solana network'}
            </div>
          </div>
        </section>

        {/* Match History Table */}
        <section>
          <div className="flex justify-between items-center mb-4 border-b border-white/10 pb-3">
            <h2 className="font-headline-lg text-xl text-text-primary font-bold">
              Match History
            </h2>
            <span className="text-xs text-text-muted">
              {history.length} Matches
            </span>
          </div>

          <div className="bg-surface-base border border-white/10 rounded-lg overflow-hidden shadow-xl">
            {history.length === 0 ? (
              <div className="p-10 text-center text-text-muted text-sm">
                No match history recorded yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-elevated/80 border-b border-white/10">
                      <th className="py-3 px-5 text-xs text-text-secondary font-medium uppercase tracking-wider">Match</th>
                      <th className="py-3 px-5 text-xs text-text-secondary font-medium uppercase tracking-wider">Opponent</th>
                      <th className="py-3 px-5 text-xs text-text-secondary font-medium uppercase tracking-wider">Date</th>
                      <th className="py-3 px-5 text-xs text-text-secondary font-medium uppercase tracking-wider">Result</th>
                      <th className="py-3 px-5 text-xs text-text-secondary font-medium uppercase tracking-wider text-right">Stakes</th>
                      <th className="py-3 px-5 text-xs text-text-secondary font-medium uppercase tracking-wider text-right">View</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm divide-y divide-white/5 font-body-sm">
                    {history.map((game) => {
                      const isWin = game.winner === targetUserId;
                      const isDraw = game.winner === 'draw';
                      const opponentId = game.player1 === targetUserId ? game.player2 : game.player1;
                      const opponentName = game.player1 === targetUserId ? game.player2Name : game.player1Name;
                      const opponentDisplay = opponentName || 'Opponent';
                      const matchDate = game.createdAt?.toDate
                        ? game.createdAt.toDate().toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })
                        : 'Recent';

                      return (
                        <tr key={game.id} className="hover:bg-surface-elevated/40 transition-colors">
                          <td className="py-3.5 px-5 text-xs text-text-secondary font-mono">
                            #{game.id.substring(0, 8).toUpperCase()}
                          </td>
                          <td className="py-3.5 px-5">
                            {opponentId ? (
                              <Link
                                to={`/profile/${opponentId}`}
                                className="text-text-primary hover:text-velocity-red font-medium transition-colors"
                              >
                                {opponentDisplay}
                              </Link>
                            ) : (
                              <span className="text-text-muted">{opponentDisplay}</span>
                            )}
                          </td>
                          <td className="py-3.5 px-5 text-text-muted text-xs font-mono">
                            {matchDate}
                          </td>
                          <td className="py-3.5 px-5">
                            {isWin ? (
                              <span className="bg-velocity-red/10 text-velocity-red border border-velocity-red/30 px-2 py-0.5 rounded text-[11px] font-semibold uppercase">
                                Win
                              </span>
                            ) : isDraw ? (
                              <span className="bg-surface-variant text-text-secondary border border-white/10 px-2 py-0.5 rounded text-[11px] font-semibold uppercase">
                                Draw
                              </span>
                            ) : (
                              <span className="bg-surface-container-highest text-text-muted border border-white/10 px-2 py-0.5 rounded text-[11px] font-semibold uppercase">
                                Loss
                              </span>
                            )}
                          </td>
                          <td className={`py-3.5 px-5 text-right font-mono text-xs ${isWin ? 'text-velocity-red font-bold' : 'text-text-muted'}`}>
                            {game.wager > 0 ? `${isWin ? '+' : '-'}${game.wager} ${game.wagerCurrency}` : 'Free'}
                          </td>
                          <td className="py-3.5 px-5 text-right">
                            <button
                              onClick={() => navigate(`/game/${game.id}`)}
                              className="inline-flex items-center gap-1 text-xs text-text-secondary hover:text-velocity-red transition-colors px-2.5 py-1 rounded bg-surface-container hover:bg-surface-elevated border border-white/10"
                            >
                              Watch <ArrowUpRight size={12} />
                            </button>
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
