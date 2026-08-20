import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, getDoc, collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useGameStore } from '../store';
import { 
  X, 
  Trophy, 
  Swords, 
  Copy, 
  Check, 
  Loader2, 
  User as UserIcon, 
  ExternalLink,
  FlaskConical
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface UserProfileModalProps {
  userId: string;
  onClose: () => void;
}

export default function UserProfileModal({ userId, onClose }: UserProfileModalProps) {
  const navigate = useNavigate();
  const { user: currentUser } = useGameStore();

  const [profileData, setProfileData] = useState<any | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [testUserToast, setTestUserToast] = useState<{ matchId: string; message: string } | null>(null);

  useEffect(() => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    // 1. If viewing own profile and current user is a guest user (or has local session info)
    if (currentUser && currentUser.id === userId && (currentUser.isTestUser || userId.startsWith('test_'))) {
      setProfileData({
        id: currentUser.id,
        username: currentUser.username || 'Guest',
        walletAddress: null,
        avatarUrl: currentUser.avatarUrl || null,
        bannerUrl: currentUser.bannerUrl || null,
        isTestUser: true,
      });
      setIsLoading(false);
      return;
    }

    // 2. If it's a test/guest user ID from someone else
    if (userId.startsWith('test_')) {
      setProfileData({
        id: userId,
        username: 'Guest Player',
        walletAddress: null,
        isTestUser: true,
      });
      setIsLoading(false);
      return;
    }

    // 3. Fetch from Firestore for registered users
    const unsubUser = onSnapshot(doc(db, 'users', userId), (snap) => {
      if (snap.exists()) {
        setProfileData({ id: snap.id, ...snap.data() });
      } else {
        // Fallback to current user if matches
        if (currentUser && currentUser.id === userId) {
          setProfileData({
            id: currentUser.id,
            username: currentUser.username || 'Player',
            walletAddress: currentUser.walletAddress || null,
            avatarUrl: currentUser.avatarUrl || null,
            bannerUrl: currentUser.bannerUrl || null,
            isTestUser: !!currentUser.isTestUser,
          });
        } else {
          setProfileData(null);
        }
      }
      setIsLoading(false);
    });

    // Fetch match history for quick stats & match preview
    const qHistory = query(
      collection(db, 'games'),
      where('players', 'array-contains', userId),
      where('status', '==', 'finished')
    );

    const unsubHistory = onSnapshot(qHistory, (snap) => {
      let games = snap.docs.map((d) => ({ id: d.id, ...d.data() } as any));
      games.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setHistory(games);
    });

    return () => {
      unsubUser();
      unsubHistory();
    };
  }, [userId, currentUser]);

  const handleCopyWallet = () => {
    const wallet = profileData?.walletAddress;
    if (!wallet) return;
    navigator.clipboard.writeText(wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenFullProfile = () => {
    onClose();
    navigate(`/profile/${userId}`);
  };

  const isTestUser = profileData?.isTestUser || !profileData?.walletAddress;
  const rawUsername = profileData?.username;
  const displayName = isTestUser
    ? (rawUsername || 'Guest')
    : `@${rawUsername || 'Player'}`;

  const handleOpponentClick = async (e: React.MouseEvent, oppId: string | null, game: any) => {
    e.stopPropagation();
    const isOppP1 = game.player1 !== userId;
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

    onClose();
    navigate(`/profile/${oppId}`);
  };

  const totalGames = history.length;
  const wins = history.filter((g) => g.winner === userId).length;
  const losses = history.filter((g) => g.winner && g.winner !== userId && g.winner !== 'draw').length;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md p-0 sm:p-4"
      >
        <motion.div
          initial={{ scale: 0.95, y: 30 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 30 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg bg-[#141414] border-t sm:border border-white/15 shadow-[0_16px_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[90vh] sm:max-h-[85vh] rounded-t-3xl sm:rounded-3xl relative"
        >
          {/* Mobile Drag Indicator */}
          <div className="sm:hidden w-10 h-1 rounded-full bg-white/20 mx-auto mt-2 mb-1" />

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-3.5 right-3.5 z-20 w-8 h-8 rounded-full bg-black/75 hover:bg-black text-white flex items-center justify-center border border-white/10 transition-colors cursor-pointer"
            title="Close"
          >
            <X size={15} />
          </button>

          {/* Banner Container */}
          <div className="relative w-full h-28 sm:h-36 bg-black border-b border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
            {profileData?.bannerUrl ? (
              <img src={profileData.bannerUrl} alt="Banner" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_#262626_0%,_#0a0a0a_100%)]">
                <div className="w-64 h-64 bg-velocity-red/10 rounded-full blur-2xl" />
              </div>
            )}
          </div>

          {/* Profile Header Content */}
          <div className="px-5 sm:px-6 pb-4 pt-0 border-b border-white/10 relative">
            
            {/* Top row: Avatar & Full Profile action */}
            <div className="flex items-end justify-between gap-3 mb-2">
              <div className="-mt-10 sm:-mt-12 w-18 h-18 sm:w-20 sm:h-20 rounded-full overflow-hidden border-4 border-[#141414] bg-[#222222] shadow-2xl shrink-0">
                {profileData?.avatarUrl ? (
                  <img src={profileData.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center font-bold text-xl sm:text-2xl text-white">
                    {rawUsername ? rawUsername.substring(0, 2).toUpperCase() : <UserIcon size={22} />}
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

            {/* Bottom row: Username and Metadata */}
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleOpenFullProfile}
                  className="text-lg sm:text-xl font-bold text-white font-headline-lg hover:text-velocity-red transition-colors text-left cursor-pointer flex items-center gap-1.5 truncate"
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
          <div className="grid grid-cols-3 border-b border-white/10 bg-[#0e0e0e] shrink-0 font-mono">
            <div className="p-3 text-center border-r border-white/10">
              <span className="text-[10px] text-text-muted uppercase block">Matches</span>
              <span className="text-sm font-bold text-white">{totalGames}</span>
            </div>
            <div className="p-3 text-center border-r border-white/10">
              <span className="text-[10px] text-text-muted uppercase block">Wins</span>
              <span className="text-sm font-bold text-velocity-red">{wins}</span>
            </div>
            <div className="p-3 text-center">
              <span className="text-[10px] text-text-muted uppercase block">Losses</span>
              <span className="text-sm font-bold text-text-secondary">{losses}</span>
            </div>
          </div>

          {/* Match History Preview List */}
          <div className="flex-1 p-4 sm:p-5 overflow-y-auto space-y-3 min-h-0 bg-[#121212]">
            <div className="flex justify-between items-center">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                Recent Matches
              </h4>
              <span className="text-[11px] text-text-muted font-mono">
                {history.length} Recorded
              </span>
            </div>

            {isLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 size={20} className="animate-spin text-velocity-red" />
              </div>
            ) : history.length === 0 ? (
              <p className="text-xs text-text-muted font-mono py-4 text-center">
                No completed matches found.
              </p>
            ) : (
              <div className="space-y-2">
                {history.slice(0, 5).map((game) => {
                  const isWin = game.winner === userId;
                  const isDraw = game.winner === 'draw';
                  const oppId = game.player1 === userId ? game.player2 : game.player1;
                  const oppName = game.player1 === userId ? game.player2Name : game.player1Name;
                  const isOppP1 = game.player1 !== userId;
                  const isOppTest = (isOppP1 ? game.player1IsTest : game.player2IsTest) || oppId?.startsWith('test_');
                  const oppDisplay = isOppTest ? (oppName || 'Guest') : `@${oppName || 'Opponent'}`;

                  return (
                    <div
                      key={game.id}
                      className="flex items-center justify-between p-3 rounded-xl bg-[#181818] border border-white/5 text-xs font-mono relative"
                    >
                      {/* Guest User Toast Popup */}
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

                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-text-muted shrink-0">#{game.id.substring(0, 6).toUpperCase()}</span>
                        <button
                          onClick={(e) => handleOpponentClick(e, oppId, game)}
                          className="text-white hover:text-velocity-red transition-colors cursor-pointer text-left font-medium truncate"
                        >
                          vs {oppDisplay}
                        </button>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          isWin ? 'bg-velocity-red/15 text-velocity-red' : isDraw ? 'bg-white/10 text-white' : 'bg-neutral-800 text-text-muted'
                        }`}>
                          {isWin ? 'Win' : isDraw ? 'Draw' : 'Loss'}
                        </span>
                        <span className={`font-bold ${isWin && game.wager > 0 ? 'text-velocity-red' : 'text-text-secondary'}`}>
                          {game.wager > 0 ? `${game.wager} ${game.wagerCurrency}` : 'Free'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="p-3.5 sm:p-4 border-t border-white/10 bg-[#141414] flex justify-end items-center shrink-0">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-[#202020] hover:bg-[#282828] text-white text-xs font-medium transition-colors cursor-pointer text-center font-mono"
            >
              Close
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
