import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, onSnapshot, deleteDoc, doc, getDocs, where, updateDoc } from 'firebase/firestore';
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
  AlertTriangle,
  Crown,
  ShieldCheck,
  ShieldMinus,
  ExternalLink,
  FlaskConical
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const OWNER_WALLET = '11111111111111111111111111111111';

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
  const [showPurgeModal, setShowPurgeModal] = useState(false);

  // Floating Inspect Profile State
  const [inspectUser, setInspectUser] = useState<any | null>(null);
  const [inspectHistory, setInspectHistory] = useState<any[]>([]);
  const [inspectSolBalance, setInspectSolBalance] = useState<number | null>(null);
  const [isLoadingInspectHistory, setIsLoadingInspectHistory] = useState(false);
  const [isLoadingInspectBalance, setIsLoadingInspectBalance] = useState(false);

  // In-App Custom Delete Modal State
  const [userToDelete, setUserToDelete] = useState<any | null>(null);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  // Admin Role Toggle State
  const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);

  const isOwner = currentUser?.walletAddress === OWNER_WALLET;
  const isAdmin = isOwner || currentUser?.isAdmin || currentUser?.role === 'admin';

  useEffect(() => {
    if (!isAdmin && currentUser) {
      navigate('/');
      return;
    }

    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const uList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setUsers(uList);
      setIsLoading(false);
    });

    const unsubGames = onSnapshot(collection(db, 'games'), (snapshot) => {
      const gList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setGames(gList);
    });

    return () => {
      unsubUsers();
      unsubGames();
    };
  }, [isAdmin, currentUser, navigate]);

  useEffect(() => {
    if (!inspectUser) {
      setInspectHistory([]);
      setInspectSolBalance(null);
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

    if (inspectUser.walletAddress) {
      setIsLoadingInspectBalance(true);
      fetch(`/api/solana/balance?wallet=${inspectUser.walletAddress}`)
        .then((res) => res.json())
        .then((data) => {
          if (typeof data.balance === 'number') {
            setInspectSolBalance(data.balance);
          } else {
            setInspectSolBalance(0);
          }
        })
        .catch(() => setInspectSolBalance(0))
        .finally(() => setIsLoadingInspectBalance(false));
    } else {
      setInspectSolBalance(null);
    }

    return () => unsub();
  }, [inspectUser]);

  const handleCopyWallet = (wallet: string, id: string) => {
    navigator.clipboard.writeText(wallet);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleToggleAdminRole = async (targetUser: any) => {
    if (!isOwner) return;
    if (targetUser.walletAddress === OWNER_WALLET) {
      alert('The platform owner role is permanent and cannot be modified.');
      return;
    }

    const currentlyAdmin = targetUser.isAdmin || targetUser.role === 'admin';
    setRoleUpdatingId(targetUser.id);
    try {
      await updateDoc(doc(db, 'users', targetUser.id), {
        isAdmin: !currentlyAdmin,
        role: !currentlyAdmin ? 'admin' : 'user',
      });
      if (inspectUser?.id === targetUser.id) {
        setInspectUser({ ...inspectUser, isAdmin: !currentlyAdmin, role: !currentlyAdmin ? 'admin' : 'user' });
      }
    } catch (e) {
      console.error('Failed to update admin role:', e);
      alert('Failed to update admin permissions.');
    } finally {
      setRoleUpdatingId(null);
    }
  };

  const handlePurgeOldGames = async () => {
    setIsPurging(true);
    try {
      const finishedGames = games.filter((g) => g.status === 'finished');
      for (const g of finishedGames) {
        await deleteDoc(doc(db, 'games', g.id));
      }
      setShowPurgeModal(false);
    } catch (e) {
      console.error('Error purging games:', e);
    } finally {
      setIsPurging(false);
    }
  };

  const handleConfirmDeleteUser = async () => {
    if (!userToDelete) return;
    if (userToDelete.walletAddress === OWNER_WALLET) {
      alert('The platform owner account cannot be deleted.');
      return;
    }

    if (deleteConfirmInput.trim() !== userToDelete.username) {
      return;
    }

    setIsDeleting(true);
    try {
      await deleteDoc(doc(db, 'users', userToDelete.id));
      if (userToDelete.username) {
        await deleteDoc(doc(db, 'usernames', userToDelete.username.toLowerCase()));
      }

      const userGamesSnap = await getDocs(
        query(collection(db, 'games'), where('player1', '==', userToDelete.id), where('status', '==', 'waiting'))
      );
      for (const gDoc of userGamesSnap.docs) {
        await deleteDoc(gDoc.ref);
      }

      if (inspectUser?.id === userToDelete.id) {
        setInspectUser(null);
      }
      setUserToDelete(null);
      setDeleteConfirmInput('');
    } catch (e) {
      console.error('Failed to delete account:', e);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] gap-4">
        <ShieldAlert size={48} className="text-velocity-red" />
        <h1 className="text-xl font-bold">Access Restricted</h1>
        <p className="text-sm text-text-muted">Only authorized platform administrators can access this terminal.</p>
        <Link to="/" className="px-5 py-2 bg-[#141414] border border-white/10 rounded-full text-xs font-semibold cursor-pointer">
          Return to Lobby
        </Link>
      </div>
    );
  }

  const totalUsers = users.length;
  const activeGames = games.filter((g) => g.status === 'active');
  const waitingGames = games.filter((g) => g.status === 'waiting');
  const finishedGames = games.filter((g) => g.status === 'finished');
  const totalVolumeSOL = games.reduce((sum, g) => (g.wagerCurrency === 'SOL' ? sum + (g.wager || 0) : sum), 0);

  const activeUserIds = new Set<string>();
  const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;

  [...activeGames, ...waitingGames].forEach((g) => {
    if (g.player1) activeUserIds.add(g.player1);
    if (g.player2) activeUserIds.add(g.player2);
  });

  finishedGames.forEach((g) => {
    const updatedMillis = g.updatedAt?.toMillis ? g.updatedAt.toMillis() : 0;
    if (updatedMillis > fifteenMinutesAgo) {
      if (g.player1) activeUserIds.add(g.player1);
      if (g.player2) activeUserIds.add(g.player2);
    }
  });

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
                className="p-2 rounded-full bg-[#141414] border border-white/10 hover:border-velocity-red text-text-secondary hover:text-white transition-colors cursor-pointer"
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
              onClick={() => setShowPurgeModal(true)}
              className="px-4 py-2 bg-[#141414] hover:bg-red-950/40 border border-white/10 hover:border-red-900/60 text-text-secondary hover:text-red-400 text-xs font-semibold rounded-full transition-all flex items-center gap-2 font-mono cursor-pointer"
            >
              <Trash2 size={13} />
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
                  className={`px-3.5 py-1 rounded-full transition-all cursor-pointer ${
                    filterMode === 'all'
                      ? 'bg-white/15 text-white font-bold'
                      : 'text-text-muted hover:text-white'
                  }`}
                >
                  All ({users.length})
                </button>
                <button
                  onClick={() => setFilterMode('active')}
                  className={`px-3.5 py-1 rounded-full transition-all cursor-pointer ${
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
                    <th className="py-3.5 px-5 font-semibold">Role</th>
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
                    const isTargetOwner = u.walletAddress === OWNER_WALLET;
                    const isTargetAdmin = isTargetOwner || u.isAdmin || u.role === 'admin';
                    const isTest = u.isTestUser || !u.walletAddress;
                    const displayLabel = isTest ? (u.username || 'Guest') : `@${u.username}`;

                    return (
                      <tr
                        key={u.id}
                        onClick={() => setInspectUser(u)}
                        className="hover:bg-[#1c1c1c] transition-colors group cursor-pointer"
                        title="Click to view profile"
                      >
                        {/* User Identity */}
                        <td className="py-3.5 px-5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full border border-white/10 bg-surface-container overflow-hidden flex items-center justify-center font-bold text-xs text-velocity-red shrink-0">
                              {u.avatarUrl ? (
                                <img src={u.avatarUrl} alt="" className="w-full h-full object-cover" />
                              ) : (
                                u.username ? u.username.substring(0, 2).toUpperCase() : 'U'
                              )}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-white group-hover:text-velocity-red transition-colors">
                                {displayLabel}
                              </span>
                              {isTest && (
                                <span className="text-[10px] font-mono text-velocity-red px-2 py-0.5 rounded-full bg-velocity-red/10 border border-velocity-red/30">
                                  Guest
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Role Badge */}
                        <td className="py-3.5 px-5 font-mono" onClick={(e) => e.stopPropagation()}>
                          {isTargetOwner ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-[10px] uppercase">
                              <Crown size={11} /> Owner
                            </span>
                          ) : isTargetAdmin ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-velocity-red/15 border border-velocity-red/40 text-velocity-red font-bold text-[10px] uppercase">
                              <ShieldCheck size={11} /> Admin
                            </span>
                          ) : (
                            <span className="text-text-muted text-[11px]">Player</span>
                          )}
                        </td>

                        {/* Wallet Address */}
                        <td className="py-3.5 px-5 font-mono text-text-secondary" onClick={(e) => e.stopPropagation()}>
                          {u.walletAddress ? (
                            <div className="flex items-center gap-2">
                              <span>
                                {walletStr.substring(0, 8)}...{walletStr.substring(walletStr.length - 8)}
                              </span>
                              <button
                                onClick={() => handleCopyWallet(u.walletAddress, u.id)}
                                className="text-text-muted hover:text-white transition-colors cursor-pointer"
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
                        <td className="py-3.5 px-5 font-mono text-text-muted" onClick={(e) => e.stopPropagation()}>
                          {regDate}
                        </td>

                        {/* Actions: Make Admin (Owner Only) & Delete */}
                        <td className="py-3.5 px-5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-2">
                            {/* Make / Revoke Admin Button (Owner only) */}
                            {isOwner && !isTargetOwner && (
                              <button
                                onClick={() => handleToggleAdminRole(u)}
                                disabled={roleUpdatingId === u.id}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold flex items-center gap-1 border transition-all cursor-pointer ${
                                  isTargetAdmin
                                    ? 'bg-neutral-800 hover:bg-neutral-700 text-text-secondary border-white/10'
                                    : 'bg-velocity-red/10 hover:bg-velocity-red/20 text-velocity-red border-velocity-red/30'
                                }`}
                                title={isTargetAdmin ? 'Revoke Admin Permissions' : 'Grant Admin Permissions'}
                              >
                                {roleUpdatingId === u.id ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : isTargetAdmin ? (
                                  <>
                                    <ShieldMinus size={11} /> Revoke
                                  </>
                                ) : (
                                  <>
                                    <ShieldCheck size={11} /> Make Admin
                                  </>
                                )}
                              </button>
                            )}

                            {/* Delete User Button (Non-owners only) */}
                            {!isTargetOwner && (
                              <button
                                onClick={() => {
                                  setUserToDelete(u);
                                  setDeleteConfirmInput('');
                                }}
                                className="p-1.5 rounded-full text-text-muted hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-900/50 transition-colors cursor-pointer"
                                title="Delete Account"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
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

      {/* In-App Custom Delete Account Modal */}
      <AnimatePresence>
        {userToDelete && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setUserToDelete(null)}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#141414] border border-red-900/50 shadow-[0_16px_50px_rgba(255,0,0,0.2)] rounded-3xl p-6 sm:p-8 space-y-6 relative overflow-hidden"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-red-950/50 border border-red-900/80 flex items-center justify-center text-red-400 shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Delete User Account</h3>
                  <p className="text-xs text-text-muted font-mono">This action is permanent and cannot be undone.</p>
                </div>
              </div>

              <div className="bg-[#0e0e0e] p-3.5 rounded-xl border border-white/5 text-xs text-text-secondary space-y-2">
                <p>Deleting <strong className="text-white">@{userToDelete.username}</strong> will erase their account data, username reservation, and active matches.</p>
                <p className="text-text-muted">Type <span className="font-mono text-velocity-red font-bold">{userToDelete.username}</span> below to confirm:</p>
              </div>

              <input
                type="text"
                placeholder={userToDelete.username}
                value={deleteConfirmInput}
                onChange={(e) => setDeleteConfirmInput(e.target.value)}
                className="w-full bg-[#0e0e0e] border border-white/10 focus:border-velocity-red rounded-full px-4 py-2.5 text-xs text-white outline-none font-mono text-center"
              />

              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setUserToDelete(null)}
                  className="px-5 py-2 rounded-full bg-[#202020] hover:bg-[#282828] text-white text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDeleteUser}
                  disabled={deleteConfirmInput.trim() !== userToDelete.username || isDeleting}
                  className="px-6 py-2 rounded-full bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-semibold transition-all shadow-[0_0_15px_rgba(255,0,0,0.4)] flex items-center gap-2 cursor-pointer font-mono"
                >
                  {isDeleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  <span>Delete Account</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* In-App Custom Purge Modal */}
      <AnimatePresence>
        {showPurgeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPurgeModal(false)}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/85 backdrop-blur-md p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md bg-[#141414] border border-white/10 shadow-2xl rounded-3xl p-6 sm:p-8 space-y-5"
            >
              <h3 className="text-lg font-bold text-white">Purge Finished Games</h3>
              <p className="text-xs text-text-secondary">
                Are you sure you want to delete all <strong className="text-white font-mono">{finishedGames.length}</strong> completed games from the database? This will clear historical match records.
              </p>
              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setShowPurgeModal(false)}
                  className="px-5 py-2 rounded-full bg-[#202020] text-white text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePurgeOldGames}
                  disabled={isPurging}
                  className="px-6 py-2 rounded-full bg-velocity-red hover:bg-red-600 text-white text-xs font-semibold transition-all shadow-[0_0_15px_rgba(255,77,77,0.4)] flex items-center gap-2 cursor-pointer font-mono"
                >
                  {isPurging ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  <span>Confirm Purge</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Inspect Profile Modal */}
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
                className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center border border-white/10 transition-colors cursor-pointer"
                title="Close"
              >
                <X size={15} />
              </button>

              {/* Banner Container: Natural aspect ratio with black background (no stretch) */}
              <div className="relative w-full h-32 bg-black border-b border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
                {inspectUser.bannerUrl ? (
                  <img src={inspectUser.bannerUrl} alt="Banner" className="w-full h-full object-contain" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_#262626_0%,_#0a0a0a_100%)]">
                    <div className="w-64 h-64 bg-velocity-red/10 rounded-full blur-2xl" />
                  </div>
                )}
              </div>

              {/* User Avatar and Meta */}
              <div className="px-6 pb-4 pt-0 border-b border-white/10 relative">
                <div className="flex items-end justify-between gap-4 -mt-10 mb-3">
                  <div className="flex items-end gap-3.5">
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
                      <div className="flex items-center gap-2">
                        <h3 className="text-xl font-bold text-white font-headline-lg">
                          {inspectUser.isTestUser || !inspectUser.walletAddress ? inspectUser.username : `@${inspectUser.username}`}
                        </h3>
                        {inspectUser.walletAddress === OWNER_WALLET && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[10px] font-bold uppercase font-mono flex items-center gap-1">
                            <Crown size={11} /> Owner
                          </span>
                        )}
                        {(inspectUser.isAdmin || inspectUser.role === 'admin') && inspectUser.walletAddress !== OWNER_WALLET && (
                          <span className="px-2 py-0.5 rounded-full bg-velocity-red/15 text-velocity-red border border-velocity-red/40 text-[10px] font-bold uppercase font-mono flex items-center gap-1">
                            <ShieldCheck size={11} /> Admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-text-muted font-mono">
                        User ID: {inspectUser.id}
                      </p>
                    </div>
                  </div>

                  <Link
                    to={`/profile/${inspectUser.id}`}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#202020] hover:bg-[#282828] border border-white/10 text-xs font-semibold text-white transition-all font-mono"
                  >
                    <span>Full Page</span>
                    <ExternalLink size={12} />
                  </Link>
                </div>

                {inspectUser.walletAddress && (
                  <div className="text-xs font-mono text-text-secondary bg-[#0e0e0e] p-2.5 rounded-xl border border-white/5 flex items-center justify-between">
                    <span className="truncate">{inspectUser.walletAddress}</span>
                    <button
                      onClick={() => handleCopyWallet(inspectUser.walletAddress, inspectUser.id)}
                      className="ml-2 text-text-muted hover:text-white shrink-0 cursor-pointer"
                    >
                      {copiedId === inspectUser.id ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                )}
              </div>

              {/* Quick Stats Grid */}
              <div className="grid grid-cols-4 border-b border-white/10 bg-[#0e0e0e] shrink-0 font-mono">
                <div className="p-3 text-center border-r border-white/10">
                  <span className="text-[10px] text-text-muted uppercase block">Matches</span>
                  <span className="text-sm font-bold text-white">{inspectHistory.length}</span>
                </div>
                <div className="p-3 text-center border-r border-white/10">
                  <span className="text-[10px] text-text-muted uppercase block">Wins</span>
                  <span className="text-sm font-bold text-velocity-red">
                    {inspectHistory.filter((g) => g.winner === inspectUser.id).length}
                  </span>
                </div>
                <div className="p-3 text-center border-r border-white/10">
                  <span className="text-[10px] text-text-muted uppercase block">Losses</span>
                  <span className="text-sm font-bold text-text-secondary">
                    {inspectHistory.filter((g) => g.winner && g.winner !== inspectUser.id && g.winner !== 'draw').length}
                  </span>
                </div>
                <div className="p-3 text-center">
                  <span className="text-[10px] text-text-muted uppercase block">SOL Balance</span>
                  <span className="text-sm font-bold text-velocity-red flex items-center justify-center gap-1">
                    {isLoadingInspectBalance ? (
                      <Loader2 size={12} className="animate-spin text-velocity-red" />
                    ) : inspectSolBalance !== null ? (
                      `${inspectSolBalance.toFixed(3)}`
                    ) : (
                      '—'
                    )}
                  </span>
                </div>
              </div>

              {/* Inspect Match History */}
              <div className="flex-1 p-5 overflow-y-auto space-y-3 min-h-0 bg-[#121212]">
                <div className="flex justify-between items-center">
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                    Match History
                  </h4>
                  <span className="text-[11px] text-text-muted font-mono">
                    {inspectHistory.length} Recorded Matches
                  </span>
                </div>

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
                      const isOppTest = g.player1 === inspectUser.id ? g.player2?.startsWith('test_') : g.player1?.startsWith('test_');
                      const oppDisplay = isOppTest ? (oppName || 'Guest') : `@${oppName || 'Opponent'}`;

                      return (
                        <div
                          key={g.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-[#181818] border border-white/5 text-xs font-mono"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-text-muted">#{g.id.substring(0, 6).toUpperCase()}</span>
                            <span className="text-white">vs {oppDisplay}</span>
                          </div>

                          <div className="flex items-center gap-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              isWin ? 'bg-velocity-red/15 text-velocity-red' : isDraw ? 'bg-white/10 text-white' : 'bg-neutral-800 text-text-muted'
                            }`}>
                              {isWin ? 'Win' : isDraw ? 'Draw' : 'Loss'}
                            </span>
                            <span className={`font-bold ${isWin && g.wager > 0 ? 'text-velocity-red' : 'text-text-secondary'}`}>
                              {g.wager > 0 ? `${g.wager} ${g.wagerCurrency}` : 'Free'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bottom Actions */}
              <div className="p-4 border-t border-white/10 bg-[#141414] flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                  {isOwner && inspectUser.walletAddress !== OWNER_WALLET && (
                    <button
                      onClick={() => handleToggleAdminRole(inspectUser)}
                      disabled={roleUpdatingId === inspectUser.id}
                      className="px-4 py-2 rounded-full bg-[#202020] hover:bg-[#282828] border border-white/10 text-white text-xs font-semibold flex items-center gap-1.5 transition-all font-mono cursor-pointer"
                    >
                      {inspectUser.isAdmin || inspectUser.role === 'admin' ? (
                        <>
                          <ShieldMinus size={13} />
                          <span>Revoke Admin</span>
                        </>
                      ) : (
                        <>
                          <ShieldCheck size={13} />
                          <span>Make Admin</span>
                        </>
                      )}
                    </button>
                  )}
                  {inspectUser.walletAddress !== OWNER_WALLET && (
                    <button
                      onClick={() => {
                        setUserToDelete(inspectUser);
                        setDeleteConfirmInput('');
                      }}
                      className="px-4 py-2 rounded-full bg-red-950/40 hover:bg-red-900/60 border border-red-900/60 text-red-400 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all font-mono cursor-pointer"
                    >
                      <Trash2 size={13} />
                      <span>Delete Account</span>
                    </button>
                  )}
                </div>
                <button
                  onClick={() => setInspectUser(null)}
                  className="px-5 py-2 rounded-full bg-[#202020] hover:bg-[#282828] text-white text-xs font-medium transition-colors cursor-pointer"
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
