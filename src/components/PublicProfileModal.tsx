import { useState, useEffect } from 'react';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { X, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PublicProfileModal({ userId, onClose }: { userId: string; onClose: () => void }) {
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
        let games = querySnapshot.docs.map((d) => ({ id: d.id, ...d.data() } as any));
        games.sort((a, b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
        setHistory(games.slice(0, 10));
      } catch (e) {
        console.error('Error fetching profile', e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProfile();
  }, [userId]);

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <Loader2 className="animate-spin text-velocity-red" size={32} />
      </div>
    );
  }

  if (!profile) return null;

  const totalGames = history.length;
  const wins = history.filter((g) => g.winner === userId).length;
  const losses = history.filter((g) => g.winner && g.winner !== userId && g.winner !== 'draw').length;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const walletAddress = profile.walletAddress || userId;

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
              <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-surface-elevated flex items-center justify-center">
                <span className="text-2xl font-headline-lg font-bold text-text-primary">
                  {profile.username?.substring(0, 2).toUpperCase()}
                </span>
              </div>
            )}
          </div>
          <h3 className="text-xl font-headline-lg text-text-primary font-bold tracking-tight mb-1">{profile.username}</h3>
          <p className="text-xs text-text-muted font-mono">
            {walletAddress.substring(0, 6)}...{walletAddress.substring(walletAddress.length - 6)}
          </p>
        </div>

        <div className="grid grid-cols-3 border-b border-white/10 bg-surface-elevated/20">
          <div className="p-3.5 flex flex-col items-center border-r border-white/10">
            <span className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Matches</span>
            <span className="text-lg font-headline-lg text-text-primary font-bold">{totalGames}</span>
          </div>
          <div className="p-3.5 flex flex-col items-center border-r border-white/10">
            <span className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Wins</span>
            <span className="text-lg font-headline-lg text-velocity-red font-bold">{wins}</span>
          </div>
          <div className="p-3.5 flex flex-col items-center">
            <span className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Win Rate</span>
            <span className="text-lg font-headline-lg text-text-primary font-bold">{winRate}%</span>
          </div>
        </div>

        <div className="p-4 sm:p-5 overflow-y-auto bg-background flex-1">
          <h4 className="text-xs font-semibold text-text-secondary mb-3 uppercase tracking-wider">
            Recent Matches
          </h4>
          {history.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-4">No recent matches found.</p>
          ) : (
            <div className="space-y-2">
              {history.map((game) => {
                const isWin = game.winner === userId;
                const isDraw = game.winner === 'draw';
                const opponent = game.player1 === userId ? game.player2Name : game.player1Name;
                return (
                  <div key={game.id} className="flex gap-3 text-xs p-2.5 rounded-md bg-surface-container border border-white/5 items-center justify-between">
                    <span className="text-text-muted font-mono text-[11px]">
                      {game.createdAt ? new Date(game.createdAt.toMillis()).toLocaleDateString() : 'Recent'}
                    </span>
                    <p className="text-text-secondary flex-1 px-2 truncate">
                      vs <span className="text-text-primary font-medium">{opponent || 'Opponent'}</span>
                    </p>
                    <span className={`text-[10px] uppercase px-2 py-0.5 rounded font-semibold ${isWin ? 'bg-velocity-red/10 text-velocity-red border border-velocity-red/30' : isDraw ? 'bg-surface-variant text-text-muted border border-white/10' : 'bg-surface-elevated text-text-muted border border-white/5'}`}>
                      {isWin ? 'Win' : isDraw ? 'Draw' : 'Loss'}
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
