import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiSlash, CheckCircle, CircleNotch, Warning } from '@phosphor-icons/react';

export interface NetworkStatus {
 isOnline: boolean;
 isOffline: boolean;
}

export function useNetworkStatus(): NetworkStatus {
 const [isOnline, setIsOnline] = useState<boolean>(() => {
 return typeof navigator !== 'undefined' ? navigator.onLine : true;
 });

 useEffect(() => {
 const handleOnline = () => setIsOnline(true);
 const handleOffline = () => setIsOnline(false);

 window.addEventListener('online', handleOnline);
 window.addEventListener('offline', handleOffline);

 return () => {
 window.removeEventListener('online', handleOnline);
 window.removeEventListener('offline', handleOffline);
 };
 }, []);

 return {
 isOnline,
 isOffline: !isOnline,
 };
}

export function ConnectionStatusBanner() {
 const { isOnline, isOffline } = useNetworkStatus();
 const [showRestoredNotice, setShowRestoredNotice] = useState(false);
 const [wasOffline, setWasOffline] = useState(false);

 useEffect(() => {
 if (isOffline) {
 setWasOffline(true);
 setShowRestoredNotice(false);
 } else if (wasOffline && isOnline) {
 setShowRestoredNotice(true);
 const timer = setTimeout(() => {
 setShowRestoredNotice(false);
 setWasOffline(false);
 }, 3500);
 return () => clearTimeout(timer);
 }
 }, [isOnline, isOffline, wasOffline]);

 return (
 <AnimatePresence>
 {isOffline && (
 <motion.div
 key="offline-banner"
 initial={{ y: -60, opacity: 0 }}
 animate={{ y: 0, opacity: 1 }}
 exit={{ y: -60, opacity: 0 }}
 transition={{ duration: 0.25, ease: 'easeOut' }}
 className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-red-950/95 via-red-900/95 to-red-950/95 border-b border-red-500/30 text-white px-4 py-2.5 shadow-[0_4px_25px_rgba(255,0,0,0.3)] backdrop-blur-xl flex items-center justify-center text-xs"
 >
 <div className="max-w-4xl w-full flex items-center justify-between gap-3">
 <div className="flex items-center gap-2.5 min-w-0">
 <div className="w-6 h-6 rounded-full bg-red-500/20 border border-red-400/40 flex items-center justify-center shrink-0 text-red-300">
 <WifiSlash size={14} weight="bold"className="animate-pulse"/>
 </div>
 <div className="truncate">
 <span className="font-bold text-red-200 uppercase tracking-wider mr-2">
 Connection Lost:
 </span>
 <span className="text-red-300/90 hidden sm:inline">
 You are currently offline. Game interactions are paused until connection is restored.
 </span>
 <span className="text-red-300/90 sm:hidden">
 Offline. Inputs paused.
 </span>
 </div>
 </div>

 <div className="flex items-center gap-1.5 text-red-300/80 text-xs shrink-0 bg-black/40 px-2.5 py-1 rounded-full border border-red-500/20">
 <CircleNotch size={12} className="animate-spin text-red-400"/>
 <span className="hidden md:inline">Reconnecting...</span>
 </div>
 </div>
 </motion.div>
 )}

 {!isOffline && showRestoredNotice && (
 <motion.div
 key="restored-banner"
 initial={{ y: -60, opacity: 0 }}
 animate={{ y: 0, opacity: 1 }}
 exit={{ y: -60, opacity: 0 }}
 transition={{ duration: 0.25, ease: 'easeOut' }}
 className="fixed top-0 left-0 right-0 z-[9999] bg-gradient-to-r from-emerald-950/95 via-emerald-900/95 to-emerald-950/95 border-b border-emerald-500/30 text-white px-4 py-2.5 shadow-[0_4px_25px_rgba(16,185,129,0.3)] backdrop-blur-xl flex items-center justify-center text-xs"
 >
 <div className="max-w-4xl w-full flex items-center justify-center gap-2 text-emerald-200">
 <CheckCircle size={16} weight="fill"className="text-emerald-400"/>
 <span className="font-bold uppercase tracking-wider">
 Connection Restored — Back Online
 </span>
 </div>
 </motion.div>
 )}
 </AnimatePresence>
 );
}

export default ConnectionStatusBanner;
