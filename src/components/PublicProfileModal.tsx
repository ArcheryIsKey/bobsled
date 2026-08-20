import { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { X, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function PublicProfileModal({ userId, onClose }: { userId: string, onClose: () => void }) {
  const [profile, setProfile] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
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
        let games = querySnapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
        games.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
        setHistory(games.slice(0, 10));
      } catch (e) {
        console.error("Error fetching profile", e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, [userId]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <Loader2 className="animate-spin text-[#14F195]" size={32} />
      </div>
    );
  }

  if (!profile) return null;

  const totalGames = history.length; // Approximate, but good enough for UI
  const wins = history.filter(g => g.winner === userId).length;
  const walletAddress = profile.walletAddress || userId;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-[#0A0A0A] border border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
      >
        <div className="flex justify-between items-center p-4 sm:p-6 border-b border-neutral-800 bg-[#0D0D0D]">
          <h2 className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 font-bold">Public Profile</h2>
          <button onClick={onClose} className="text-neutral-500 hover:text-white transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 sm:p-8 flex flex-col items-center border-b border-glass-border">
          <div className="w-24 h-24 rounded overflow-hidden border-2 border-glass-border relative group mb-4">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
            ) : (
              <div className="w-full h-full bg-surface-elevated flex items-center justify-center">
                <span className="text-3xl font-display-lg font-bold text-text-primary">{profile.username?.substring(0,2).toUpperCase()}</span>
              </div>
            )}
          </div>
          <h3 className="text-2xl font-display-lg text-text-primary uppercase tracking-tighter mb-1">{profile.username}</h3>
          <p className="text-xs text-text-secondary font-mono tracking-widest">{walletAddress.substring(0,8)}...{walletAddress.substring(walletAddress.length - 8)}</p>
        </div>

        <div className="grid grid-cols-3 border-b border-glass-border bg-surface-base">
          <div className="p-4 flex flex-col items-center border-r border-glass-border group hover:bg-surface-elevated transition-colors">
            <span className="text-[10px] text-text-secondary uppercase tracking-widest mb-1 font-label-caps">Rating</span>
            <span className="text-xl font-headline-lg text-velocity-red">{profile.elo}</span>
          </div>
          <div className="p-4 flex flex-col items-center border-r border-glass-border group hover:bg-surface-elevated transition-colors">
            <span className="text-[10px] text-text-secondary uppercase tracking-widest mb-1 font-label-caps">Matches</span>
            <span className="text-xl font-headline-lg text-text-primary">{totalGames}</span>
          </div>
          <div className="p-4 flex flex-col items-center group hover:bg-surface-elevated transition-colors">
            <span className="text-[10px] text-text-secondary uppercase tracking-widest mb-1 font-label-caps">Wins</span>
            <span className="text-xl font-headline-lg text-text-primary">{wins}</span>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto bg-background">
          <h4 className="text-[10px] uppercase tracking-[0.2em] text-text-secondary mb-4 font-label-caps flex items-center gap-2">
            <span className="material-symbols-outlined text-[14px]">history</span> Recent Activity
          </h4>
          {history.length === 0 ? (
            <p className="text-sm text-text-muted font-body-sm text-center py-4">No recent matches.</p>
          ) : (
            <div className="space-y-3">
              {history.map(game => {
                const isWin = game.winner === userId;
                const isDraw = game.winner === 'draw';
                const opponent = game.player1 === userId ? game.player2 : game.player1;
                return (
                  <div key={game.id} className="flex gap-3 text-sm p-3 rounded bg-surface-container border border-glass-border items-center">
                    <span className="font-label-caps text-[10px] text-text-muted w-16 shrink-0 text-right">
                       {game.createdAt ? new Date(game.createdAt.toMillis()).toLocaleDateString() : 'Just now'}
                    </span>
                    <p className="font-body-sm text-text-secondary flex-1">
                      Played vs <span className="text-text-primary font-bold">{opponent ? opponent.substring(0,4) : '?'}</span>
                    </p>
                    <span className={`font-label-caps text-[10px] uppercase px-2 py-1 rounded ${isWin ? 'bg-velocity-red/20 text-velocity-red border border-velocity-red/30' : isDraw ? 'bg-surface-variant text-text-muted border border-glass-border' : 'bg-red-900/10 text-red-500 border border-red-900/20'}`}>
                      {isWin ? 'Victory' : isDraw ? 'Draw' : 'Defeat'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
