import { useState, useEffect, useMemo, useRef, type MouseEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
 collection, 
 query, 
 onSnapshot, 
 deleteDoc, 
 doc, 
 getDocs, 
 where, 
 updateDoc, 
 orderBy, 
 limit 
} from 'firebase/firestore';
import { db } from '../firebase';
import { useGameStore } from '../store';
import { OWNER_WALLET } from '../constants';
import { logError } from '../utils/logger';
import SolAmount from './SolAmount';
import { 
 Users, 
 GameController, 
 Trophy, 
 Coins, 
 MagnifyingGlass as Search, 
 Copy, 
 Check, 
 ShieldWarning as ShieldAlert, 
 Trash as Trash2, 
 ArrowLeft, 
 CircleNotch, 
 ChartLineUp as Activity, 
 X, 
 User as UserIcon, 
 Warning,
 Crown,
 ShieldCheck,
 Shield as ShieldMinus,
 ArrowUpRight,
 Flask,
 Lightning,
 ArrowSquareOut,
 Clock,
 Receipt,
 Code,
 Cpu,
 Eye,
 Info,
 ArrowsClockwise,
 Cube,
 ChatCircleText,
 Broadcast,
 UserPlus
} from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

export type AdminHistoryEventType =
 | 'created'
 | 'deposit_p1'
 | 'deposit_p2'
 | 'match_started'
 | 'resigned'
 | 'timeout_win'
 | 'game_finished'
 | 'paid_out'
 | 'refunded'
 | 'draw_refunded'
 | 'cancelled'
 | 'cron_recovery'
 | 'user_registered'
 | string;

export interface AdminHistoryRecord {
 id: string;
 timestamp?: any;
 isoTimestamp?: string;
 eventType: AdminHistoryEventType;
 eventLabel: string;
 status: 'confirmed' | 'processing' | 'failed' | string;
 gameId: string;
 gameType?: string;
 wager: number;
 wagerCurrency?: 'SOL' | 'FREE' | string;
 totalPot?: number | null;
 userId: string;
 username: string;
 walletAddress?: string | null;
 role?: string;
 targetUserId?: string | null;
 targetUsername?: string | null;
 targetWallet?: string | null;
 amountSol?: number | null;
 houseFeeSol?: number | null;
 txSignature?: string | null;
 solscanUrl?: string | null;
 network?: string;
 metadata?: {
 boardSnapshot?: number[];
 winner?: string | null;
 reason?: string;
 senderWallet?: string;
 errorMessage?: string;
 totalPot?: number;
 winnerPayout?: number;
 houseFee?: number;
 refundPerPlayer?: number;
 transferredLamports?: number;
 role?: string;
 [key: string]: any;
 };
}

// Helpers for timestamps
function formatRelativeTime(timestamp: any, isoTimestamp?: string): string {
 let date: Date | null = null;
 if (timestamp?.toDate) {
 date = timestamp.toDate();
 } else if (timestamp?.toMillis) {
 date = new Date(timestamp.toMillis());
 } else if (timestamp?.seconds) {
 date = new Date(timestamp.seconds * 1000);
 } else if (timestamp instanceof Date) {
 date = timestamp;
 } else if (isoTimestamp) {
 date = new Date(isoTimestamp);
 }

 if (!date || isNaN(date.getTime())) return 'Just now';

 const diffMs = Date.now() - date.getTime();
 if (diffMs < 0) return 'Just now';
 const diffSec = Math.floor(diffMs / 1000);
 if (diffSec < 45) return 'Just now';
 const diffMin = Math.floor(diffSec / 60);
 if (diffMin < 60) return `${diffMin}m ago`;
 const diffHours = Math.floor(diffMin / 60);
 if (diffHours < 24) return `${diffHours}h ago`;
 const diffDays = Math.floor(diffHours / 24);
 if (diffDays < 7) return `${diffDays}d ago`;
 return date.toLocaleDateString();
}

function formatFullTimestamp(timestamp: any, isoTimestamp?: string): string {
 let date: Date | null = null;
 if (timestamp?.toDate) {
 date = timestamp.toDate();
 } else if (timestamp?.toMillis) {
 date = new Date(timestamp.toMillis());
 } else if (timestamp?.seconds) {
 date = new Date(timestamp.seconds * 1000);
 } else if (timestamp instanceof Date) {
 date = timestamp;
 } else if (isoTimestamp) {
 date = new Date(isoTimestamp);
 }

 if (!date || isNaN(date.getTime())) return '—';
 return date.toLocaleString();
}

// Event Type Color Badges
function getEventBadgeProps(eventType: string) {
 switch (eventType) {
 case 'paid_out':
 return {
 className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
 label: 'PAID OUT',
 icon: <Trophy size={11} className="shrink-0"/>,
 };
 case 'deposit_p1':
 return {
 className: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
 label: 'DEPOSIT (P1)',
 icon: <Coins size={11} className="shrink-0"/>,
 };
 case 'deposit_p2':
 return {
 className: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
 label: 'DEPOSIT (P2)',
 icon: <Coins size={11} className="shrink-0"/>,
 };
 case 'refunded':
 return {
 className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
 label: 'REFUNDED',
 icon: <ArrowsClockwise size={11} className="shrink-0"/>,
 };
 case 'draw_refunded':
 return {
 className: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
 label: 'DRAW REFUND',
 icon: <ArrowsClockwise size={11} className="shrink-0"/>,
 };
 case 'resigned':
 return {
 className: 'bg-red-500/10 text-red-400 border-red-500/30',
 label: 'RESIGNED',
 icon: <Warning size={11} className="shrink-0"/>,
 };
 case 'timeout_win':
 return {
 className: 'bg-red-500/10 text-red-400 border-red-500/30',
 label: 'TIMEOUT WIN',
 icon: <Clock size={11} className="shrink-0"/>,
 };
 case 'created':
 return {
 className: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
 label: 'ROOM CREATED',
 icon: <Cube size={11} className="shrink-0"/>,
 };
 case 'match_started':
 return {
 className: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
 label: 'MATCH STARTED',
 icon: <GameController size={11} className="shrink-0"/>,
 };
 case 'cancelled':
 return {
 className: 'bg-neutral-500/10 text-neutral-400 border-neutral-500/30',
 label: 'CANCELLED',
 icon: <X size={11} className="shrink-0"/>,
 };
 case 'game_finished':
 return {
 className: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
 label: 'MATCH FINISHED',
 icon: <Trophy size={11} className="shrink-0"/>,
 };
 case 'user_registered':
 return {
 className: 'bg-teal-500/10 text-teal-400 border-teal-500/30',
 label: 'NEW USER',
 icon: <UserPlus size={11} className="shrink-0"/>,
 };
 case 'cron_recovery':
 return {
 className: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
 label: 'CRON RECOVERY',
 icon: <Cpu size={11} className="shrink-0"/>,
 };
 default:
 return {
 className: 'bg-neutral-800 text-text-secondary border-white/10',
 label: (eventType || 'UNKNOWN').toUpperCase().replace('_', ' '),
 icon: <Info size={11} className="shrink-0"/>,
 };
 }
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
 switch (status) {
 case 'confirmed':
 return (
 <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[12px] font-semibold">
 Confirmed
 </span>
 );
 case 'processing':
 case 'pending':
 return (
 <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-[12px] font-semibold">
 Processing
 </span>
 );
 case 'failed':
 return (
 <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-[12px] font-semibold">
 Failed
 </span>
 );
 default:
 return (
 <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-800 border border-white/10 text-text-muted text-[12px] font-semibold">
 {status || 'Unknown'}
 </span>
 );
 }
}

// Solscan Transaction Pill
function SolscanTxPill({
 txSignature,
 solscanUrl,
 onCopy,
 copied,
}: {
 txSignature?: string | null;
 solscanUrl?: string | null;
 onCopy?: (text: string) => void;
 copied?: boolean;
}) {
 if (!txSignature) {
 return <span className="text-text-muted text-xs italic">No Tx</span>;
 }

 const url = solscanUrl || `https://solscan.io/tx/${txSignature}?cluster=devnet`;
 const truncated = `${txSignature.substring(0, 4)}...${txSignature.substring(txSignature.length - 4)}`;

 return (
 <div className="inline-flex items-center gap-1"onClick={(e) => e.stopPropagation()}>
 <a
 href={url}
 target="_blank"
 rel="noopener noreferrer"
 title={`Inspect Transaction on Solscan: ${txSignature}`}
 className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 hover:border-primary text-[12px] transition-all hover:scale-105"
 >
 <span>{truncated}</span>
 <ArrowSquareOut size={10} className="shrink-0"/>
 </a>
 {onCopy && (
 <button
 onClick={() => onCopy(txSignature)}
 className="p-1 text-text-muted hover:text-white transition-colors cursor-pointer"
 title="Copy full transaction signature"
 >
 {copied ? <Check size={10} className="text-emerald-400"/> : <Copy size={10} />}
 </button>
 )}
 </div>
 );
}

// Solscan Account Link
function SolscanAccountLink({
 walletAddress,
 onCopy,
 copied,
 truncate = true,
}: {
 walletAddress: string;
 onCopy?: (text: string) => void;
 copied?: boolean;
 truncate?: boolean;
}) {
 const url = `https://solscan.io/account/${walletAddress}?cluster=devnet`;
 const label = truncate && walletAddress.length > 12
 ? `${walletAddress.substring(0, 4)}...${walletAddress.substring(walletAddress.length - 4)}`
 : walletAddress;

 return (
 <div className="inline-flex items-center gap-1.5 min-w-0 max-w-full"onClick={(e) => e.stopPropagation()}>
 <a
 href={url}
 target="_blank"
 rel="noopener noreferrer"
 title={`Inspect Account on Solscan: ${walletAddress}`}
 className="inline-flex items-center gap-1 text-text-secondary hover:text-primary transition-colors min-w-0 truncate"
 >
 <span className="truncate">{label}</span>
 <ArrowSquareOut size={11} className="shrink-0 text-text-muted hover:text-primary"/>
 </a>
 {onCopy && (
 <button
 onClick={() => onCopy(walletAddress)}
 className="text-text-muted hover:text-white transition-colors cursor-pointer shrink-0"
 title="Copy full wallet address"
 >
 {copied ? <Check size={11} className="text-emerald-400"/> : <Copy size={11} />}
 </button>
 )}
 </div>
 );
}

