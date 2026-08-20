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

        <div className="p-6 sm:p-8 flex flex-col items-center border-b border-neutral-800">
          <div className="w-20 h-20 border border-[#AB9FF2]/50 bg-[#AB9FF2]/10 mb-4 flex items-center justify-center overflow-hidden">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-2xl font-mono font-bold text-[#AB9FF2]">{profile.username?.substring(0,2).toUpperCase()}</span>
            )}
          </div>
          <h3 className="text-xl font-bold text-white uppercase tracking-wider mb-1">{profile.username}</h3>
          <p className="text-[10px] text-neutral-500 font-mono tracking-widest">{walletAddress.substring(0,8)}...{walletAddress.substring(walletAddress.length - 8)}</p>
        </div>

        <div className="flex border-b border-neutral-800">
          <div className="flex-1 p-4 flex flex-col items-center border-r border-neutral-800">
            <span className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Rating</span>
            <span className="text-lg font-mono text-[#14F195]">{profile.elo}</span>
          </div>
          <div className="flex-1 p-4 flex flex-col items-center border-r border-neutral-800">
            <span className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Matches</span>
            <span className="text-lg font-mono text-white">{totalGames}</span>
          </div>
          <div className="flex-1 p-4 flex flex-col items-center">
            <span className="text-[10px] text-neutral-500 uppercase tracking-widest mb-1">Wins</span>
            <span className="text-lg font-mono text-white">{wins}</span>
          </div>
        </div>

        <div className="p-4 sm:p-6 overflow-y-auto bg-neutral-900/30">
          <h4 className="text-[10px] uppercase tracking-[0.2em] text-neutral-500 mb-4">Recent Activity</h4>
          {history.length === 0 ? (
            <p className="text-[10px] text-neutral-600 font-mono text-center py-4">No recent matches.</p>
          ) : (
            <div className="space-y-2">
              {history.map(game => {
                const isWin = game.winner === userId;
                const isDraw = game.winner === 'draw';
                return (
                  <div key={game.id} className="flex justify-between items-center p-3 border border-neutral-800 bg-[#0A0A0A]">
                    <div className="flex items-center gap-3">
                      <div className={`w-1.5 h-1.5 rounded-full ${isWin ? 'bg-[#14F195]' : isDraw ? 'bg-neutral-500' : 'bg-red-500'}`} />
                      <span className="text-[10px] font-mono text-neutral-400">
                        {game.wager} {game.wagerCurrency}
                      </span>
                    </div>
                    <span className={`text-[10px] font-mono uppercase tracking-widest ${isWin ? 'text-[#14F195]' : isDraw ? 'text-neutral-500' : 'text-red-500'}`}>
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
