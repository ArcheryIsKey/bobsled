import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useGameStore } from '../store';
import { processImageFile } from '../utils/image';
import { Camera, Check, Copy, ArrowLeft, Loader2, Trophy, DollarSign, Swords, XCircle, ArrowUpRight } from 'lucide-react';

export default function Profile() {
  const { user, setCurrentView, setCurrentGameId, setSpectatingGameId } = useGameStore();
  const [history, setHistory] = useState<any[]>([]);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user?.id) return;

    const q = query(
      collection(db, 'games'),
      where('players', 'array-contains', user.id),
      where('status', '==', 'finished')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      let games = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      games.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setHistory(games);
    });

    return () => unsub();
  }, [user?.id]);

  const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user?.id) return;

    setIsUploadingAvatar(true);
    try {
      const dataUrl = await processImageFile(file, 256, 0.85);
      await updateDoc(doc(db, 'users', user.id), {
        avatarUrl: dataUrl,
      });
    } catch (err) {
      console.error('Failed to upload avatar:', err);
      alert('Failed to process image. Please try a smaller file.');
    } finally {
      setIsUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCopyWallet = () => {
    if (!user?.walletAddress) return;
    navigator.clipboard.writeText(user.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!user) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-velocity-red" size={32} />
      </div>
    );
  }

  const totalGames = history.length;
  const wins = history.filter((g) => g.winner === user.id).length;
  const losses = history.filter((g) => g.winner && g.winner !== user.id && g.winner !== 'draw').length;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const lossRate = totalGames > 0 ? Math.round((losses / totalGames) * 100) : 0;

  const displayBalance = user.isTestUser
    ? `${user.testSolBalance ?? 1} SOL (Test)`
    : user.testSolBalance !== undefined
    ? `${user.testSolBalance} SOL`
    : `${user.freeTokens ?? 10} FREE`;

  const walletDisplay = user.walletAddress
    ? `${user.walletAddress.substring(0, 6)}...${user.walletAddress.substring(user.walletAddress.length - 6)}`
    : 'Anonymous Pilot';

  return (
    <div className="bg-background text-text-primary min-h-screen flex flex-col font-body-md antialiased selection:bg-velocity-red selection:text-text-primary w-full overflow-y-auto">
      {/* Hidden File Input for Avatar */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleAvatarSelect}
        accept="image/*"
        className="hidden"
      />

      <main className="flex-1 w-full max-w-max-width mx-auto px-margin-mobile md:px-margin-desktop py-8 md:py-12">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={() => setCurrentView('lobby')}
            className="flex items-center gap-2 font-label-caps text-xs text-text-secondary hover:text-text-primary transition-colors py-2 px-3 rounded bg-surface-base border border-glass-border hover:border-velocity-red"
          >
            <ArrowLeft size={14} /> Back to Lobby
          </button>

          <span className="font-label-caps text-xs text-text-muted uppercase tracking-widest">
            Pilot Dossier
          </span>
        </div>

        {/* Profile Header Section */}
        <section className="mb-10 p-6 md:p-8 rounded-xl bg-surface-base border border-glass-border flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-80 h-80 bg-velocity-red/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row items-center sm:items-center gap-6 z-10 w-full sm:w-auto text-center sm:text-left">
            {/* Avatar with click to edit */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden border-2 border-glass-border hover:border-velocity-red relative group cursor-pointer shrink-0 transition-all duration-300 shadow-xl bg-surface-elevated"
              title="Click to change profile picture"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.username}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              ) : (
                <div className="w-full h-full bg-surface-container-high flex items-center justify-center">
                  <span className="text-3xl sm:text-4xl font-display-lg font-bold text-text-primary">
                    {user.username ? user.username.substring(0, 2).toUpperCase() : 'P1'}
                  </span>
                </div>
              )}

              {/* Hover overlay with Camera/Edit icon */}
              <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-[2px]">
                {isUploadingAvatar ? (
                  <Loader2 size={24} className="animate-spin text-velocity-red" />
                ) : (
                  <>
                    <Camera size={22} className="text-white mb-1" />
                    <span className="font-label-caps text-[9px] uppercase tracking-wider text-white">Change</span>
                  </>
                )}
              </div>
            </div>

            {/* Profile Info */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                <h1 className="font-display-lg text-3xl sm:text-4xl md:text-5xl text-text-primary font-bold tracking-tight">
                  {user.username}
                </h1>
                <span className="bg-velocity-red/10 text-velocity-red border border-velocity-red/30 px-3 py-1 rounded font-label-caps text-xs font-bold">
                  ELO {user.elo ?? 1000}
                </span>
                {user.isTestUser && (
                  <span className="bg-surface-variant text-text-muted border border-glass-border px-2 py-0.5 rounded font-label-caps text-[10px]">
                    TEST PILOT
                  </span>
                )}
              </div>

              {/* Wallet Pill */}
              {user.walletAddress && (
                <div className="flex items-center justify-center sm:justify-start gap-2">
                  <button
                    onClick={handleCopyWallet}
                    className="flex items-center gap-2 px-3 py-1 rounded bg-surface-container border border-glass-border hover:border-velocity-red font-label-caps text-xs text-text-secondary hover:text-text-primary transition-colors"
                  >
                    <span>{walletDisplay}</span>
                    {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
                  </button>
                  {copied && (
                    <span className="text-xs text-green-400 font-label-caps animate-fade-in">Copied!</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex flex-wrap sm:flex-nowrap gap-3 w-full md:w-auto z-10">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingAvatar}
              className="flex-1 md:flex-none border border-glass-border bg-surface-container hover:bg-surface-elevated text-text-primary hover:border-velocity-red px-5 py-2.5 rounded font-label-caps text-xs uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
            >
              <Camera size={14} />
              {isUploadingAvatar ? 'Updating...' : 'Change Picture'}
            </button>
          </div>
        </section>

        {/* Stats Bento Grid (4 Cards) */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-gutter mb-12">
          {/* Card 1: Balance */}
          <div className="bg-surface-base border border-glass-border p-6 rounded-lg relative overflow-hidden group hover:bg-surface-elevated transition-colors">
            <div className="absolute top-0 left-0 w-full h-1 bg-velocity-red opacity-50 group-hover:opacity-100 transition-opacity" />
            <div className="flex justify-between items-start mb-4">
              <span className="font-label-caps text-xs text-text-secondary uppercase tracking-wider">Account Balance</span>
              <DollarSign size={18} className="text-text-muted group-hover:text-velocity-red transition-colors" />
            </div>
            <div className="font-headline-lg text-2xl sm:text-3xl text-text-primary font-bold mb-1">
              {displayBalance}
            </div>
            <div className="font-body-sm text-xs text-text-muted">
              Live Arena Funds
            </div>
          </div>

          {/* Card 2: Total Matches */}
          <div className="bg-surface-base border border-glass-border p-6 rounded-lg relative overflow-hidden group hover:bg-surface-elevated transition-colors">
            <div className="flex justify-between items-start mb-4">
              <span className="font-label-caps text-xs text-text-secondary uppercase tracking-wider">Total Matches</span>
              <Swords size={18} className="text-text-muted group-hover:text-velocity-red transition-colors" />
            </div>
            <div className="font-headline-lg text-2xl sm:text-3xl text-text-primary font-bold mb-1">
              {totalGames}
            </div>
            <div className="font-body-sm text-xs text-text-muted">
              Lifetime Engagements
            </div>
          </div>

          {/* Card 3: Wins & Win Rate */}
          <div className="bg-surface-base border border-glass-border p-6 rounded-lg relative overflow-hidden group hover:bg-surface-elevated transition-colors">
            <div className="flex justify-between items-start mb-4">
              <span className="font-label-caps text-xs text-text-secondary uppercase tracking-wider">Victories</span>
              <Trophy size={18} className="text-text-muted group-hover:text-velocity-red transition-colors" />
            </div>
            <div className="font-headline-lg text-2xl sm:text-3xl text-velocity-red font-bold mb-1">
              {wins}
            </div>
            <div className="font-body-sm text-xs text-velocity-red font-medium">
              {winRate}% Win Rate
            </div>
          </div>

          {/* Card 4: Losses & Loss Rate */}
          <div className="bg-surface-base border border-glass-border p-6 rounded-lg relative overflow-hidden group hover:bg-surface-elevated transition-colors">
            <div className="flex justify-between items-start mb-4">
              <span className="font-label-caps text-xs text-text-secondary uppercase tracking-wider">Defeats</span>
              <XCircle size={18} className="text-text-muted group-hover:text-text-secondary transition-colors" />
            </div>
            <div className="font-headline-lg text-2xl sm:text-3xl text-text-primary font-bold mb-1 text-text-muted">
              {losses}
            </div>
            <div className="font-body-sm text-xs text-text-muted">
              {lossRate}% Loss Rate
            </div>
          </div>
        </section>

        {/* Recent Activity Section */}
        <section>
          <div className="flex justify-between items-center mb-6 border-b border-glass-border pb-4">
            <h2 className="font-headline-lg text-xl sm:text-2xl text-text-primary font-bold">
              Combat Record
            </h2>
            <span className="font-label-caps text-xs text-text-muted">
              {history.length} Matches Recorded
            </span>
          </div>

          <div className="bg-surface-base border border-glass-border rounded-lg overflow-hidden shadow-xl">
            {history.length === 0 ? (
              <div className="p-12 text-center text-text-muted font-body-sm">
                No past matches found. Jump into the arena to record your first game!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-elevated/80 border-b border-glass-border">
                      <th className="py-4 px-6 font-label-caps text-xs text-text-secondary uppercase tracking-wider">Match ID</th>
                      <th className="py-4 px-6 font-label-caps text-xs text-text-secondary uppercase tracking-wider">Opponent</th>
                      <th className="py-4 px-6 font-label-caps text-xs text-text-secondary uppercase tracking-wider">Date</th>
                      <th className="py-4 px-6 font-label-caps text-xs text-text-secondary uppercase tracking-wider">Result</th>
                      <th className="py-4 px-6 font-label-caps text-xs text-text-secondary uppercase tracking-wider text-right">Stakes</th>
                      <th className="py-4 px-6 font-label-caps text-xs text-text-secondary uppercase tracking-wider text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="font-body-sm text-sm divide-y divide-glass-border">
                    {history.map((game) => {
                      const isWin = game.winner === user.id;
                      const isDraw = game.winner === 'draw';
                      const opponentName = game.player1 === user.id ? game.player2Name : game.player1Name;
                      const opponentDisplay = opponentName || 'Opponent';
                      const matchDate = game.createdAt?.toDate
                        ? game.createdAt.toDate().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                        : 'Recent';

                      return (
                        <tr key={game.id} className="hover:bg-surface-elevated/40 transition-colors group">
                          <td className="py-4 px-6 font-label-caps text-xs text-text-primary font-mono group-hover:text-velocity-red transition-colors">
                            #{game.id.substring(0, 8).toUpperCase()}
                          </td>
                          <td className="py-4 px-6 font-body-md text-text-primary font-medium">
                            vs {opponentDisplay}
                          </td>
                          <td className="py-4 px-6 text-text-muted text-xs font-mono">
                            {matchDate}
                          </td>
                          <td className="py-4 px-6">
                            {isWin ? (
                              <span className="bg-velocity-red/10 text-velocity-red border border-velocity-red/30 px-2.5 py-1 rounded font-label-caps text-[10px] font-bold">
                                VICTORY
                              </span>
                            ) : isDraw ? (
                              <span className="bg-surface-variant text-text-secondary border border-glass-border px-2.5 py-1 rounded font-label-caps text-[10px] font-bold">
                                DRAW
                              </span>
                            ) : (
                              <span className="bg-surface-container-highest text-text-muted border border-glass-border px-2.5 py-1 rounded font-label-caps text-[10px] font-bold">
                                DEFEAT
                              </span>
                            )}
                          </td>
                          <td className={`py-4 px-6 text-right font-label-caps font-bold text-xs ${isWin ? 'text-velocity-red' : 'text-text-muted'}`}>
                            {game.wager > 0 ? `${isWin ? '+' : '-'}${game.wager} ${game.wagerCurrency}` : 'FREE'}
                          </td>
                          <td className="py-4 px-6 text-right">
                            <button
                              onClick={() => {
                                setSpectatingGameId(game.id);
                              }}
                              className="inline-flex items-center gap-1 font-label-caps text-[11px] text-text-secondary hover:text-velocity-red transition-colors uppercase px-2.5 py-1 rounded bg-surface-container hover:bg-surface-elevated border border-glass-border"
                            >
                              Inspect <ArrowUpRight size={12} />
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
