import { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { logError } from '../utils/logger';
import { OWNER_WALLET } from '../constants';
import { X, CircleNotch, Crown, ShieldCheck } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

export default function PublicProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
 const [profile, setProfile] = useState<any>(null);
 const [stats, setStats] = useState({ totalGames: 0, wins: 0, losses: 0, winRate: 0 });
 const [isLoading, setIsLoading] = useState(true);

 useEffect(() => {
 const fetchProfile = async () => {
 try {
 const userDoc = await getDoc(doc(db, 'users', userId));
 if (userDoc.exists()) {
 setProfile(userDoc.data());
 }

 const q = query(
 collection(db, 'games'),
 where('players', 'array-contains', userId),
 where('status', '==', 'finished')
 );
 const querySnapshot = await getDocs(q);
 const games = querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as any));
 const total = games.length;
 const wins = games.filter((g) => g.winner === userId).length;
 const losses = games.filter((g) => g.winner && g.winner !== userId && g.winner !== 'draw').length;
 const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
 setStats({ totalGames: total, wins, losses, winRate });
 } catch (e) {
 logError('Error fetching profile', e);
 } finally {
 setIsLoading(false);
 }
 };
 fetchProfile();
 }, [userId]);

 if (isLoading) {
 return (
 <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
 <CircleNotch className="animate-spin text-primary"size={32} />
 </div>
 );
 }

 if (!profile) return null;

 const walletAddress = profile.walletAddress || userId;
 const isOwner = profile.role === 'owner' || (!!OWNER_WALLET && profile.walletAddress === OWNER_WALLET);
 const isAdmin = isOwner || profile.isAdmin || profile.role === 'admin';

 return (
 <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
 <motion.div
 initial={{ opacity: 0, scale: 0.95 }}
 animate={{ opacity: 1, scale: 1 }}
 className="w-full max-w-md bg-[#161616] border border-white/10 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] rounded-xl"
 >
 <div className="flex justify-between items-center p-4 sm:p-5 border-b border-white/10 bg-surface-elevated/40">
 <h2 className="text-xs uppercase tracking-wider text-text-secondary font-bold">Player Profile</h2>
 <button onClick={onClose} className="text-text-muted hover:text-white transition-colors">
 <X size={16} />
 </button>
 </div>

 <div className="p-6 flex flex-col items-center border-b border-white/10 bg-surface-base">
 <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-white/10 relative group mb-3 shadow-lg">
 {profile.avatarUrl ? (
 <img src={profile.avatarUrl} alt="Avatar"className="w-full h-full object-cover"/>
 ) : (
 <div className="w-full h-full bg-surface-elevated flex items-center justify-center">
 <span className="text-2xl font-headline-lg font-bold text-text-primary">
 {profile.username?.substring(0, 2).toUpperCase()}
 </span>
 </div>
 )}
 </div>
 <div className="flex items-center gap-2 mb-1 flex-wrap justify-center">
 <h3 className="text-xl font-headline-lg text-text-primary font-bold tracking-tight">{profile.username}</h3>
 {isOwner && (
 <span className="text-[12px] text-amber-400 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center gap-1 font-bold shrink-0">
 <Crown size={11} />
 <span>Owner</span>
 </span>
 )}
 {isAdmin && !isOwner && (
 <span className="text-[12px] text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 flex items-center gap-1 font-bold shrink-0">
 <ShieldCheck size={11} />
 <span>Admin</span>
 </span>
 )}
 </div>
 <p className="text-xs text-text-muted">
 {walletAddress.substring(0, 6)}...{walletAddress.substring(walletAddress.length - 6)}
 </p>
 </div>

 <div className="grid grid-cols-3 border-b border-white/10 bg-surface-elevated/20">
 <div className="p-3.5 flex flex-col items-center border-r border-white/10">
 <span className="text-[12px] text-text-secondary uppercase tracking-wider mb-0.5">Matches</span>
 <span className="text-lg font-headline-lg text-text-primary font-bold">{stats.totalGames}</span>
 </div>
 <div className="p-3.5 flex flex-col items-center border-r border-white/10">
 <span className="text-[12px] text-text-secondary uppercase tracking-wider mb-0.5">Wins</span>
 <span className="text-lg font-headline-lg text-primary font-bold">{stats.wins}</span>
 </div>
 <div className="p-3.5 flex flex-col items-center">
 <span className="text-[12px] text-text-secondary uppercase tracking-wider mb-0.5">Win Rate</span>
 <span className="text-lg font-headline-lg text-text-primary font-bold">{stats.winRate}%</span>
 </div>
 </div>
 </motion.div>
 </div>
 );
}

