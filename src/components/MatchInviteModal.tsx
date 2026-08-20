import React, { useState } from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { Swords, Eye, Coins, FlaskConical, ArrowRight, User, AlertCircle, X } from 'lucide-react';
import { motion } from 'framer-motion';

interface MatchInviteModalProps {
  pendingGame: {
    id: string;
    player1Name?: string;
    player1Avatar?: string;
    wager?: number;
    wagerCurrency?: string;
    status?: string;
  };
  onGuestLogin: (username: string) => void;
  onSpectateGuest: (username: string) => void;
  onDismiss: () => void;
}

export default function MatchInviteModal({
  pendingGame,
  onGuestLogin,
  onSpectateGuest,
  onDismiss,
}: MatchInviteModalProps) {
  const { setVisible } = useWalletModal();
  const [guestUsername, setGuestUsername] = useState('');
  const [spectateUsername, setSpectateUsername] = useState('');
  const [showSpectateInput, setShowSpectateInput] = useState(false);

  const isSolGame = (pendingGame.wager || 0) > 0 && pendingGame.wagerCurrency !== 'FREE';
  const hostName = pendingGame.player1Name || 'Host';

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (guestUsername.trim()) {
      onGuestLogin(guestUsername.trim());
    }
  };

  const handleSpectateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (spectateUsername.trim()) {
      onSpectateGuest(spectateUsername.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-md p-4 overflow-y-auto">
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        className="w-full max-w-lg bg-[#141414] border border-white/15 shadow-[0_20px_60px_rgba(0,0,0,0.95)] rounded-3xl p-6 sm:p-8 space-y-6 relative overflow-hidden my-auto"
      >
        {/* Top Accent Line */}
        <div className="absolute top-0 left-0 w-full h-1 bg-velocity-red" />
        <div className="absolute top-0 right-0 w-72 h-72 bg-velocity-red/10 rounded-full blur-3xl pointer-events-none" />

        {/* Close / Dismiss Button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 z-20 w-8 h-8 rounded-full bg-black/60 hover:bg-black text-white flex items-center justify-center border border-white/10 transition-colors cursor-pointer"
          title="Dismiss and view lobby"
        >
          <X size={15} />
        </button>

        {/* Header Badge & Title */}
        <div className="text-center space-y-2 relative z-10 pt-1">
          <div className="w-14 h-14 mx-auto rounded-full bg-velocity-red flex items-center justify-center text-white shadow-[0_0_25px_rgba(255,77,77,0.6)] mb-2">
            <Swords size={28} />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-velocity-red/15 border border-velocity-red/40 text-velocity-red font-mono text-[11px] font-bold uppercase tracking-wider">
            <span>Direct Match Invitation</span>
          </div>

          <h2 className="font-headline-lg text-2xl sm:text-3xl text-white font-bold tracking-tight">
            You've Been Challenged!
          </h2>
          <p className="text-xs text-text-secondary">
            Match <strong className="font-mono text-white">#{pendingGame.id.substring(0, 6).toUpperCase()}</strong>
          </p>
        </div>

        {/* Match Details Card */}
        <div className="bg-[#0e0e0e] rounded-2xl p-4 sm:p-5 border border-white/10 space-y-3 relative z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#1e1e1e] border-2 border-velocity-red flex items-center justify-center text-white font-bold text-xs shrink-0 overflow-hidden shadow-md">
                {pendingGame.player1Avatar ? (
                  <img src={pendingGame.player1Avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  hostName.substring(0, 2).toUpperCase()
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase font-mono text-text-muted font-semibold tracking-wider">
                  Challenger
                </p>
                <p className="font-headline-lg text-sm sm:text-base font-bold text-white tracking-tight">
                  @{hostName}
                </p>
              </div>
            </div>

            {/* Stakes Display */}
            <div className="text-right">
              <p className="text-[10px] uppercase font-mono text-text-muted font-semibold tracking-wider">
                Stakes
              </p>
              <div className="flex items-center gap-1.5 justify-end">
                {isSolGame ? (
                  <>
                    <Coins size={14} className="text-velocity-red" />
                    <span className="font-headline-lg text-base sm:text-lg font-bold text-velocity-red font-mono">
                      {pendingGame.wager} SOL
                    </span>
                  </>
                ) : (
                  <span className="font-headline-lg text-sm font-bold text-emerald-400 font-mono bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
                    Free Play
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Path A: SOL Staked Match */}
        {isSolGame ? (
          <div className="space-y-4 relative z-10">
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-2.5 text-left text-xs text-amber-200">
              <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-300 block font-semibold mb-0.5">Solana Wallet Required</strong>
                This match requires a stake of <strong className="text-white font-mono">{pendingGame.wager} SOL</strong>. Connect a Solana wallet to place stakes and enter as Player 2. Guest accounts cannot play for SOL stakes.
              </div>
            </div>

            {/* Primary Action: Connect Wallet */}
            <button
              onClick={() => setVisible(true)}
              className="w-full h-12 bg-velocity-red hover:bg-red-600 active:scale-[0.99] text-white font-bold text-xs uppercase tracking-wider rounded-full transition-all shadow-[0_0_20px_rgba(255,77,77,0.4)] flex items-center justify-center gap-2 font-mono cursor-pointer"
            >
              <User size={16} />
              <span>Connect Wallet to Accept ({pendingGame.wager} SOL)</span>
            </button>

            {/* Secondary Option: Spectate as Guest */}
            {!showSpectateInput ? (
              <div className="flex items-center justify-between pt-1">
                <button
                  onClick={() => setShowSpectateInput(true)}
                  className="text-xs text-text-secondary hover:text-white flex items-center gap-1.5 transition-colors font-mono cursor-pointer"
                >
                  <Eye size={14} className="text-velocity-red" />
                  <span>Don't have SOL? Spectate as Guest</span>
                </button>
                <button
                  onClick={onDismiss}
                  className="text-xs text-text-muted hover:text-white transition-colors cursor-pointer"
                >
                  Decline Match
                </button>
              </div>
            ) : (
              <form onSubmit={handleSpectateSubmit} className="space-y-2 pt-1">
                <p className="text-[11px] text-text-muted font-mono">
                  Enter a temporary guest name to watch the match live:
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    maxLength={20}
                    placeholder="Guest spectator name..."
                    value={spectateUsername}
                    onChange={(e) => setSpectateUsername(e.target.value)}
                    className="flex-1 bg-[#0e0e0e] border border-white/10 focus:border-velocity-red rounded-full px-4 text-xs text-white outline-none font-mono"
                  />
                  <button
                    type="submit"
                    disabled={!spectateUsername.trim()}
                    className="px-5 py-2.5 bg-[#202020] hover:bg-[#282828] disabled:opacity-40 text-white rounded-full text-xs font-semibold uppercase tracking-wider font-mono flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Eye size={13} className="text-velocity-red" />
                    <span>Watch Match</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          /* Path B: Free Play Match */
          <div className="space-y-4 relative z-10">
            <p className="text-xs text-text-secondary text-center">
              Choose how you would like to join this free match:
            </p>

            {/* Instant Guest Join Form */}
            <form onSubmit={handleGuestSubmit} className="space-y-2.5 bg-[#0e0e0e] p-4 rounded-2xl border border-white/5">
              <div className="flex items-center gap-1.5 text-xs text-white font-semibold font-mono">
                <FlaskConical size={14} className="text-velocity-red" />
                <span>Instant Guest Play (No Wallet Needed)</span>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  maxLength={20}
                  placeholder="Enter your guest username..."
                  value={guestUsername}
                  onChange={(e) => setGuestUsername(e.target.value)}
                  className="flex-1 h-11 bg-[#141414] border border-white/10 focus:border-velocity-red rounded-full px-4 text-xs text-white outline-none font-mono"
                />
                <button
                  type="submit"
                  disabled={!guestUsername.trim()}
                  className="h-11 px-6 bg-velocity-red hover:bg-red-600 disabled:opacity-40 text-white rounded-full text-xs font-bold uppercase tracking-wider font-mono shadow-[0_0_15px_rgba(255,77,77,0.4)] flex items-center justify-center gap-2 cursor-pointer shrink-0 active:scale-[0.98]"
                >
                  <span>Accept &amp; Play</span>
                  <ArrowRight size={14} />
                </button>
              </div>
            </form>

            <div className="relative flex items-center justify-center my-1">
              <div className="w-full border-t border-white/10" />
              <span className="absolute bg-[#141414] px-3 text-[10px] text-text-muted font-mono uppercase">OR</span>
            </div>

            {/* Wallet Option for Free Games */}
            <button
              onClick={() => setVisible(true)}
              className="w-full h-11 bg-[#202020] hover:bg-[#282828] border border-white/10 text-white font-semibold text-xs uppercase tracking-wider rounded-full transition-all font-mono flex items-center justify-center gap-2 cursor-pointer"
            >
              <User size={15} />
              <span>Connect Solana Wallet Instead</span>
            </button>

            <div className="flex justify-center pt-1">
              <button
                onClick={onDismiss}
                className="text-xs text-text-muted hover:text-white transition-colors cursor-pointer"
              >
                Decline &amp; Go to Lobby
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
