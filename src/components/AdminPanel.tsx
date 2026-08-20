import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, onSnapshot, deleteDoc, doc, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useGameStore } from '../store';
import { 
  Users, 
  Gamepad2, 
  Trophy, 
  Coins, 
  Search, 
  Copy, 
  Check, 
  ShieldAlert, 
  Trash2, 
  ArrowLeft, 
  Loader2,
  Activity,
  X,
  User as UserIcon,
  Swords,
  XCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminPanel() {
  const navigate = useNavigate();
  const { user: currentUser } = useGameStore();

  const [users, setUsers] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<'all' | 'active'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);

  // Floating Inspect Profile State
  const [inspectUser, setInspectUser] = useState<any | null>(null);
  const [inspectHistory, setInspectHistory] = useState<any[]>([]);
  const [isLoadingInspectHistory, setIsLoadingInspectHistory] = useState(false);

  // Check admin authorization
  const isAdmin = currentUser?.walletAddress === '11111111111111111111111111111111';

  useEffect(() => {
    if (!isAdmin && currentUser) {
      navigate('/');
      return;
    }

    // Fetch users
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const uList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(uList);
      setIsLoading(false);
    });

    // Fetch games for telemetry
    const unsubGames = onSnapshot(collection(db, 'games'), (snapshot) => {
      const gList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setGames(gList);
    });

    return () => {
      unsubUsers();
      unsubGames();
    };
  }, [isAdmin, currentUser, navigate]);

  // Load match history when an inspect user is selected
  useEffect(() => {
    if (!inspectUser) {
      setInspectHistory([]);
      return;
    }

    setIsLoadingInspectHistory(true);
    const q = query(
      collection(db, 'games'),
      where('players', 'array-contains', inspectUser.id),
      where('status', '==', 'finished')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      let gList = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
      gList.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setInspectHistory(gList);
      setIsLoadingInspectHistory(false);
    });

    return () => unsub();
  }, [inspectUser]);

  const handleCopyWallet = (wallet: string, id: string) => {
    navigator.clipboard.writeText(wallet);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handlePurgeOldGames = async () => {
    if (!confirm('Are you sure you want to delete all finished games? This will reset match histories.')) return;
    setIsPurging(true);
    try {
      const finishedGames = games.filter((g) => g.status === 'finished');
      for (const g of finishedGames) {
        await deleteDoc(doc(db, 'games', g.id));
      }
      alert(`Successfully purged ${finishedGames.length} finished games.`);
    } catch (e) {
      console.error('Error purging games:', e);
      alert('Failed to purge games.');
    } finally {
      setIsPurging(false);
    }
  };

  const handleDeleteUserAccount = async (targetUser: any) => {
    const confirmName = prompt(`Type "${targetUser.username}" to permanently delete this user account:`);
    if (confirmName !== targetUser.username) {
      if (confirmName !== null) alert('Username did not match. Deletion cancelled.');
      return;
    }

    setDeletingUserId(targetUser.id);
    try {
      // 1. Delete user document from /users
      await deleteDoc(doc(db, 'users', targetUser.id));

      // 2. Delete username claim from /usernames
      if (targetUser.username) {
        await deleteDoc(doc(db, 'usernames', targetUser.username.toLowerCase()));
      }

      // 3. Delete any open waiting games created by this user
      const userGamesSnap = await getDocs(
        query(collection(db, 'games'), where('player1', '==', targetUser.id), where('status', '==', 'waiting'))
      );
      for (const gDoc of userGamesSnap.docs) {
        await deleteDoc(gDoc.ref);
      }

      if (inspectUser?.id === targetUser.id) {
        setInspectUser(null);
      }

      alert(`Account @${targetUser.username} successfully deleted.`);
    } catch (e) {
      console.error('Failed to delete user account:', e);
      alert('Failed to delete account from database.');
    } finally {
      setDeletingUserId(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] gap-4">
        <ShieldAlert size={48} className="text-velocity-red" />
        <h1 className="text-xl font-bold">Access Restricted</h1>
        <p className="text-sm text-text-muted">Only the platform administrator can access this terminal.</p>
        <Link to="/" className="px-5 py-2 bg-[#141414] border border-white/10 rounded-full text-xs font-semibold">
          Return to Lobby
        </Link>
      </div>
    );
  }

  // Calculate KPIs
  const totalUsers = users.length;
  const activeGames = games.filter((g) => g.status === 'active');
  const finishedGames = games.filter((g) => g.status === 'finished');
  const totalVolumeSOL = games.reduce((sum, g) => (g.wagerCurrency === 'SOL' ? sum + (g.wager || 0) : sum), 0);

  // Active user IDs (who played in any game)
  const activeUserIds = new Set<string>();
  games.forEach((g) => {
    if (g.player1) activeUserIds.add(g.player1);
    if (g.player2) activeUserIds.add(g.player2);
  });

  // Filter users
  const filteredUsers = users.filter((u) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      u.username?.toLowerCase().includes(q) ||
      u.walletAddress?.toLowerCase().includes(q) ||
      u.id?.toLowerCase().includes(q);

    if (!matchesSearch) return false;
    if (filterMode === 'active') {
      return activeUserIds.has(u.id);
    }
    return true;
  });

  return (
    <div className="min-h-[calc(100vh-76px)] flex flex-col bg-[#0e0e0e] text-text-primary antialiased w-full overflow-y-auto">
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-8 space-y-8">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                className="p-2 rounded-full bg-[#141414] border border-white/10 hover:border-velocity-red text-text-secondary hover:text-white transition-colors"
                title="Back to Lobby"
              >
                <ArrowLeft size={15} />
              </button>
              <h1 className="font-headline-lg text-2xl sm:text-3xl text-white font-bold tracking-tight">
                Admin Panel
              </h1>
            </div>
            <p className="text-xs text-text-muted font-mono">
              Live user database and platform telemetry.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePurgeOldGames}
              disabled={isPurging}
              className="px-4 py-2 bg-[#141414] hover:bg-red-950/40 border border-white/10 hover:border-red-900/60 text-text-secondary hover:text-red-400 text-xs font-semibold rounded-full transition-all flex items-center gap-2 font-mono"
            >
              {isPurging ? <Loader2 size={13} className="animate-spin text-velocity-red" /> : <Trash2 size={13} />}
              <span>Purge Finished Games</span>
            </button>
          </div>
        </div>

        {/* Telemetry KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Total Users */}
          <div className="bg-[#141414] border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs text-text-muted uppercase tracking-wider font-semibold font-mono">Registered Users</span>
              <Users size={16} className="text-velocity-red" />
            </div>
            <div className="font-headline-lg text-3xl font-bold text-white mb-1 font-mono">
              {totalUsers}
            </div>
            <div className="text-xs text-text-muted flex items-center gap-1.5 font-mono">
              <Activity size={12} className="text-emerald-400" /> On-chain database
            </div>
          </div>

          {/* Card 2: Active Games */}
          <div className="bg-[#141414] border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs text-text-muted uppercase tracking-wider font-semibold font-mono">Live Matches</span>
              <Gamepad2 size={16} className="text-emerald-400" />
            </div>
            <div className="font-headline-lg text-3xl font-bold text-white mb-1 font-mono">
              {activeGames.length}
            </div>
            <div className="text-xs text-text-muted font-mono">
              Currently playing
            </div>
          </div>

          {/* Card 3: Finished Games */}
          <div className="bg-[#141414] border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs text-text-muted uppercase tracking-wider font-semibold font-mono">Finished Matches</span>
              <Trophy size={16} className="text-velocity-red" />
            </div>
            <div className="font-headline-lg text-3xl font-bold text-white mb-1 font-mono">
              {finishedGames.length}
            </div>
            <div className="text-xs text-text-muted font-mono">
              Lifetime completed games
            </div>
          </div>

          {/* Card 4: Total Volume */}
          <div className="bg-[#141414] border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs text-text-muted uppercase tracking-wider font-semibold font-mono">Total Stakes</span>
              <Coins size={16} className="text-velocity-red" />
            </div>
            <div className="font-headline-lg text-3xl font-bold text-velocity-red mb-1 font-mono">
              {totalVolumeSOL.toFixed(2)} <span className="text-base text-text-muted font-normal">SOL</span>
            </div>
            <div className="text-xs text-text-muted font-mono">
              Cumulated match wagers
            </div>
          </div>
        </div>

        {/* Users Table Section */}
        <section className="bg-[#141414] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
          
          {/* Table Toolbar */}
          <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#181818]">
            <div className="flex items-center gap-4">
              <h2 className="font-headline-lg text-xl text-white font-bold">
                Users
              </h2>
              
              {/* Sort / Filter Pills */}
              <div className="flex bg-[#0e0e0e] p-1 rounded-full border border-white/10 text-xs font-mono">
                <button
                  onClick={() => setFilterMode('all')}
                  className={`px-3 py-1 rounded-full transition-all ${
                    filterMode === 'all'
                      ? 'bg-white/15 text-white font-bold'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  All ({users.length})
                </button>
                <button
                  onClick={() => setFilterMode('active')}
                  className={`px-3 py-1 rounded-full transition-all ${
                    filterMode === 'active'
                      ? 'bg-velocity-red/20 text-velocity-red font-bold'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  Active ({activeUserIds.size})
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search username or wallet..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0e0e0e] border border-white/10 focus:border-velocity-red text-xs text-white pl-9 pr-4 py-2 rounded-full outline-none transition-all placeholder:text-text-muted font-mono"
              />
            </div>
          </div>

          {/* Users Table */}
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="animate-spin text-velocity-red" size={32} />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-text-muted text-sm font-mono">
              No users matching your search.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#111111] border-b border-white/10 text-text-muted text-[11px] uppercase tracking-wider font-mono">
                    <th className="py-3.5 px-5 font-semibold">User</th>
                    <th className="py-3.5 px-5 font-semibold">Wallet Address</th>
                    <th className="py-3.5 px-5 font-semibold">Registered</th>
                    <th className="py-3.5 px-5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-white/5 font-body-md">
                  {filteredUsers.map((u) => {
                    const regDate = u.createdAt?.toDate
                      ? u.createdAt.toDate().toLocaleDateString()
                      : 'Earlier';
                    const walletStr = u.walletAddress || 'None';

                    return (
                      <tr key={u.id} className="hover:bg-[#1a1a1a] transition-colors group">
                        
                        {/* User Identity */}
                        <td className="py-3 px-5">
                          <div
                            onClick={() => setInspectUser(u)}
                            className="flex items-center gap-3 hover:text-velocity-red transition-colors cursor-pointer"
                          >
                            <div className="w-8 h-8 rounded-full border border-white/10 bg-surface-container overflow-hidden flex items-center justify-center font-bold text-xs text-velocity-red shrink-0">
                              {u.avatarUrl ? (
                                <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                u.username ? u.username.substring(0, 2).toUpperCase() : 'U'
                              )}
                            </div>
                            <span className="font-semibold text-white group-hover:text-velocity-red transition-colors">
                              @{u.username}
                            </span>
                          </div>
                        </td>

                        {/* Wallet Address with Copy */}
                        <td className="py-3 px-5 font-mono text-text-secondary">
                          {u.walletAddress ? (
                            <div className="flex items-center gap-2">
                              <span>
                                {walletStr.substring(0, 8)}...{walletStr.substring(walletStr.length - 8)}
                              </span>
                              <button
                                onClick={() => handleCopyWallet(u.walletAddress, u.id)}
                                className="text-text-muted hover:text-white transition-colors"
                                title="Copy full address"
                              >
                                {copiedId === u.id ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                              </button>
                            </div>
                          ) : (
                            <span className="text-text-muted italic">No wallet</span>
                          )}
                        </td>

                        {/* Registered Date */}
                        <td className="py-3 px-5 font-mono text-text-muted">
                          {regDate}
                        </td>

                        {/* Actions: Floating Inspect Profile & Delete */}
                        <td className="py-3 px-5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setInspectUser(u)}
                              className="px-3.5 py-1.5 rounded-full border border-white/10 hover:border-velocity-red text-text-secondary hover:text-white transition-all text-xs font-medium font-mono"
                            >
                              Inspect
                            </button>
                            <button
                              onClick={() => handleDeleteUserAccount(u)}
                              disabled={deletingUserId === u.id}
                              className="p-1.5 rounded-full text-text-muted hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-900/50 transition-colors"
                              title="Delete Account"
                            >
                              {deletingUserId === u.id ? (
                                <Loader2 size={14} className="animate-spin text-red-500" />
                              ) : (
                                <Trash2 size={14} />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* Floating Inspect Profile Modal (Click outside or ESC to close) */}
      <AnimatePresence>
        {inspectUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setInspectUser(null)}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-xl bg-[#141414] border border-white/15 shadow-[0_16px_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[85vh] rounded-3xl relative"
            >
              {/* Header Close Button */}
              <button
                onClick={() => setInspectUser(null)}
                className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center border border-white/10 transition-colors"
                title="Close"
              >
                <X size={15} />
              </button>

              {/* Banner */}
              <div className="relative w-full h-32 bg-gradient-to-r from-[#1f1f1f] via-[#161616] to-[#0e0e0e] border-b border-white/10 overflow-hidden shrink-0">
                {inspectUser.bannerUrl ? (
                  <img src={inspectUser.bannerUrl} alt="Banner" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="w-64 h-64 bg-velocity-red/10 rounded-full blur-2xl" />
                  </div>
                )}
              </div>

              {/* User Avatar and Meta */}
              <div className="px-6 pb-4 pt-0 border-b border-white/10 relative">
                <div className="flex items-end gap-4 -mt-10 mb-3">
                  <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-[#141414] bg-[#222222] shadow-2xl shrink-0">
                    {inspectUser.avatarUrl ? (
                      <img src={inspectUser.avatarUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center font-bold text-2xl text-white">
                        {inspectUser.username ? inspectUser.username.substring(0, 2).toUpperCase() : <UserIcon size={24} />}
                      </div>
                    )}
                  </div>
                  <div className="space-y-0.5 pb-1">
                    <h3 className="text-xl font-bold text-white font-headline-lg">
                      @{inspectUser.username}
                    </h3>
                    <p className="text-xs text-text-muted font-mono">
                      User ID: {inspectUser.id}
                    </p>
                  </div>
                </div>

                {inspectUser.walletAddress && (
                  <div className="text-xs font-mono text-text-secondary bg-[#0e0e0e] p-2.5 rounded-xl border border-white/5 flex items-center justify-between">
                    <span className="truncate">{inspectUser.walletAddress}</span>
                    <button
                      onClick={() => handleCopyWallet(inspectUser.walletAddress, inspectUser.id)}
                      className="ml-2 text-text-muted hover:text-white shrink-0"
                    >
                      {copiedId === inspectUser.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Stats Grid */}
              <div className="grid grid-cols-3 border-b border-white/10 bg-[#0e0e0e] shrink-0 font-mono">
                <div className="p-3 text-center border-r border-white/10">
                  <span className="text-[10px] text-text-muted uppercase block">Matches</span>
                  <span className="text-base font-bold text-white">{inspectHistory.length}</span>
                </div>
                <div className="p-3 text-center border-r border-white/10">
                  <span className="text-[10px] text-text-muted uppercase block">Wins</span>
                  <span className="text-base font-bold text-velocity-red">
                    {inspectHistory.filter((g) => g.winner === inspectUser.id).length}
                  </span>
                </div>
                <div className="p-3 text-center">
                  <span className="text-[10px] text-text-muted uppercase block">Losses</span>
                  <span className="text-base font-bold text-text-secondary">
                    {inspectHistory.filter((g) => g.winner && g.winner !== inspectUser.id && g.winner !== 'draw').length}
                  </span>
                </div>
              </div>

              {/* Inspect Match History */}
              <div className="flex-1 p-5 overflow-y-auto space-y-3 min-h-0 bg-[#121212]">
                <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                  Match History
                </h4>
                {isLoadingInspectHistory ? (
                  <div className="py-8 flex justify-center">
                    <Loader2 size={20} className="animate-spin text-velocity-red" />
                  </div>
                ) : inspectHistory.length === 0 ? (
                  <p className="text-xs text-text-muted font-mono py-4 text-center">
                    No completed matches recorded.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {inspectHistory.map((g) => {
                      const isWin = g.winner === inspectUser.id;
                      const isDraw = g.winner === 'draw';
                      const oppName = g.player1 === inspectUser.id ? g.player2Name : g.player1Name;
                      return (
                        <div
                          key={g.id}
                          className="flex items-center justify-between p-2.5 rounded-xl bg-[#181818] border border-white/5 text-xs font-mono"
                        >
                          <span className="text-text-muted">#{g.id.substring(0, 6)}</span>
                          <span className="text-white">vs {oppName || 'Opponent'}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                            isWin ? 'bg-velocity-red/15 text-velocity-red' : isDraw ? 'bg-white/10 text-white' : 'bg-neutral-800 text-text-muted'
                          }`}>
                            {isWin ? 'Win' : isDraw ? 'Draw' : 'Loss'}
                          </span>
                          <span className="text-text-secondary">
                            {g.wager > 0 ? `${g.wager} SOL` : 'Free'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bottom Actions: Delete User Account */}
              <div className="p-4 border-t border-white/10 bg-[#141414] flex justify-between items-center shrink-0">
                <button
                  onClick={() => handleDeleteUserAccount(inspectUser)}
                  disabled={deletingUserId === inspectUser.id}
                  className="px-4 py-2 rounded-full bg-red-950/40 hover:bg-red-900/60 border border-red-900/60 text-red-400 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all font-mono"
                >
                  <Trash2 size={13} />
                  <span>Delete User Account</span>
                </button>
                <button
                  onClick={() => setInspectUser(null)}
                  className="px-5 py-2 rounded-full bg-[#202020] hover:bg-[#282828] text-white text-xs font-medium transition-colors"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