// Connect-4 Board Mini Visualizer
function BoardSnapshotView({ board }: { board: number[] }) {
 if (!Array.isArray(board) || board.length !== 42) {
 return (
 <div className="text-xs text-text-muted p-3 bg-black rounded-xl border border-white/5">
 Invalid or empty board snapshot ({board ? board.length : 0} cells)
 </div>
 );
 }

 const rows = 6;
 const cols = 7;

 return (
 <div className="bg-neutral-950 border border-white/10 rounded-2xl p-4 inline-block shadow-2xl">
 <div className="grid grid-cols-7 gap-1.5 bg-[#141414] p-3 rounded-xl border border-white/5">
 {Array.from({ length: rows * cols }).map((_, idx) => {
 const val = board[idx];
 return (
 <div
 key={idx}
 className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full flex items-center justify-center border transition-all ${
 val === 1
 ? 'bg-primary border-primary/80 shadow-[0_0_8px_rgba(255,77,77,0.5)]'
 : val === 2
 ? 'bg-amber-400 border-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.5)]'
 : 'bg-black/80 border-white/10'
 }`}
 title={`Cell ${idx}: ${val === 1 ? 'Player 1' : val === 2 ? 'Player 2' : 'Empty'}`}
 >
 {val === 1 && <span className="text-[11px] font-bold text-white">1</span>}
 {val === 2 && <span className="text-[11px] font-bold text-black">2</span>}
 </div>
 );
 })}
 </div>
 <div className="flex items-center justify-between text-[12px] text-text-muted mt-2.5 px-1">
 <span className="flex items-center gap-1.5">
 <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block"/> Player 1 (Host)
 </span>
 <span className="flex items-center gap-1.5">
 <span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block"/> Player 2 (Opponent)
 </span>
 </div>
 </div>
 );
}

export default function AdminPanel() {
 const navigate = useNavigate();
 const { user: currentUser } = useGameStore();

 // Firestore Collections State
 const [users, setUsers] = useState<any[]>([]);
 const [games, setGames] = useState<any[]>([]);
 const [historyEvents, setHistoryEvents] = useState<AdminHistoryRecord[]>([]);

 // Loading & Error States
 const [isLoadingUsers, setIsLoadingUsers] = useState(true);
 const [isLoadingHistory, setIsLoadingHistory] = useState(true);
 const [historyError, setHistoryError] = useState<string | null>(null);

 // Users Filters & Search
 const [searchTerm, setSearchTerm] = useState('');
 const [filterMode, setFilterMode] = useState<'all' | 'active'>('all');

 // Live Activity Stream Filters & Search
 const [historySearchTerm, setHistorySearchTerm] = useState('');
 const [categoryFilter, setCategoryFilter] = useState<
 'all' | 'rooms' | 'matches' | 'users' | 'deposits' | 'payouts' | 'refunds' | 'resignations' | 'cron'
 >('all');
 const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'processing' | 'failed'>('all');

 // Copy States
 const [copiedId, setCopiedId] = useState<string | null>(null);
 const [copiedTxSig, setCopiedTxSig] = useState<string | null>(null);
 const [copiedJson, setCopiedJson] = useState(false);

 // Purge Games Modal State (Caution-styled)
 const [isPurging, setIsPurging] = useState(false);
 const [showPurgeModal, setShowPurgeModal] = useState(false);

 // Floating Inspect Profile Modal (Users & Activity History)
 const [inspectUser, setInspectUser] = useState<any | null>(null);
 const [inspectHistory, setInspectHistory] = useState<any[]>([]);
 const [inspectSolBalance, setInspectSolBalance] = useState<number | null>(null);
 const [isLoadingInspectHistory, setIsLoadingInspectHistory] = useState(false);
 const [isLoadingInspectBalance, setIsLoadingInspectBalance] = useState(false);
 const [testUserToast, setTestUserToast] = useState<{ matchId: string; message: string } | null>(null);

 // Floating Event Inspector Modal
 const [selectedEvent, setSelectedEvent] = useState<AdminHistoryRecord | null>(null);

 // In-App Custom Delete Modal State
 const [userToDelete, setUserToDelete] = useState<any | null>(null);
 const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
 const [isDeleting, setIsDeleting] = useState(false);

 // Admin Role Toggle State
 const [roleUpdatingId, setRoleUpdatingId] = useState<string | null>(null);

 // Activity Feed scroll container ref
 const activityFeedEndRef = useRef<HTMLDivElement>(null);

 const isOwner = currentUser?.role === 'owner' || (!!OWNER_WALLET && currentUser?.walletAddress === OWNER_WALLET);
 const isAdmin = isOwner || currentUser?.isAdmin || currentUser?.role === 'admin';

 useEffect(() => {
 document.title = 'bobsled.gg - Admin';
 return () => {
 document.title = 'bobsled.gg - Connect 4';
 };
 }, []);

 // Fetch Users & Games in Real-Time
 useEffect(() => {
 if (!isAdmin && currentUser) {
 navigate('/');
 return;
 }

 const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
 const uList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
 setUsers(uList);
 setIsLoadingUsers(false);
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

 // Live Admin History Stream Listener
 useEffect(() => {
 if (!isAdmin) return;
 setIsLoadingHistory(true);
 setHistoryError(null);

 try {
 const q = query(
 collection(db, 'admin_history'),
 orderBy('timestamp', 'desc'),
 limit(100)
 );

 const unsubHistory = onSnapshot(
 q,
 (snapshot) => {
 const list = snapshot.docs.map((d) => ({
 id: d.id,
 ...d.data(),
 })) as AdminHistoryRecord[];
 setHistoryEvents(list);
 setIsLoadingHistory(false);
 },
 (err) => {
 logError('Failed to stream admin history:', err);
 setHistoryError(err.message || 'Failed to load activity stream.');
 setIsLoadingHistory(false);
 }
 );

 return () => unsubHistory();
 } catch (err: any) {
 logError('Error setting up admin history listener:', err);
 setHistoryError(err.message || 'Failed to initialize activity listener.');
 setIsLoadingHistory(false);
 }
 }, [isAdmin]);

 // Unified, Super Verbose Activity Stream (Synthesizes admin_history + all games + all user accounts)
 const unifiedHistoryEvents = useMemo(() => {
 const eventMap = new Map<string, AdminHistoryRecord>();

 // 1. Ingest all official admin_history records first
 for (const ev of historyEvents) {
 if (ev.id) {
 eventMap.set(ev.id, ev);
 }
 }

 // 2. Generate comprehensive verbose events from all games
 for (const g of games) {
 if (!g.id) continue;

 // A. Room Created event
 const createdKey = `game_created_${g.id}`;
 if (!eventMap.has(createdKey)) {
 eventMap.set(createdKey, {
 id: createdKey,
 timestamp: g.createdAt,
 eventType: 'created',
 eventLabel: 'Room Created',
 status: 'confirmed',
 gameId: g.id,
 gameType: g.gameType || 'connect4',
 wager: g.wager || 0,
 wagerCurrency: g.wagerCurrency || 'SOL',
 userId: g.player1 || 'guest',
 username: g.player1Name || (g.player1IsTest ? 'Guest' : 'Player 1'),
 walletAddress: g.p1Wallet || null,
 role: 'host',
 targetUserId: g.player2 || null,
 targetUsername: g.player2Name || null,
 targetWallet: g.p2Wallet || null,
 txSignature: g.p1DepositTx || null,
 amountSol: g.wager || 0,
 network: 'Solana',
 metadata: {
 status: g.status,
 inviteCode: g.inviteCode,
 },
 });
 }

 // B. Player 1 Deposit event (if deposit signature exists)
 if (g.p1DepositTx && !eventMap.has(`dep_p1_${g.id}`)) {
 eventMap.set(`dep_p1_${g.id}`, {
 id: `dep_p1_${g.id}`,
 timestamp: g.createdAt,
 eventType: 'deposit_p1',
 eventLabel: 'Deposit (Host)',
 status: 'confirmed',
 gameId: g.id,
 wager: g.wager || 0,
 wagerCurrency: g.wagerCurrency || 'SOL',
 userId: g.player1,
 username: g.player1Name || 'Player 1',
 walletAddress: g.p1Wallet || null,
 amountSol: g.wager || 0,
 txSignature: g.p1DepositTx,
 network: 'Solana',
 });
 }

 // C. Player 2 Join / Match Started event
 if (g.player2 || g.status === 'active' || g.status === 'finished') {
 const joinKey = `game_started_${g.id}`;
 if (!eventMap.has(joinKey)) {
 eventMap.set(joinKey, {
 id: joinKey,
 timestamp: g.updatedAt || g.createdAt,
 eventType: 'match_started',
 eventLabel: 'Match Started',
 status: 'confirmed',
 gameId: g.id,
 gameType: g.gameType || 'connect4',
 wager: g.wager || 0,
 wagerCurrency: g.wagerCurrency || 'SOL',
 userId: g.player2 || 'guest',
 username: g.player2Name || (g.player2IsTest ? 'Guest' : 'Player 2'),
 walletAddress: g.p2Wallet || null,
 role: 'opponent',
 targetUserId: g.player1,
 targetUsername: g.player1Name || 'Player 1',
 targetWallet: g.p1Wallet || null,
 txSignature: g.p2DepositTx || null,
 amountSol: g.wager || 0,
 network: 'Solana',
 metadata: {
 status: g.status,
 turn: g.turn,
 },
 });
 }
 }

 // D. Player 2 Deposit event
 if (g.p2DepositTx && !eventMap.has(`dep_p2_${g.id}`)) {
 eventMap.set(`dep_p2_${g.id}`, {
 id: `dep_p2_${g.id}`,
 timestamp: g.updatedAt || g.createdAt,
 eventType: 'deposit_p2',
 eventLabel: 'Deposit (Opponent)',
 status: 'confirmed',
 gameId: g.id,
 wager: g.wager || 0,
 wagerCurrency: g.wagerCurrency || 'SOL',
 userId: g.player2,
 username: g.player2Name || 'Player 2',
 walletAddress: g.p2Wallet || null,
 amountSol: g.wager || 0,
 txSignature: g.p2DepositTx,
 network: 'Solana',
 });
 }

 // E. Match Finished / Payout / Draw event
 if (g.status === 'finished') {
 const finishKey = `game_finished_${g.id}`;
 if (!eventMap.has(finishKey)) {
 const isDraw = g.winner === 'draw';
 const isP1Win = g.winner === g.player1;
 const winnerName = isDraw ? 'Draw' : (isP1Win ? g.player1Name : g.player2Name);
 const loserName = isDraw ? null : (isP1Win ? g.player2Name : g.player1Name);
 const loserId = isDraw ? null : (isP1Win ? g.player2 : g.player1);

 eventMap.set(finishKey, {
 id: finishKey,
 timestamp: g.updatedAt || g.createdAt,
 eventType: isDraw ? 'draw_refunded' : 'game_finished',
 eventLabel: isDraw ? 'Draw Match' : 'Match Finished',
 status: 'confirmed',
 gameId: g.id,
 gameType: g.gameType || 'connect4',
 wager: g.wager || 0,
 wagerCurrency: g.wagerCurrency || 'SOL',
 userId: isDraw ? (g.player1 || 'System') : (g.winner || 'System'),
 username: isDraw ? (g.player1Name || 'Draw') : (winnerName || 'Winner'),
 targetUserId: loserId,
 targetUsername: loserName,
 amountSol: g.wager > 0 ? (isDraw ? g.wager : g.wager * 2 * 0.99) : 0,
 houseFeeSol: g.wager > 0 ? g.wager * 2 * 0.01 : 0,
 totalPot: g.wager > 0 ? g.wager * 2 : 0,
 txSignature: g.payoutTx || g.refundTx || null,
 network: 'Solana',
 metadata: {
 winner: g.winner,
 boardSnapshot: g.board,
 },
 });
 }
 }
 }

 // 3. Generate verbose events from all user registrations
 for (const u of users) {
 if (!u.id) continue;
 const userRegKey = `user_reg_${u.id}`;
 if (!eventMap.has(userRegKey)) {
 eventMap.set(userRegKey, {
 id: userRegKey,
 timestamp: u.createdAt,
 eventType: 'user_registered',
 eventLabel: 'User Registered',
 status: 'confirmed',
 gameId: '',
 wager: 0,
 userId: u.id,
 username: u.username || 'Anonymous',
 walletAddress: u.walletAddress || null,
 role: u.role || (u.isAdmin ? 'admin' : 'player'),
 network: 'Solana',
 metadata: {
 isTestUser: !!u.isTestUser,
 isAdmin: !!u.isAdmin,
 },
 });
 }
 }

 // Convert map to array and sort chronologically descending (newest first)
 const allEvents = Array.from(eventMap.values());
 allEvents.sort((a, b) => {
 const getTime = (t: any, iso?: string) => {
 if (t?.toMillis) return t.toMillis();
 if (t?.seconds) return t.seconds * 1000;
 if (t instanceof Date) return t.getTime();
 if (iso) return new Date(iso).getTime();
 return 0;
 };
 return getTime(b.timestamp, b.isoTimestamp) - getTime(a.timestamp, a.isoTimestamp);
 });

 return allEvents;
 }, [historyEvents, games, users]);

 // User Inspector Profile Hook
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

 const handleCopyTxSignature = (sig: string) => {
 navigator.clipboard.writeText(sig);
 setCopiedTxSig(sig);
 setTimeout(() => setCopiedTxSig(null), 2000);
 };

 const handleCopyRawJson = (data: any) => {
 navigator.clipboard.writeText(JSON.stringify(data, null, 2));
 setCopiedJson(true);
 setTimeout(() => setCopiedJson(false), 2000);
 };

 // Click handler to inspect a user from anywhere (User List or Activity History)
 const handleUserClick = (userId: string, username?: string, wallet?: string | null) => {
 if (!userId) return;
 if (userId.startsWith('test_')) {
 setInspectUser({
 id: userId,
 username: username || 'Guest User',
 walletAddress: null,
 isTestUser: true,
 });
 return;
 }
 const foundUser = users.find((u) => u.id === userId);
 if (foundUser) {
 setInspectUser(foundUser);
 } else {
 setInspectUser({
 id: userId,
 username: username || 'User',
 walletAddress: wallet || null,
 isTestUser: false,
 });
 }
 };

 const handleOpponentClick = (e: MouseEvent, oppId: string | null, matchId: string) => {
 e.stopPropagation();
 if (!oppId || oppId.startsWith('test_')) {
 setTestUserToast({ matchId, message: 'Guest User (Temporary Account)' });
 setTimeout(() => {
 setTestUserToast((prev) => (prev?.matchId === matchId ? null : prev));
 }, 2500);
 return;
 }
 const foundUser = users.find((u) => u.id === oppId);
 if (foundUser) {
 setInspectUser(foundUser);
 } else {
 setInspectUser({ id: oppId, username: 'Guest Player', walletAddress: null, isTestUser: true });
 }
 };

 const handleToggleAdminRole = async (targetUser: any) => {
 if (!isOwner) return;
 if (targetUser.role === 'owner' || (!!OWNER_WALLET && targetUser.walletAddress === OWNER_WALLET)) {
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
 logError('Failed to update admin role:', e);
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
 logError('Error purging games:', e);
 } finally {
 setIsPurging(false);
 }
 };

 const handleConfirmDeleteUser = async () => {
 if (!userToDelete) return;
 if (userToDelete.role === 'owner' || (!!OWNER_WALLET && userToDelete.walletAddress === OWNER_WALLET)) {
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
 logError('Failed to delete account:', e);
 } finally {
 setIsDeleting(false);
 }
 };

 if (!isAdmin) {
 return (
 <div className="flex-1 flex flex-col items-center justify-center min-h-[70vh] gap-4">
 <ShieldAlert size={48} className="text-primary"/>
 <h1 className="text-xl font-bold">Access Restricted</h1>
 <p className="text-sm text-text-muted">Only authorized platform administrators can access this terminal.</p>
 <Link to="/"className="px-5 py-2 bg-background border border-white/10 rounded-full text-xs font-semibold cursor-pointer">
 Return to Lobby
 </Link>
 </div>
 );
 }

 // Telemetry KPI Calculations
 const totalUsers = users.length;
 const activeGames = games.filter((g) => g.status === 'active');
 const waitingGames = games.filter((g) => g.status === 'waiting');
 const finishedGames = games.filter((g) => g.status === 'finished');
 const totalVolumeSOL = finishedGames.reduce(
 (sum, g) => (g.wagerCurrency === 'SOL' && !g.refundTx && g.refundStatus !== 'completed' ? sum + (g.wager || 0) : sum),
 0
 );

 // Active Users calculation
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

 // Filtered Users
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

 // Filtered Unified Activity Stream Events
 const filteredHistoryEvents = useMemo(() => {
 return unifiedHistoryEvents.filter((ev) => {
 // 1. Category Filter
 if (categoryFilter === 'rooms') {
 if (ev.eventType !== 'created' && ev.eventType !== 'cancelled') return false;
 } else if (categoryFilter === 'matches') {
 if (ev.eventType !== 'match_started' && ev.eventType !== 'game_finished' && ev.eventType !== 'draw_refunded') return false;
 } else if (categoryFilter === 'users') {
 if (ev.eventType !== 'user_registered') return false;
 } else if (categoryFilter === 'deposits') {
 if (ev.eventType !== 'deposit_p1' && ev.eventType !== 'deposit_p2') return false;
 } else if (categoryFilter === 'payouts') {
 if (ev.eventType !== 'paid_out' && ev.eventType !== 'game_finished') return false;
 } else if (categoryFilter === 'refunds') {
 if (ev.eventType !== 'refunded' && ev.eventType !== 'draw_refunded') return false;
 } else if (categoryFilter === 'resignations') {
 if (ev.eventType !== 'resigned' && ev.eventType !== 'timeout_win') return false;
 } else if (categoryFilter === 'cron') {
 if (ev.eventType !== 'cron_recovery') return false;
 }

 // 2. Status Filter
 if (statusFilter !== 'all') {
 if (statusFilter === 'confirmed' && ev.status !== 'confirmed') return false;
 if (statusFilter === 'processing' && ev.status !== 'processing' && ev.status !== 'pending') return false;
 if (statusFilter === 'failed' && ev.status !== 'failed') return false;
 }

 // 3. Search Term Filter across Game ID, Username, User ID, Wallet, Tx Signature, Event Label
 if (historySearchTerm.trim()) {
 const q = historySearchTerm.toLowerCase().trim();
 const matches =
 (ev.gameId && ev.gameId.toLowerCase().includes(q)) ||
 (ev.username && ev.username.toLowerCase().includes(q)) ||
 (ev.userId && ev.userId.toLowerCase().includes(q)) ||
 (ev.targetUsername && ev.targetUsername.toLowerCase().includes(q)) ||
 (ev.targetUserId && ev.targetUserId.toLowerCase().includes(q)) ||
 (ev.walletAddress && ev.walletAddress.toLowerCase().includes(q)) ||
 (ev.targetWallet && ev.targetWallet.toLowerCase().includes(q)) ||
 (ev.txSignature && ev.txSignature.toLowerCase().includes(q)) ||
 (ev.eventLabel && ev.eventLabel.toLowerCase().includes(q)) ||
 (ev.eventType && ev.eventType.toLowerCase().includes(q));

 if (!matches) return false;
 }

 return true;
 });
 }, [unifiedHistoryEvents, categoryFilter, statusFilter, historySearchTerm]);

 return (
 <div className="min-h-screen flex flex-col bg-black text-text-primary antialiased w-full overflow-y-auto">
 <main className="flex-1 w-full max-w-7xl mx-auto px-4 md:px-8 pt-24 sm:pt-28 md:pt-32 pb-16 space-y-6">
 
 {/* Top Header */}
 <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5">
 <div className="space-y-1">
 <div className="flex items-center gap-3">
 <button
 onClick={() => navigate('/')}
 className="p-2 rounded-full bg-background border border-white/10 hover:border-primary text-text-secondary hover:text-white transition-colors cursor-pointer"
 title="Back to Lobby"
 >
 <ArrowLeft size={15} />
 </button>
 <h1 className="font-headline-lg text-2xl sm:text-3xl text-white font-bold tracking-tight">
 Admin Terminal
 </h1>
 </div>
 <p className="text-xs text-text-muted">
 User database, permissions, live activity stream, and on-chain Solscan transaction verification.
 </p>
 </div>

 {/* Caution-styled Purge Finished Games Button */}
 <div className="flex items-center gap-3">
 <button
 onClick={() => setShowPurgeModal(true)}
 className="px-4 py-2 bg-red-950/30 hover:bg-red-900/50 border border-red-500/40 hover:border-red-500/70 text-red-400 hover:text-red-300 text-xs font-semibold rounded-full transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_12px_rgba(239,68,68,0.15)] hover:shadow-[0_0_16px_rgba(239,68,68,0.35)]"
 title="Caution: Permanently deletes all completed games from the database"
 >
 <Warning size={14} className="text-amber-400 animate-pulse shrink-0"/>
 <span>Purge Finished Games</span>
 </button>
 </div>
 </div>

 {/* Telemetry KPI Cards */}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
 
 {/* Card 1: Total Users */}
 <div className="bg-background border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
 <div className="flex justify-between items-start mb-3">
 <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Registered Users</span>
 <Users size={16} className="text-primary"/>
 </div>
 <div className="font-headline-lg text-3xl font-bold text-white mb-1">
 {totalUsers}
 </div>
 <div className="text-xs text-text-muted flex items-center gap-1.5">
 <Activity size={12} className="text-emerald-400"/> Platform accounts
 </div>
 </div>

 {/* Card 2: Active Games */}
 <div className="bg-background border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
 <div className="flex justify-between items-start mb-3">
 <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Live Matches</span>
 <GameController size={16} className="text-emerald-400"/>
 </div>
 <div className="font-headline-lg text-3xl font-bold text-white mb-1">
 {activeGames.length}
 </div>
 <div className="text-xs text-text-muted">
 Currently playing
 </div>
 </div>

 {/* Card 3: Finished Games */}
 <div className="bg-background border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
 <div className="flex justify-between items-start mb-3">
 <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Finished Matches</span>
 <Trophy size={16} className="text-primary"/>
 </div>
 <div className="font-headline-lg text-3xl font-bold text-white mb-1">
 {finishedGames.length}
 </div>
 <div className="text-xs text-text-muted">
 Lifetime completed games
 </div>
 </div>

 {/* Card 4: Total Volume */}
 <div className="bg-background border border-white/10 p-5 rounded-2xl relative overflow-hidden group hover:border-white/20 transition-colors">
 <div className="flex justify-between items-start mb-3">
 <span className="text-xs text-text-muted uppercase tracking-wider font-semibold">Total Stakes</span>
 <Coins size={16} className="text-primary"/>
 </div>
 <div className="font-headline-lg text-3xl font-bold text-primary mb-1">
 {totalVolumeSOL.toFixed(2)} <span className="text-base text-text-muted font-normal">SOL</span>
 </div>
 <div className="text-xs text-text-muted">
 Settled finished match wagers
 </div>
 </div>
 </div>

 {/* 2-Column Responsive Layout: Default User Database (Left) + Live Activity Chat Box (Right) */}
 <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
 
 {/* LEFT / MAIN COLUMN: User Database & Permissions (Default View) */}
 <div className="lg:col-span-7 xl:col-span-8 space-y-4">
 <section className="bg-background border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
 
 {/* Table Toolbar */}
 <div className="p-5 border-b border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-[#181818]">
 
 {/* Left: Title */}
 <div className="flex items-center gap-3 flex-1 w-full justify-start">
 <div className="p-2 rounded-xl bg-primary/10 border border-primary/30 text-primary">
 <Users size={18} weight="bold"/>
 </div>
 <div>
 <h2 className="font-headline-lg text-lg text-white font-bold tracking-tight">
 User Database
 </h2>
 <p className="text-xs text-text-muted">
 Showing {filteredUsers.length} of {users.length} accounts
 </p>
 </div>
 </div>

 {/* Center: Sort / Filter Pills */}
 <div className="flex justify-center shrink-0 w-full sm:w-auto">
 <div className="flex bg-black p-1 rounded-full border border-white/10 text-xs">
 <button
 onClick={() => setFilterMode('all')}
 className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
 filterMode === 'all'
 ? 'bg-white/15 text-white font-bold'
 : 'text-text-muted hover:text-white'
 }`}
 >
 All ({users.length})
 </button>
 <button
 onClick={() => setFilterMode('active')}
 className={`px-3 py-1 rounded-full transition-all cursor-pointer ${
 filterMode === 'active'
 ? 'bg-primary/20 text-primary font-bold'
 : 'text-text-muted hover:text-white'
 }`}
 >
 Active ({activeUserIds.size})
 </button>
 </div>
 </div>

 {/* Right: Search Input */}
 <div className="flex-1 w-full flex sm:justify-end">
 <div className="relative w-full sm:w-60">
 <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"/>
 <input
 id="adminSearchInput"
 name="adminSearchQuery"
 autoComplete="off"
 type="text"
 placeholder="Search username or wallet..."
 value={searchTerm}
 onChange={(e) => setSearchTerm(e.target.value)}
 className="w-full bg-black border border-white/10 focus:border-primary text-xs text-white pl-8 pr-3 py-1.5 rounded-full outline-none transition-all placeholder:text-text-muted"
 />
 </div>
 </div>
 </div>

 {/* Users Table */}
 {isLoadingUsers ? (
 <div className="p-16 flex flex-col items-center justify-center gap-3">
 <CircleNotch className="animate-spin text-primary"size={32} />
 <p className="text-xs text-text-muted">Loading user database...</p>
 </div>
 ) : filteredUsers.length === 0 ? (
 <div className="p-16 text-center text-text-muted text-sm space-y-1">
 <p className="text-white font-semibold">No users matching search</p>
 <p className="text-xs">Try clearing the search query or changing filters.</p>
 </div>
 ) : (
 <div className="overflow-x-auto">
 <table className="w-full text-left border-collapse">
 <thead>
 <tr className="bg-[#111111] border-b border-white/10 text-text-muted text-xs uppercase tracking-wider">
 <th className="py-3.5 px-4 font-semibold">User</th>
 <th className="py-3.5 px-4 font-semibold">Role</th>
 <th className="py-3.5 px-4 font-semibold">Wallet Address</th>
 <th className="py-3.5 px-4 font-semibold">Registered</th>
 <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
 </tr>
 </thead>
 <tbody className="text-xs divide-y divide-white/5 font-body-md">
 {filteredUsers.map((u) => {
 const regDate = u.createdAt?.toDate
 ? u.createdAt.toDate().toLocaleDateString()
 : 'Earlier';
 const isTargetOwner = u.role === 'owner' || (!!OWNER_WALLET && u.walletAddress === OWNER_WALLET);
 const isTargetAdmin = isTargetOwner || u.isAdmin || u.role === 'admin';
 const isTest = u.isTestUser || !u.walletAddress;
 const displayLabel = isTest ? (u.username || 'Guest') : `@${u.username}`;

 return (
 <tr
 key={u.id}
 onClick={() => setInspectUser(u)}
 className="hover:bg-[#1c1c1c] transition-colors group cursor-pointer"
 title="Click to view full user profile & match history"
 >
 {/* User Identity */}
 <td className="py-3.5 px-4">
 <div className="flex items-center gap-2.5">
 <div className="w-7 h-7 rounded-full border border-white/10 bg-surface-container overflow-hidden flex items-center justify-center font-bold text-xs text-primary shrink-0">
 {u.avatarUrl ? (
 <img src={u.avatarUrl} alt=""className="w-full h-full object-cover"/>
 ) : (
 u.username ? u.username.substring(0, 2).toUpperCase() : 'U'
 )}
 </div>
 <div className="flex items-center gap-1.5 min-w-0">
 <span className="font-semibold text-white group-hover:text-primary transition-colors truncate">
 {displayLabel}
 </span>
 {isTest && (
 <span className="text-[11px] text-primary px-1.5 py-0.2 rounded-full bg-primary/10 border border-primary/30 shrink-0">
 Guest
 </span>
 )}
 </div>
 </div>
 </td>

 {/* Role Badge */}
 <td className="py-3.5 px-4 whitespace-nowrap"onClick={(e) => e.stopPropagation()}>
 {isTargetOwner ? (
 <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 font-bold text-[12px] uppercase">
 <Crown size={10} /> Owner
 </span>
 ) : isTargetAdmin ? (
 <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/15 border border-primary/40 text-primary font-bold text-[12px] uppercase">
 <ShieldCheck size={10} /> Admin
 </span>
 ) : (
 <span className="text-text-muted text-xs">Player</span>
 )}
 </td>

 {/* Wallet Address with Solscan Link */}
 <td className="py-3.5 px-4 text-text-secondary whitespace-nowrap"onClick={(e) => e.stopPropagation()}>
 {u.walletAddress ? (
 <SolscanAccountLink
 walletAddress={u.walletAddress}
 onCopy={(addr) => handleCopyWallet(addr, `user_wallet_${u.id}`)}
 copied={copiedId === `user_wallet_${u.id}`}
 />
 ) : (
 <span className="text-text-muted italic text-xs">No wallet</span>
 )}
 </td>

 {/* Registered Date */}
 <td className="py-3.5 px-4 text-text-muted whitespace-nowrap"onClick={(e) => e.stopPropagation()}>
 {regDate}
 </td>

 {/* Actions: Make Admin (Owner Only) & Delete */}
 <td className="py-3.5 px-4 text-right whitespace-nowrap"onClick={(e) => e.stopPropagation()}>
 <div className="flex items-center justify-end gap-1.5">
 {isOwner && !isTargetOwner && (
 <button
 onClick={() => handleToggleAdminRole(u)}
 disabled={roleUpdatingId === u.id}
 className={`px-2 py-1 rounded-full text-[12px] font-semibold flex items-center gap-1 border transition-all cursor-pointer shrink-0 ${
 isTargetAdmin
 ? 'bg-neutral-800 hover:bg-neutral-700 text-text-secondary border-white/10'
 : 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/30'
 }`}
 title={isTargetAdmin ? 'Revoke Admin Permissions' : 'Grant Admin Permissions'}
 >
 {roleUpdatingId === u.id ? (
 <CircleNotch size={10} className="animate-spin"/>
 ) : isTargetAdmin ? (
 <>
 <ShieldMinus size={10} /> Revoke
 </>
 ) : (
 <>
 <ShieldCheck size={10} /> Make Admin
 </>
 )}
 </button>
 )}

 {!isTargetOwner && (
 <button
 onClick={() => {
 setUserToDelete(u);
 setDeleteConfirmInput('');
 }}
 className="p-1.5 rounded-full text-text-muted hover:text-red-400 hover:bg-red-950/40 border border-transparent hover:border-red-900/50 transition-colors cursor-pointer"
 title="Delete Account"
 >
 <Trash2 size={13} />
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
 </div>

 {/* RIGHT COLUMN: Live Activity History (Chat-like Box constantly streaming events) */}
 <div className="lg:col-span-5 xl:col-span-4 flex flex-col space-y-4">
 <section className="bg-background border border-white/10 rounded-2xl flex flex-col h-[750px] shadow-2xl overflow-hidden">
 
 {/* Chat-like Header (No green dot) */}
 <div className="p-4 border-b border-white/10 bg-[#181818] flex flex-col gap-3 shrink-0">
 <div className="flex items-center justify-between">
 <div className="flex items-center gap-2">
 <Broadcast size={16} className="text-primary"/>
 <h3 className="font-headline-lg text-sm text-white font-bold tracking-tight">
 Live Activity Stream
 </h3>
 </div>
 <span className="px-2 py-0.5 rounded-full bg-black/60 border border-white/10 text-[12px] text-text-muted">
 {filteredHistoryEvents.length} events
 </span>
 </div>

 {/* Stream Controls: Search & Category Chips */}
 <div className="space-y-2">
 <div className="relative w-full">
 <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"/>
 <input
 id="activityStreamSearch"
 name="activityStreamSearchQuery"
 autoComplete="off"
 type="text"
 placeholder="Filter all activity..."
 value={historySearchTerm}
 onChange={(e) => setHistorySearchTerm(e.target.value)}
 className="w-full bg-black border border-white/10 focus:border-primary text-xs text-white pl-8 pr-7 py-1.5 rounded-full outline-none transition-all placeholder:text-text-muted"
 />
 {historySearchTerm && (
 <button
 onClick={() => setHistorySearchTerm('')}
 className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-white"
 >
 <X size={11} />
 </button>
 )}
 </div>

 {/* Verbose Category Filter Bar */}
 <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[12px] no-scrollbar">
 <button
 onClick={() => setCategoryFilter('all')}
 className={`px-2.5 py-0.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
 categoryFilter === 'all'
 ? 'bg-white/20 text-white font-bold'
 : 'bg-black text-text-muted hover:text-white border border-white/5'
 }`}
 >
 All ({unifiedHistoryEvents.length})
 </button>
 <button
 onClick={() => setCategoryFilter('rooms')}
 className={`px-2.5 py-0.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
 categoryFilter === 'rooms'
 ? 'bg-purple-500/25 text-purple-300 font-bold border border-purple-500/40'
 : 'bg-black text-text-muted hover:text-purple-300 border border-white/5'
 }`}
 >
 Rooms
 </button>
 <button
 onClick={() => setCategoryFilter('matches')}
 className={`px-2.5 py-0.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
 categoryFilter === 'matches'
 ? 'bg-blue-500/25 text-blue-300 font-bold border border-blue-500/40'
 : 'bg-black text-text-muted hover:text-blue-300 border border-white/5'
 }`}
 >
 Matches
 </button>
 <button
 onClick={() => setCategoryFilter('users')}
 className={`px-2.5 py-0.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
 categoryFilter === 'users'
 ? 'bg-teal-500/25 text-teal-300 font-bold border border-teal-500/40'
 : 'bg-black text-text-muted hover:text-teal-300 border border-white/5'
 }`}
 >
 Users
 </button>
 <button
 onClick={() => setCategoryFilter('deposits')}
 className={`px-2.5 py-0.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
 categoryFilter === 'deposits'
 ? 'bg-sky-500/25 text-sky-300 font-bold border border-sky-500/40'
 : 'bg-black text-text-muted hover:text-sky-300 border border-white/5'
 }`}
 >
 Deposits
 </button>
 <button
 onClick={() => setCategoryFilter('payouts')}
 className={`px-2.5 py-0.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
 categoryFilter === 'payouts'
 ? 'bg-emerald-500/25 text-emerald-300 font-bold border border-emerald-500/40'
 : 'bg-black text-text-muted hover:text-emerald-300 border border-white/5'
 }`}
 >
 Payouts
 </button>
 <button
 onClick={() => setCategoryFilter('refunds')}
 className={`px-2.5 py-0.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
 categoryFilter === 'refunds'
 ? 'bg-amber-500/25 text-amber-300 font-bold border border-amber-500/40'
 : 'bg-black text-text-muted hover:text-amber-300 border border-white/5'
 }`}
 >
 Refunds
 </button>
 <button
 onClick={() => setCategoryFilter('resignations')}
 className={`px-2.5 py-0.5 rounded-full transition-all cursor-pointer whitespace-nowrap ${
 categoryFilter === 'resignations'
 ? 'bg-red-500/25 text-red-300 font-bold border border-red-500/40'
 : 'bg-black text-text-muted hover:text-red-300 border border-white/5'
 }`}
 >
 Resigns
 </button>
 </div>
 </div>
 </div>

 {/* Chat Message / Event Feed List */}
 <div className="flex-1 p-3 overflow-y-auto space-y-2.5 bg-[#121212] min-h-0">
 {isLoadingHistory && filteredHistoryEvents.length === 0 ? (
 <div className="h-full flex flex-col items-center justify-center gap-2 p-6 text-center">
 <CircleNotch className="animate-spin text-primary"size={24} />
 <p className="text-xs text-text-muted">Aggregating live events across platform...</p>
 </div>
 ) : filteredHistoryEvents.length === 0 ? (
 <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
 <ChatCircleText size={32} className="text-text-muted opacity-40 mx-auto"/>
 <p className="text-xs font-semibold text-white">No activity events recorded yet</p>
 <p className="text-xs text-text-muted">
 {historySearchTerm || categoryFilter !== 'all' || statusFilter !== 'all'
 ? 'No activity events matching your current filter.'
 : 'Platform events will stream here live.'}
 </p>
 </div>
 ) : (
 filteredHistoryEvents.map((ev) => {
 const badge = getEventBadgeProps(ev.eventType);
 const relativeTime = formatRelativeTime(ev.timestamp, ev.isoTimestamp);
 const fullTime = formatFullTimestamp(ev.timestamp, ev.isoTimestamp);
 const hasGameId = !!ev.gameId && ev.gameId.length > 0;

 return (
 <div
 key={ev.id}
 onClick={() => setSelectedEvent(ev)}
 className="p-3 rounded-xl bg-[#181818] hover:bg-[#202020] border border-white/5 hover:border-white/15 transition-all text-xs space-y-2 cursor-pointer group shadow-sm"
 >
 {/* Event Card Top Row: Badge + Timestamp + Inspect Action */}
 <div className="flex items-center justify-between gap-2">
 <div className="flex items-center gap-1.5 flex-wrap">
 <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-bold uppercase tracking-wider ${badge.className}`}>
 {badge.icon}
 <span>{badge.label}</span>
 </span>
 <StatusBadge status={ev.status} />
 </div>

 <div className="flex items-center gap-1 text-text-muted text-[12px] shrink-0"title={fullTime}>
 <Clock size={10} />
 <span>{relativeTime}</span>
 </div>
 </div>

 {/* Super Verbose Event Description */}
 <div className="space-y-1">
 <div className="flex items-center gap-1.5 flex-wrap text-text-secondary leading-relaxed">
 {/* Clickable Actor User */}
 <button
 onClick={(e) => {
 e.stopPropagation();
 handleUserClick(ev.userId, ev.username, ev.walletAddress);
 }}
 className="font-bold text-white hover:text-primary transition-colors cursor-pointer underline-offset-2 hover:underline"
 title={`Inspect @${ev.username || ev.userId} profile`}
 >
 @{ev.username || ev.userId || 'System'}
 </button>

 {/* Verbose Action Descriptions */}
 {ev.eventType === 'created' && (
 <span className="text-text-muted">
 created Connect 4 room
 </span>
 )}
 {ev.eventType === 'deposit_p1' && (
 <span className="text-text-muted">
 deposited stake for room
 </span>
 )}
 {ev.eventType === 'deposit_p2' && (
 <span className="text-text-muted">
 deposited match stake for room
 </span>
 )}
 {ev.eventType === 'match_started' && (
 <span className="text-text-muted">
 joined and started match with
 </span>
 )}
 {ev.eventType === 'game_finished' && (
 <span className="text-emerald-400 font-semibold">
 won match against
 </span>
 )}
 {ev.eventType === 'paid_out' && (
 <span className="text-emerald-400 font-semibold">
 received winning payout vs
 </span>
 )}
 {ev.eventType === 'refunded' && (
 <span className="text-amber-400">
 received cancellation refund for
 </span>
 )}
 {ev.eventType === 'draw_refunded' && (
 <span className="text-amber-400">
 played a draw match with
 </span>
 )}
 {ev.eventType === 'resigned' && (
 <span className="text-red-400">
 resigned match against
 </span>
 )}
 {ev.eventType === 'timeout_win' && (
 <span className="text-red-400">
 won on opponent turn timeout vs
 </span>
 )}
 {ev.eventType === 'cancelled' && (
 <span className="text-text-muted">
 cancelled waiting match
 </span>
 )}
 {ev.eventType === 'user_registered' && (
 <span className="text-teal-300">
 registered new account on platform
 </span>
 )}
 {ev.eventType === 'cron_recovery' && (
 <span className="text-indigo-300">
 server automated recovery processed
 </span>
 )}

 {/* Clickable Target User */}
 {ev.targetUsername && (
 <button
 onClick={(e) => {
 e.stopPropagation();
 handleUserClick(ev.targetUserId || '', ev.targetUsername || '', ev.targetWallet);
 }}
 className="font-bold text-white hover:text-primary transition-colors cursor-pointer underline-offset-2 hover:underline"
 title={`Inspect @${ev.targetUsername} profile`}
 >
 @{ev.targetUsername}
 </button>
 )}

 {/* Game ID Badge */}
 {hasGameId && (
 <span className="text-[12px] text-text-muted bg-black/60 px-1.5 py-0.5 rounded border border-white/5">
 #{ev.gameId.substring(0, 6).toUpperCase()}
 </span>
 )}
 </div>

 {/* Financial & Metadata Info */}
 <div className="flex items-center justify-between gap-2 pt-0.5">
 <div>
 {ev.amountSol !== undefined && ev.amountSol !== null && ev.amountSol > 0 ? (
 <span className="text-primary font-bold text-xs">
 <SolAmount amount={ev.amountSol} suffix="SOL"tooltipPosition="bottom"tooltipAlign="left"/>
 </span>
 ) : ev.wager && ev.wager > 0 ? (
 <span className="text-text-secondary text-xs">
 Stake: <SolAmount amount={ev.wager} suffix="SOL"tooltipPosition="bottom"tooltipAlign="left"/>
 </span>
 ) : ev.eventType === 'user_registered' ? (
 <span className="text-text-muted text-[12px]">
 {ev.walletAddress ? `Wallet: ${ev.walletAddress.substring(0, 4)}...${ev.walletAddress.substring(ev.walletAddress.length - 4)}` : 'Guest Account'}
 </span>
 ) : (
 <span className="text-text-muted text-[12px] italic">Free (0 SOL)</span>
 )}
 </div>

 {/* On-Chain Solscan Pill */}
 {ev.txSignature && (
 <div onClick={(e) => e.stopPropagation()}>
 <SolscanTxPill
 txSignature={ev.txSignature}
 solscanUrl={ev.solscanUrl}
 onCopy={handleCopyTxSignature}
 copied={copiedTxSig === ev.txSignature}
 />
 </div>
 )}
 </div>
 </div>

 {/* Interactive Footer Row: Spectate Game Button & Inspect Button */}
 <div className="flex items-center justify-between pt-1 border-t border-white/5">
 {/*"Game creation"Spectate Button */}
 {hasGameId ? (
 <button
 onClick={(e) => {
 e.stopPropagation();
 navigate(`/game/${ev.gameId}`);
 }}
 className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/15 hover:bg-primary/30 text-primary border border-primary/30 hover:border-primary text-[12px] font-bold transition-all cursor-pointer shadow-[0_0_8px_rgba(255,77,77,0.2)] hover:scale-105"
 title={`Spectate Match #${ev.gameId.substring(0, 6).toUpperCase()}`}
 >
 <Eye size={11} className="shrink-0"/>
 <span>Spectate Match</span>
 </button>
 ) : (
 <span className="text-[12px] text-text-muted italic">Account Activity</span>
 )}

 {/* Quick Inspect Details */}
 <button
 onClick={() => setSelectedEvent(ev)}
 className="text-text-muted hover:text-white text-[12px] flex items-center gap-1 transition-colors"
 title="Inspect full payload & board snapshot"
 >
 <span>Inspect</span>
 <ArrowUpRight size={10} />
 </button>
 </div>
 </div>
 );
 })
 )}
 <div ref={activityFeedEndRef} />
 </div>

 {/* Chat-like Footer Bar (No green dot) */}
 <div className="p-2.5 border-t border-white/10 bg-[#161616] text-[12px] text-text-muted flex items-center justify-between shrink-0">
 <span>Streaming live platform activity</span>
 {unifiedHistoryEvents.length > 0 && (
 <button
 onClick={() => {
 setCategoryFilter('all');
 setHistorySearchTerm('');
 }}
 className="text-primary hover:text-white transition-colors cursor-pointer"
 >
 Reset Filter
 </button>
 )}
 </div>
 </section>
 </div>

 </div>
 </main>

 {/* Expandable Event Inspector Modal */}
 <AnimatePresence>
 {selectedEvent && (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={() => setSelectedEvent(null)}
 className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 overflow-y-auto"
 >
 <motion.div
 initial={{ scale: 0.95, y: 15 }}
 animate={{ scale: 1, y: 0 }}
 exit={{ scale: 0.95, y: 15 }}
 onClick={(e) => e.stopPropagation()}
 className="w-full max-w-2xl bg-[#141414] border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.9)] rounded-3xl overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[80vh] my-auto relative"
 >
 {/* Header */}
 <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between bg-neutral-900 shrink-0">
 <div className="flex items-center gap-3">
 <div className="p-2.5 rounded-2xl bg-primary/10 border border-primary/30 text-primary">
 <Lightning size={20} weight="bold"/>
 </div>
 <div>
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="text-lg font-bold text-white font-headline-lg">
 {selectedEvent.eventLabel || selectedEvent.eventType}
 </h3>
 <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full border text-[12px] font-bold uppercase tracking-wider ${getEventBadgeProps(selectedEvent.eventType).className}`}>
 {getEventBadgeProps(selectedEvent.eventType).label}
 </span>
 </div>
 <p className="text-xs text-text-muted mt-0.5">
 Event ID: {selectedEvent.id}
 </p>
 </div>
 </div>

 <button
 onClick={() => setSelectedEvent(null)}
 className="w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center border border-white/10 transition-colors cursor-pointer"
 title="Close Inspector"
 >
 <X size={15} />
 </button>
 </div>

 {/* Scrollable Content */}
 <div className="flex-1 p-5 sm:p-6 overflow-y-auto space-y-6 min-h-0 bg-[#121212]">
 
 {/* 1. Key Metrics 4-Box Grid */}
 <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
 <div className="bg-black/60 p-3.5 rounded-2xl border border-white/5 space-y-1">
 <span className="text-[12px] uppercase text-text-muted block font-semibold">Game ID</span>
 <span className="text-sm font-bold text-white block truncate">
 {selectedEvent.gameId ? `#${selectedEvent.gameId.substring(0, 8).toUpperCase()}` : 'N/A'}
 </span>
 </div>
 <div className="bg-black/60 p-3.5 rounded-2xl border border-white/5 space-y-1">
 <span className="text-[12px] uppercase text-text-muted block font-semibold">Status</span>
 <StatusBadge status={selectedEvent.status} />
 </div>
 <div className="bg-black/60 p-3.5 rounded-2xl border border-white/5 space-y-1">
 <span className="text-[12px] uppercase text-text-muted block font-semibold">Wager Stake</span>
 <span className="text-sm font-bold text-primary block">
 {selectedEvent.wager && selectedEvent.wager > 0 ? `${selectedEvent.wager} SOL` : 'Free (0 SOL)'}
 </span>
 </div>
 <div className="bg-black/60 p-3.5 rounded-2xl border border-white/5 space-y-1">
 <span className="text-[12px] uppercase text-text-muted block font-semibold">Spectate</span>
 {selectedEvent.gameId ? (
 <button
 onClick={() => {
 setSelectedEvent(null);
 navigate(`/game/${selectedEvent.gameId}`);
 }}
 className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline cursor-pointer"
 >
 <span>Open Game</span>
 <Eye size={12} />
 </button>
 ) : (
 <span className="text-xs text-text-muted">N/A</span>
 )}
 </div>
 </div>

 {/* 2. On-Chain Solscan Verification */}
 <div className="bg-black p-4 sm:p-5 rounded-2xl border border-white/10 space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
 <Receipt size={14} className="text-primary"/>
 Solana On-Chain Transaction
 </span>
 {selectedEvent.txSignature && (
 <a
 href={selectedEvent.solscanUrl || `https://solscan.io/tx/${selectedEvent.txSignature}?cluster=devnet`}
 target="_blank"
 rel="noopener noreferrer"
 className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all shadow-[0_0_12px_rgba(255,77,77,0.4)]"
 >
 <span>View on Solscan</span>
 <ArrowSquareOut size={12} />
 </a>
 )}
 </div>

 {selectedEvent.txSignature ? (
 <div className="space-y-2">
 <div className="p-3 bg-neutral-900 rounded-xl border border-white/5 flex items-center justify-between gap-2">
 <span className="text-xs text-text-secondary break-all select-all font-mono tracking-tight">
 {selectedEvent.txSignature}
 </span>
 <button
 onClick={() => handleCopyTxSignature(selectedEvent.txSignature!)}
 className="p-1.5 text-text-muted hover:text-white transition-colors shrink-0"
 title="Copy signature"
 >
 {copiedTxSig === selectedEvent.txSignature ? (
 <Check size={14} className="text-emerald-400"/>
 ) : (
 <Copy size={14} />
 )}
 </button>
 </div>

 {/* Financial breakdown */}
 <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 text-xs">
 {selectedEvent.amountSol !== undefined && selectedEvent.amountSol !== null && (
 <div className="p-2.5 bg-neutral-950 rounded-xl border border-white/5">
 <span className="text-[12px] text-text-muted block uppercase">Amount Transferred</span>
 <span className="text-sm font-bold text-emerald-400">
 <SolAmount amount={selectedEvent.amountSol} suffix="SOL"tooltipPosition="bottom"tooltipAlign="left"/>
 </span>
 </div>
 )}
 {selectedEvent.totalPot !== undefined && selectedEvent.totalPot !== null && (
 <div className="p-2.5 bg-neutral-950 rounded-xl border border-white/5">
 <span className="text-[12px] text-text-muted block uppercase">Total Escrow Pot</span>
 <span className="text-sm font-bold text-white">
 {selectedEvent.totalPot} SOL
 </span>
 </div>
 )}
 {selectedEvent.houseFeeSol !== undefined && selectedEvent.houseFeeSol !== null && (
 <div className="p-2.5 bg-neutral-950 rounded-xl border border-white/5">
 <span className="text-[12px] text-text-muted block uppercase">1% House Fee</span>
 <span className="text-sm font-bold text-amber-400">
 {selectedEvent.houseFeeSol} SOL
 </span>
 </div>
 )}
 </div>
 </div>
 ) : (
 <p className="text-xs text-text-muted italic py-1">
 Off-chain or free wager action. No Solana transaction signature generated for this event.
 </p>
 )}
 </div>

 {/* 3. Actors & Counterparties */}
 <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
 
 {/* Primary Actor */}
 <div className="bg-black/60 p-3.5 rounded-2xl border border-white/5 space-y-1.5 min-w-0 overflow-hidden">
 <span className="text-[12px] uppercase text-text-muted font-bold block truncate">
 Primary Actor ({selectedEvent.role || 'Initiator'})
 </span>
 <button
 onClick={() => {
 setSelectedEvent(null);
 handleUserClick(selectedEvent.userId, selectedEvent.username, selectedEvent.walletAddress);
 }}
 className="text-sm font-bold text-white hover:text-primary transition-colors cursor-pointer text-left block truncate w-full"
 title={`Inspect @${selectedEvent.username || selectedEvent.userId} profile`}
 >
 @{selectedEvent.username || 'System'}
 </button>
 <div className="text-xs text-text-muted min-w-0 break-all leading-snug">
 User ID: <span className="text-text-secondary select-all break-all font-mono tracking-tight">{selectedEvent.userId || 'N/A'}</span>
 </div>
 {selectedEvent.walletAddress ? (
 <div className="pt-0.5 text-xs min-w-0">
 <SolscanAccountLink
 walletAddress={selectedEvent.walletAddress}
 onCopy={(addr) => handleCopyWallet(addr, `inspector_p1_${selectedEvent.id}`)}
 copied={copiedId === `inspector_p1_${selectedEvent.id}`}
 truncate={true}
 />
 </div>
 ) : (
 <div className="text-xs text-text-muted italic">No wallet address recorded</div>
 )}
 </div>

 {/* Counterparty / Target */}
 <div className="bg-black/60 p-3.5 rounded-2xl border border-white/5 space-y-1.5 min-w-0 overflow-hidden">
 <span className="text-[12px] uppercase text-text-muted font-bold block truncate">
 Target / Opponent
 </span>
 {selectedEvent.targetUsername ? (
 <button
 onClick={() => {
 setSelectedEvent(null);
 handleUserClick(selectedEvent.targetUserId || '', selectedEvent.targetUsername || '', selectedEvent.targetWallet);
 }}
 className="text-sm font-bold text-white hover:text-primary transition-colors cursor-pointer text-left block truncate w-full"
 title={`Inspect @${selectedEvent.targetUsername} profile`}
 >
 @{selectedEvent.targetUsername}
 </button>
 ) : (
 <div className="text-sm font-bold text-white">N/A</div>
 )}
 <div className="text-xs text-text-muted min-w-0 break-all leading-snug">
 Target ID: <span className="text-text-secondary select-all break-all font-mono tracking-tight">{selectedEvent.targetUserId || 'N/A'}</span>
 </div>
 {selectedEvent.targetWallet ? (
 <div className="pt-0.5 text-xs min-w-0">
 <SolscanAccountLink
 walletAddress={selectedEvent.targetWallet}
 onCopy={(addr) => handleCopyWallet(addr, `inspector_p2_${selectedEvent.id}`)}
 copied={copiedId === `inspector_p2_${selectedEvent.id}`}
 truncate={true}
 />
 </div>
 ) : (
 <div className="text-xs text-text-muted italic">No counterparty wallet</div>
 )}
 </div>
 </div>

 {/* 4. Connect-4 Board Snapshot View (if present) */}
 {selectedEvent.metadata?.boardSnapshot && (
 <div className="space-y-3">
 <div className="flex items-center justify-between">
 <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
 <GameController size={14} className="text-primary"/>
 Match Board Snapshot
 </span>
 {selectedEvent.metadata.winner && (
 <span className="text-xs font-bold text-primary">
 Winner: {selectedEvent.metadata.winner === 'draw' ? 'Draw (Tie)' : `@${selectedEvent.metadata.winner}`}
 </span>
 )}
 </div>
 <div className="flex justify-center">
 <BoardSnapshotView board={selectedEvent.metadata.boardSnapshot} />
 </div>
 </div>
 )}

 {/* 5. Raw Event JSON Inspector */}
 <div className="space-y-2">
 <div className="flex items-center justify-between">
 <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
 <Code size={14} className="text-primary"/>
 Raw Event Payload (JSON)
 </span>
 <button
 onClick={() => handleCopyRawJson(selectedEvent)}
 className="px-3 py-1 rounded-full bg-neutral-800 hover:bg-neutral-700 text-text-secondary hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all border border-white/10 cursor-pointer"
 >
 {copiedJson ? (
 <>
 <Check size={12} className="text-emerald-400"/>
 <span className="text-emerald-400">Copied</span>
 </>
 ) : (
 <>
 <Copy size={12} />
 <span>Copy JSON</span>
 </>
 )}
 </button>
 </div>
 <pre className="bg-black p-4 rounded-2xl border border-white/10 text-xs text-emerald-400/90 overflow-x-auto select-all max-h-56 leading-relaxed font-mono">
 {JSON.stringify(selectedEvent, null, 2)}
 </pre>
 </div>
 </div>

 {/* Footer Actions */}
 <div className="p-4 border-t border-white/10 bg-neutral-900 flex justify-between items-center shrink-0">
 {selectedEvent.gameId ? (
 <button
 onClick={() => {
 setSelectedEvent(null);
 navigate(`/game/${selectedEvent.gameId}`);
 }}
 className="px-4 py-2 rounded-full bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-[0_0_12px_rgba(255,77,77,0.3)]"
 >
 <Eye size={13} />
 <span>Spectate Match</span>
 </button>
 ) : <div />}

 <button
 onClick={() => setSelectedEvent(null)}
 className="px-6 py-2 rounded-full bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition-colors cursor-pointer"
 >
 Close
 </button>
 </div>
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>

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
 className="w-full max-w-md bg-background border border-red-900/50 shadow-[0_16px_50px_rgba(255,0,0,0.2)] rounded-3xl p-6 sm:p-8 space-y-6 relative overflow-hidden"
 >
 <div className="flex items-center gap-3">
 <div className="w-10 h-10 rounded-full bg-red-950/50 border border-red-900/80 flex items-center justify-center text-red-400 shrink-0">
 <Warning size={20} />
 </div>
 <div>
 <h3 className="text-lg font-bold text-white">Delete User Account</h3>
 <p className="text-xs text-text-muted">This action is permanent and cannot be undone.</p>
 </div>
 </div>

 <div className="bg-black p-3.5 rounded-xl border border-white/5 text-xs text-text-secondary space-y-2">
 <p>Deleting <strong className="text-white">@${userToDelete.username}</strong> will erase their account data, username reservation, and active matches.</p>
 <p className="text-text-muted">Type <span className="text-primary font-bold">{userToDelete.username}</span> below to confirm:</p>
 </div>

 <input
 id="deleteConfirmInput"
 name="deleteConfirmation"
 autoComplete="off"
 type="text"
 placeholder={userToDelete.username}
 value={deleteConfirmInput}
 onChange={(e) => setDeleteConfirmInput(e.target.value)}
 className="w-full bg-black border border-white/10 focus:border-primary rounded-full px-4 py-2.5 text-xs text-white outline-none text-center"
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
 className="px-6 py-2 rounded-full bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-semibold transition-all shadow-[0_0_15px_rgba(255,0,0,0.4)] flex items-center gap-2 cursor-pointer"
 >
 {isDeleting ? <CircleNotch size={13} className="animate-spin"/> : <Trash2 size={13} />}
 <span>Delete Account</span>
 </button>
 </div>
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>

 {/* Caution-styled In-App Custom Purge Modal */}
 <AnimatePresence>
 {showPurgeModal && (
 <motion.div
 initial={{ opacity: 0 }}
 animate={{ opacity: 1 }}
 exit={{ opacity: 0 }}
 onClick={() => setShowPurgeModal(false)}
 className="fixed inset-0 z-[120] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
 >
 <motion.div
 initial={{ scale: 0.95, y: 15 }}
 animate={{ scale: 1, y: 0 }}
 exit={{ scale: 0.95, y: 15 }}
 onClick={(e) => e.stopPropagation()}
 className="w-full max-w-lg bg-[#141414] border-2 border-red-500/60 shadow-[0_20px_70px_rgba(239,68,68,0.25)] rounded-3xl p-6 sm:p-8 space-y-6 relative overflow-hidden"
 >
 {/* Caution Emblem & Header */}
 <div className="flex items-start gap-4">
 <div className="w-12 h-12 rounded-2xl bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center text-red-400 shrink-0 shadow-[0_0_20px_rgba(239,68,68,0.4)]">
 <Warning size={26} weight="fill"className="text-amber-400 animate-pulse"/>
 </div>
 <div className="space-y-1">
 <div className="flex items-center gap-2">
 <span className="px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 text-[12px] font-bold uppercase tracking-wider">
 Hazardous Action
 </span>
 </div>
 <h3 className="text-xl font-bold text-white font-headline-lg tracking-tight">
 Purge Finished Games
 </h3>
 <p className="text-xs text-text-muted">
 Permanently clears all completed match records from Firestore.
 </p>
 </div>
 </div>

 {/* Warning Content Card */}
 <div className="bg-black/80 p-4 rounded-2xl border border-red-900/40 space-y-3 text-xs">
 <div className="flex items-center justify-between text-text-secondary">
 <span>Completed Matches to Purge:</span>
 <span className="text-sm font-bold text-white bg-red-950/60 px-2.5 py-0.5 rounded border border-red-900/60 text-red-300">
 {finishedGames.length} games
 </span>
 </div>
 <div className="p-3 bg-red-950/30 rounded-xl border border-red-900/50 text-red-300 text-xs leading-relaxed">
 <strong>Warning:</strong> This operation permanently deletes game documents, board move histories, and player match states. Active games and live audit event logs will remain preserved.
 </div>
 </div>

 {/* Action Buttons */}
 <div className="flex gap-3 justify-end pt-2">
 <button
 onClick={() => setShowPurgeModal(false)}
 className="px-5 py-2.5 rounded-full bg-[#202020] hover:bg-[#282828] text-white text-xs font-semibold transition-colors cursor-pointer"
 >
 Cancel
 </button>
 <button
 onClick={handlePurgeOldGames}
 disabled={isPurging || finishedGames.length === 0}
 className="px-6 py-2.5 rounded-full bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-bold transition-all shadow-[0_0_20px_rgba(239,68,68,0.5)] flex items-center gap-2 cursor-pointer"
 >
 {isPurging ? <CircleNotch size={14} className="animate-spin"/> : <Trash2 size={14} />}
 <span>Confirm Permanent Purge ({finishedGames.length})</span>
 </button>
 </div>
 </motion.div>
 </motion.div>
 )}
 </AnimatePresence>

 {/* Floating Inspect Profile Modal (Users Tab & Activity Stream) */}
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
 className="w-full max-w-xl bg-background border border-white/15 shadow-[0_16px_50px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[85vh] rounded-3xl relative"
 >
 {/* Header Close Button */}
 <button
 onClick={() => setInspectUser(null)}
 className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-black/70 hover:bg-black text-white flex items-center justify-center border border-white/10 transition-colors cursor-pointer"
 title="Close"
 >
 <X size={15} />
 </button>

 {/* Banner Container */}
 <div className="relative w-full h-32 sm:h-36 bg-black border-b border-white/10 overflow-hidden shrink-0 flex items-center justify-center">
 {inspectUser.bannerUrl ? (
 <img src={inspectUser.bannerUrl} alt="Banner"className="w-full h-full object-contain"/>
 ) : (
 <div className="w-full h-full flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_#262626_0%,_#0a0a0a_100%)]">
 <div className="w-64 h-64 bg-primary/10 rounded-full blur-2xl"/>
 </div>
 )}
 </div>

 {/* Profile Header Content */}
 <div className="px-6 pb-4 pt-0 border-b border-white/10 relative">
 
 {/* Top row: Avatar & Full Page action */}
 <div className="flex items-end justify-between gap-3 mb-2.5">
 <div className="-mt-12 w-20 h-20 rounded-full overflow-hidden border-4 border-[#141414] bg-[#222222] shadow-2xl shrink-0">
 {inspectUser.avatarUrl ? (
 <img src={inspectUser.avatarUrl} alt=""className="w-full h-full object-cover"/>
 ) : (
 <div className="w-full h-full flex items-center justify-center font-bold text-2xl text-white">
 {inspectUser.username ? inspectUser.username.substring(0, 2).toUpperCase() : <UserIcon size={24} />}
 </div>
 )}
 </div>

 {/* Non-wrapping Full Page Button */}
 <Link
 to={`/profile/${inspectUser.id}`}
 className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#202020] hover:bg-[#282828] border border-white/10 hover:border-primary text-xs font-semibold text-white transition-all shrink-0 whitespace-nowrap"
 >
 <span className="whitespace-nowrap">Full Page</span>
 <ArrowUpRight size={12} className="shrink-0 text-text-muted"/>
 </Link>
 </div>

 {/* Bottom row: Username and Metadata */}
 <div className="space-y-0.5 min-w-0">
 <div className="flex items-center gap-2 flex-wrap">
 <h3 className="text-xl font-bold text-white font-headline-lg truncate">
 {inspectUser.isTestUser || !inspectUser.walletAddress ? inspectUser.username : `@${inspectUser.username}`}
 </h3>
 {(inspectUser.role === 'owner' || (!!OWNER_WALLET && inspectUser.walletAddress === OWNER_WALLET)) && (
 <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30 text-[12px] font-bold uppercase flex items-center gap-1 shrink-0">
 <Crown size={11} /> Owner
 </span>
 )}
 {(inspectUser.isAdmin || inspectUser.role === 'admin') && inspectUser.role !== 'owner' && (!OWNER_WALLET || inspectUser.walletAddress !== OWNER_WALLET) && (
 <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/40 text-[12px] font-bold uppercase flex items-center gap-1 shrink-0">
 <ShieldCheck size={11} /> Admin
 </span>
 )}
 {(inspectUser.isTestUser || !inspectUser.walletAddress) && (
 <span className="text-[12px] text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/30 flex items-center gap-1 font-bold shrink-0">
 <Flask size={10} />
 <span>Guest</span>
 </span>
 )}
 </div>
 <p className="text-xs text-text-muted truncate">
 User ID: {inspectUser.id}
 </p>
 </div>

 {/* Wallet Address Pill with Solscan Link */}
 {inspectUser.walletAddress && (
 <div className="text-xs text-text-secondary bg-black p-2.5 rounded-xl border border-white/5 flex items-center justify-between mt-2.5">
 <SolscanAccountLink
 walletAddress={inspectUser.walletAddress}
 onCopy={(addr) => handleCopyWallet(addr, `inspect_modal_${inspectUser.id}`)}
 copied={copiedId === `inspect_modal_${inspectUser.id}`}
 truncate={false}
 />
 </div>
 )}
 </div>

 {/* Quick Stats Grid */}
 <div className="grid grid-cols-4 border-b border-white/10 bg-black shrink-0">
 <div className="p-3 text-center border-r border-white/10">
 <span className="text-[12px] text-text-muted uppercase block">Matches</span>
 <span className="text-sm font-bold text-white">{inspectHistory.length}</span>
 </div>
 <div className="p-3 text-center border-r border-white/10">
 <span className="text-[12px] text-text-muted uppercase block">Wins</span>
 <span className="text-sm font-bold text-primary">
 {inspectHistory.filter((g) => g.winner === inspectUser.id).length}
 </span>
 </div>
 <div className="p-3 text-center border-r border-white/10">
 <span className="text-[12px] text-text-muted uppercase block">Losses</span>
 <span className="text-sm font-bold text-text-secondary">
 {inspectHistory.filter((g) => g.winner && g.winner !== inspectUser.id && g.winner !== 'draw').length}
 </span>
 </div>
 <div className="p-3 text-center">
 <span className="text-[12px] text-text-muted uppercase block">SOL Balance</span>
 <span className="text-sm font-bold text-primary flex items-center justify-center gap-1">
 {isLoadingInspectBalance ? (
 <CircleNotch size={12} className="animate-spin text-primary"/>
 ) : inspectSolBalance !== null ? (
 <SolAmount
 amount={parseFloat(inspectSolBalance.toFixed(3))}
 suffix=""
 tooltipPosition="bottom"
 className="text-primary hover:text-red-400 font-bold"
 />
 ) : (
 '—'
 )}
 </span>
 </div>
 </div>

 {/* Inspect Match History */}
 <div className="flex-1 p-5 overflow-y-auto space-y-3 min-h-0 bg-[#121212]">
 <div className="flex justify-between items-center">
 <h4 className="text-xs font-bold text-white uppercase tracking-wider">
 Match History
 </h4>
 <span className="text-xs text-text-muted">
 {inspectHistory.length} Recorded Matches
 </span>
 </div>

 {isLoadingInspectHistory ? (
 <div className="py-8 flex justify-center">
 <CircleNotch size={20} className="animate-spin text-primary"/>
 </div>
 ) : inspectHistory.length === 0 ? (
 <p className="text-xs text-text-muted py-4 text-center">
 No completed matches recorded.
 </p>
 ) : (
 <div className="space-y-2">
 {inspectHistory.map((g) => {
 const isWin = g.winner === inspectUser.id;
 const isDraw = g.winner === 'draw';
 const oppId = g.player1 === inspectUser.id ? g.player2 : g.player1;
 const oppName = g.player1 === inspectUser.id ? g.player2Name : g.player1Name;
 const isOppTest = oppId?.startsWith('test_') || g.player1IsTest || g.player2IsTest;
 const oppDisplay = isOppTest ? (oppName || 'Guest') : `@${oppName || 'Opponent'}`;

 return (
 <div
 key={g.id}
 className="flex items-center justify-between p-3 rounded-xl bg-[#181818] border border-white/5 text-xs relative"
 >
 {/* Guest User Toast Popup */}
 <AnimatePresence>
 {testUserToast?.matchId === g.id && (
 <motion.div
 initial={{ opacity: 0, y: 6, scale: 0.95 }}
 animate={{ opacity: 1, y: -4, scale: 1 }}
 exit={{ opacity: 0, y: -4, scale: 0.95 }}
 className="absolute -top-7 left-4 z-30 px-3 py-1 bg-black/95 text-primary border border-primary/40 rounded-full text-[12px] font-bold shadow-lg flex items-center gap-1.5 pointer-events-none whitespace-nowrap"
 >
 <Flask size={11} className="shrink-0"/>
 <span>{testUserToast.message}</span>
 </motion.div>
 )}
 </AnimatePresence>

 <div className="flex items-center gap-2">
 <span className="text-text-muted">#${g.id.substring(0, 6).toUpperCase()}</span>
 <button
 onClick={(e) => handleOpponentClick(e, oppId, g.id)}
 className="text-white hover:text-primary transition-colors cursor-pointer text-left font-medium"
 >
 vs {oppDisplay}
 </button>
 </div>

 <div className="flex items-center gap-3">
 <span className={`px-2.5 py-0.5 rounded-full text-[12px] font-bold uppercase ${
 isWin ? 'bg-primary/15 text-primary' : isDraw ? 'bg-white/10 text-white' : 'bg-neutral-800 text-text-muted'
 }`}>
 {isWin ? 'Win' : isDraw ? 'Draw' : 'Loss'}
 </span>
 <span className={`font-bold ${isWin && g.wager > 0 ? 'text-primary' : 'text-text-secondary'}`}>
 {g.wager > 0 ? (
 <SolAmount amount={g.wager} suffix={` ${g.wagerCurrency || 'SOL'}`} />
 ) : (
 'Free'
 )}
 </span>
 </div>
 </div>
 );
 })}
 </div>
 )}
 </div>

 {/* Bottom Actions */}
 <div className="p-4 border-t border-white/10 bg-background flex justify-between items-center shrink-0">
 <div className="flex items-center gap-2">
 {isOwner && inspectUser.role !== 'owner' && (!OWNER_WALLET || inspectUser.walletAddress !== OWNER_WALLET) && (
 <button
 onClick={() => handleToggleAdminRole(inspectUser)}
 disabled={roleUpdatingId === inspectUser.id}
 className="px-4 py-2 rounded-full bg-[#202020] hover:bg-[#282828] border border-white/10 text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
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
 {inspectUser.role !== 'owner' && (!OWNER_WALLET || inspectUser.walletAddress !== OWNER_WALLET) && (
 <button
 onClick={() => {
 setUserToDelete(inspectUser);
 setDeleteConfirmInput('');
 }}
 className="px-4 py-2 rounded-full bg-red-950/40 hover:bg-red-900/60 border border-red-900/60 text-red-400 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
 >
 <Trash2 size={13} />
 <span>Delete Account</span>
 </button>
 )}
 </div>
 <button
 onClick={() => setInspectUser(null)}
 className="px-5 py-2 rounded-full bg-[#202020] hover:bg-[#282828] text-white text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
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
