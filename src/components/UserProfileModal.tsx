import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useGameStore } from '../store';
import SolAmount from './SolAmount';
import { logError } from '../utils/logger';
import { X, ExternalLink, Copy, Check, Loader2, FlaskConical, User as UserIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UserProfileModalProps {
  userId: string | null;
  onClose: () => void;
}

export default function UserProfileModal({ userId, onClose }: UserProfileModalProps) {
  const navigate = useNavigate();
  const { user: currentUser, solBalance: storeSolBalance } = useGameStore();

  const [profileData, setProfileData] = useState<any>(null);
  const [stats, setStats] = useState({ totalGames: 0, wins: 0, losses: 0 });
  const [solBalance, setSolBalance] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [testUserToast, setTestUserToast] = useState<{ matchId: string; message: string } | null>(null);

  useEffect(() => {
    if (!userId) {
      setProfileData(null);
      setStats({ totalGames: 0, wins: 0, losses: 0 });
      return;
    }

    // Immediately seed with currentUser if inspecting own account
    if (currentUser && currentUser.id === userId) {
      setProfileData(currentUser);
      if (currentUser.isTestUser) {
        setIsLoading(false);
      }
    }

    setIsLoading(true);

    getDoc(doc(db, 'users', userId))
      .then((snap) => {
        if (snap.exists()) {
          const u = { id: snap.id, ...snap.data() } as any;
          setProfileData(u);

          if (u.walletAddress) {
            // Fetch balance via server-side proxy (no CORS issues)
            fetch(`/api/solana/balance?wallet=${u.walletAddress}`)
              .then((r) => r.json())
              .then((d) => {
                if (typeof d.balance === 'number') setSolBalance(d.balance);
              })
              .catch(() => {});
          }
        } else {
          // If no doc in Firestore, check if it's the current user session (guest)
          if (currentUser && currentUser.id === userId) {
            setProfileData(currentUser);
          } else {
            setProfileData({
              id: userId,
              username: 'Guest Player',
              isTestUser: true,
            });
          }
        }
      })
      .catch((err) => {
        logError('Error fetching user profile:', err);
        if (currentUser && currentUser.id === userId) {
          setProfileData(currentUser);
        }
      })
      .finally(() => {
        setIsLoading(false);
      });

    // Real-time stats calculation from finished matches
    const q = query(
      collection(db, 'games'),
      where('players', 'array-contains', userId),
      where('status', '==', 'finished')
    );
    const unsub = onSnapshot(
      q,
      (snapshot) => {
        const games = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        const total = games.length;
        const w = games.filter((g) => g.winner === userId).length;
        const l = games.filter((g) => g.winner && g.winner !== userId && g.winner !== 'draw').length;
        setStats({ totalGames: total, wins: w, losses: l });
      },
      (err) => {
        logError('Error fetching user match stats:', err);
      }
    );

    return () => unsub();
  }, [userId, currentUser]);

  if (!userId) return null;

  const isTestUser = profileData?.isTestUser || profileData?.id?.startsWith('test_') || !profileData?.walletAddress;
  const rawUsername = profileData?.username || (currentUser?.id === userId ? currentUser?.username : null) || 'Guest';
  const displayName = isTestUser ? rawUsername : `@${rawUsername}`;

  const handleCopyWallet = () => {
    if (!profileData?.walletAddress) return;
    navigator.clipboard.writeText(profileData.walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenFullProfile = () => {
    if (isTestUser) {
      alert('Guest accounts are temporary and do not have a persistent profile page.');
      return;
    }
    onClose();
    navigate(`/profile/${userId}`);
  };

  const handleOpponentClick = async (e: React.MouseEvent, oppId: string | null, matchId: string, game: any) => {
    e.stopPropagation();
    const isOppP1 = game.player1 !== userId;
    const isOppTest = isOppP1 ? game.player1IsTest : game.player2IsTest;

    if (isOppTest || !oppId || oppId.startsWith('test_')) {
      setTestUserToast({ matchId, message: 'Guest User (Temporary Account)' });
      setTimeout(() => {
        setTestUserToast((prev) => (prev?.matchId === matchId ? null : prev));
      }, 2500);
      return;
    }

    try {
      const oppDoc = await getDoc(doc(db, 'users', oppId));
      if (!oppDoc.exists() || oppDoc.data()?.isTestUser || !oppDoc.data()?.walletAddress) {
        setTestUserToast({ matchId, message: 'Guest User (Temporary Account)' });
        setTimeout(() => {
          setTestUserToast((prev) => (prev?.matchId === matchId ? null : prev));
        }, 2500);
        return;
      }
    } catch {
      // ignore
    }

    onClose();
    navigate(`/profile/${oppId}`);
  };

  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
      >
        <motion.div
          initial={{ scale: 0.95, y: 15 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 15 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-[#141414] border border-white/15 shadow-[0_16px_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[85vh] rounded-3xl relative"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 z-20 w-8 h-8 rounded-full bg-black/75 hover:bg-black text-white flex items-center justify-center border border-white/10 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={15} />
          </button>

          {/* Banner Container */}
          <div className="relative w-full h-32 sm:h-36 bg-black border-b border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
            {profileData?.bannerUrl ? (
              <img src={profileData.bannerUrl} alt="Banner" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_#262626_0%,_#0a0a0a_100%)]">
                <div className="w-64 h-64 bg-velocity-red/10 rounded-full blur-2xl" />
              </div>
            )}
          </div>

          {/* Profile Header Content - Clean Separation without text overlapping banner */}
          <div className="px-6 pb-4 pt-0 border-b border-white/10 relative">
            
            {/* Top row: Avatar & Full Profile action */}
            <div className="flex items-end justify-between gap-3 mb-2.5">
              <div className="-mt-12 w-20 h-20 rounded-full overflow-hidden border-4 border-[#141414] bg-[#222222] shadow-2xl shrink-0">
                {profileData?.avatarUrl ? (
                  <img src={profileData.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-2xl text-white">
                    {rawUsername ? rawUsername.substring(0, 2).toUpperCase() : <UserIcon size={24} />}
                  </div>
                )}
              </div>

              {/* Top Full Profile Button */}
              {!isTestUser && (
                <button
                  onClick={handleOpenFullProfile}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#202020] hover:bg-[#282828] border border-white/10 hover:border-velocity-red text-xs font-semibold text-white transition-all cursor-pointer font-mono shrink-0 whitespace-nowrap"
                  title="View Full Profile Page"
                >
                  <span className="whitespace-nowrap">Full Profile</span>
                  <ExternalLink size={12} className="shrink-0 text-text-muted" />
                </button>
              )}
            </div>

            {/* Bottom row: Username and Metadata (sitting comfortably below avatar) */}
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleOpenFullProfile}
                  className="text-xl font-bold text-white font-headline-lg hover:text-velocity-red transition-colors text-left cursor-pointer flex items-center gap-1.5 truncate"
                >
                  <span className="truncate">{displayName}</span>
                </button>
                {isTestUser && (
                  <span className="text-[10px] font-mono text-velocity-red px-2 py-0.5 rounded-full bg-velocity-red/10 border border-velocity-red/30 flex items-center gap-1 font-bold shrink-0">
                    <FlaskConical size={10} />
                    <span>Guest</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-text-muted font-mono truncate">
                User ID: {userId.substring(0, 14)}...
              </p>
            </div>

            {/* Wallet Address Pill */}
            {profileData?.walletAddress && (
              <div className="text-xs font-mono text-text-secondary bg-[#0e0e0e] p-2.5 rounded-xl border border-white/5 flex items-center justify-between mt-2.5">
                <span className="truncate">{profileData.walletAddress}</span>
                <button
                  onClick={handleCopyWallet}
                  className="ml-2 text-text-muted hover:text-white shrink-0 cursor-pointer"
                  title="Copy wallet address"
                >
                  {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                </button>
              </div>
            )}
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-4 border-b border-white/10 bg-[#0e0e0e] shrink-0 font-mono">
            <div className="p-3 text-center border-r border-white/10">
              <span className="text-[10px] text-text-muted uppercase block">Matches</span>
              <span className="text-sm font-bold text-white">{stats.totalGames}</span>
            </div>
            <div className="p-3 text-center border-r border-white/10">
              <span className="text-[10px] text-text-muted uppercase block">Wins</span>
              <span className="text-sm font-bold text-velocity-red">{stats.wins}</span>
            </div>
            <div className="p-3 text-center border-r border-white/10">
              <span className="text-[10px] text-text-muted uppercase block">Losses</span>
              <span className="text-sm font-bold text-text-secondary">{stats.losses}</span>
            </div>
            <div className="p-3 text-center">
              <span className="text-[10px] text-text-muted uppercase block">SOL</span>
              <div className="text-sm font-bold text-velocity-red flex items-center justify-center">
                {isTestUser ? (
                  '—'
                ) : (
                  <SolAmount
                    amount={
                      solBalance !== null
                        ? parseFloat(solBalance.toFixed(3))
                        : storeSolBalance !== null && currentUser?.id === userId
                        ? parseFloat(storeSolBalance.toFixed(3))
                        : 0
                    }
                    suffix=""
                    className="font-bold text-velocity-red hover:text-red-400"
                  />
                )}
              </div>
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="p-4 border-t border-white/10 bg-[#141414] flex justify-end items-center shrink-0">
            <button
              onClick={onClose}
              className="px-6 py-2 rounded-full bg-[#202020] hover:bg-[#282828] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
