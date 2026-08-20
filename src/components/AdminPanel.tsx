import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { collection, query, onSnapshot, getDocs, deleteDoc, doc } from 'firebase/firestore';
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
  ExternalLink, 
  ShieldAlert, 
  Trash2, 
  ArrowLeft, 
  Loader2,
  Activity
} from 'lucide-react';

export default function AdminPanel() {
  const navigate = useNavigate();
  const { user: currentUser } = useGameStore();

  const [users, setUsers] = useState<any[]>([]);
  const [games, setGames] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isPurging, setIsPurging] = useState(false);

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

  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] gap-4">
        <ShieldAlert size={48} className="text-velocity-red" />
        <h1 className="text-xl font-bold">Access Restricted</h1>
        <p className="text-sm text-text-muted">Only the platform administrator can access this terminal.</p>
        <Link to="/" className="px-4 py-2 bg-surface-container border border-white/10 rounded-md text-xs font-semibold">
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

  // Filter users by search term
  const filteredUsers = users.filter((u) => {
    const q = searchTerm.toLowerCase();
    return (
      u.username?.toLowerCase().includes(q) ||
      u.walletAddress?.toLowerCase().includes(q) ||
      u.id?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-[calc(100vh-64px)] flex flex-col bg-[#0e0e0e] text-text-primary antialiased w-full overflow-y-auto">
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate('/')}
                className="p-1.5 rounded-md bg-surface-container border border-white/10 hover:border-velocity-red text-text-secondary hover:text-white transition-colors"
                title="Back to Lobby"
              >
                <ArrowLeft size={16} />
              </button>
              <h1 className="font-headline-lg text-2xl sm:text-3xl text-white font-bold tracking-tight">
                Admin Terminal
              </h1>
              <span className="bg-velocity-red/10 text-velocity-red border border-velocity-red/30 px-2.5 py-0.5 rounded text-[11px] font-mono font-bold uppercase">
                Root Access
              </span>
            </div>
            <p className="text-xs text-text-muted font-mono">
              Live user database and system telemetry.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePurgeOldGames}
              disabled={isPurging}
              className="px-3.5 py-2 bg-red-950/40 border border-red-900/60 hover:bg-red-900/60 text-red-400 hover:text-white text-xs font-semibold rounded-md transition-all flex items-center gap-1.5"
            >
              {isPurging ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              <span>Purge Finished Games</span>
            </button>
          </div>
        </div>

        {/* Telemetry KPI Cards (4 Cards matching Stitch Design) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Total Users */}
          <div className="bg-[#141414] border border-white/10 p-5 rounded-lg relative overflow-hidden group hover:border-white/20 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Registered Users</span>
              <Users size={16} className="text-velocity-red" />
            </div>
            <div className="font-headline-lg text-3xl font-bold text-white mb-1">
              {totalUsers}
            </div>
            <div className="text-xs text-text-muted flex items-center gap-1">
              <Activity size={12} className="text-emerald-400" /> Authenticated on-chain
            </div>
          </div>

          {/* Card 2: Active Games */}
          <div className="bg-[#141414] border border-white/10 p-5 rounded-lg relative overflow-hidden group hover:border-white/20 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Live Matches</span>
              <Gamepad2 size={16} className="text-emerald-400" />
            </div>
            <div className="font-headline-lg text-3xl font-bold text-white mb-1">
              {activeGames.length}
            </div>
            <div className="text-xs text-text-muted">
              In progress right now
            </div>
          </div>

          {/* Card 3: Finished Games */}
          <div className="bg-[#141414] border border-white/10 p-5 rounded-lg relative overflow-hidden group hover:border-white/20 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Finished Matches</span>
              <Trophy size={16} className="text-velocity-red" />
            </div>
            <div className="font-headline-lg text-3xl font-bold text-white mb-1">
              {finishedGames.length}
            </div>
            <div className="text-xs text-text-muted">
              Lifetime completed games
            </div>
          </div>

          {/* Card 4: Total Volume */}
          <div className="bg-[#141414] border border-white/10 p-5 rounded-lg relative overflow-hidden group hover:border-white/20 transition-colors">
            <div className="flex justify-between items-start mb-3">
              <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Total Stakes</span>
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

        {/* User Roster Table Section */}
        <section className="bg-[#141414] border border-white/10 rounded-lg overflow-hidden shadow-2xl">
          
          {/* Table Toolbar */}
          <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-[#181818]">
            <div className="flex items-center gap-3">
              <h2 className="font-headline-lg text-lg text-white font-bold">
                User Roster
              </h2>
              <span className="text-xs text-text-muted font-mono">
                ({filteredUsers.length} total)
              </span>
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-72">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search username or wallet..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#0e0e0e] border border-white/10 focus:border-velocity-red text-xs text-white pl-9 pr-3 py-2 rounded-md outline-none transition-all placeholder:text-text-muted font-mono"
              />
            </div>
          </div>

          {/* Users Table */}
          {isLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="animate-spin text-velocity-red" size={32} />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-12 text-center text-text-muted text-sm">
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
                          <Link
                            to={`/profile/${u.id}`}
                            className="flex items-center gap-3 hover:text-velocity-red transition-colors"
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
                          </Link>
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
                                {copiedId === u.id ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
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

                        {/* Action: Inspect Profile */}
                        <td className="py-3 px-5 text-right">
                          <Link
                            to={`/profile/${u.id}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-velocity-red/40 text-velocity-red hover:bg-velocity-red hover:text-white transition-all text-xs font-semibold"
                          >
                            <span>Inspect Profile</span>
                            <ExternalLink size={12} />
                          </Link>
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
    </div>
  );
}
