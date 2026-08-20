import React, { useState } from 'react';
import { useWalletModal } from '@solana/wallet-adapter-react-ui';
import { User, FlaskConical } from 'lucide-react';
import MatchInviteModal from './MatchInviteModal';

interface WelcomeScreenProps {
  onTestLogin?: (username: string) => void;
  onSpectateGuest?: (username: string) => void;
  pendingGame?: any;
  onDismissInvite?: () => void;
}

export default function WelcomeScreen({
  onTestLogin,
  onSpectateGuest,
  pendingGame,
  onDismissInvite,
}: WelcomeScreenProps) {
  const { setVisible } = useWalletModal();
  const [guestUsername, setGuestUsername] = useState('');
  const [inviteDismissed, setInviteDismissed] = useState(false);

  const handleGuestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (guestUsername.trim() && onTestLogin) {
      onTestLogin(guestUsername.trim());
    }
  };

  const showInviteModal = pendingGame && !inviteDismissed;

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6 min-h-[calc(100vh-80px)] w-full">
      
      {/* High-Priority Match Invitation Popup Modal for Logged-Out Users */}
      {showInviteModal && (
        <MatchInviteModal
          pendingGame={pendingGame}
          onGuestLogin={(uname) => onTestLogin?.(uname)}
          onSpectateGuest={(uname) => onSpectateGuest?.(uname)}
          onDismiss={() => {
            setInviteDismissed(true);
            onDismissInvite?.();
          }}
        />
      )}

      <div className="w-full max-w-md space-y-6">
        
        {/* Main Welcome Container */}
        <div className="bg-[#141414] border border-white/10 p-8 sm:p-10 rounded-3xl shadow-2xl flex flex-col items-center text-center gap-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-velocity-red" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-velocity-red/5 rounded-full blur-3xl pointer-events-none" />

          {/* Logo & Headline */}
          <div className="space-y-2 relative z-10">
            <div className="w-16 h-16 mx-auto rounded-full bg-[#1e1e1e] border border-white/10 flex items-center justify-center shadow-xl mb-3 overflow-hidden">
              <img src="/logo.jpg" alt="bobsled.gg" className="w-full h-full object-cover mix-blend-screen" />
            </div>
            <h1 className="font-headline-lg text-3xl sm:text-4xl text-white font-bold tracking-tight">
              bobsled<span className="text-velocity-red">.</span>gg
            </h1>
            <p className="text-xs text-text-secondary max-w-[280px] mx-auto">
              High-performance on-chain Connect 4. Connect your wallet or guest mode to start playing right away.
            </p>
          </div>

          {/* Primary Action: Connect Wallet */}
          <div className="w-full space-y-3 relative z-10">
            <button
              onClick={() => setVisible(true)}
              className="w-full h-12 bg-velocity-red hover:bg-red-600 active:scale-[0.99] text-white font-bold text-xs uppercase tracking-wider rounded-full transition-all shadow-[0_0_20px_rgba(255,77,77,0.4)] flex items-center justify-center gap-2 font-mono cursor-pointer"
            >
              <User size={16} />
              <span>Connect Wallet to Play</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex items-center justify-center w-full my-1">
            <div className="w-full border-t border-white/10" />
            <span className="absolute bg-[#141414] px-3 text-[11px] text-text-muted font-mono uppercase">OR</span>
          </div>

          {/* Guest Mode */}
          {onTestLogin && (
            <div className="w-full space-y-3 relative z-10">
              <div className="flex items-center justify-center gap-1.5 text-xs text-text-secondary font-semibold font-mono">
                <FlaskConical size={14} className="text-velocity-red" />
                <span>Guest Mode</span>
              </div>

              <form onSubmit={handleGuestSubmit} className="flex flex-col gap-2.5 w-full">
                <div className="relative">
                  <input
                    type="text"
                    maxLength={20}
                    placeholder="Enter guest username..."
                    value={guestUsername}
                    onChange={(e) => setGuestUsername(e.target.value)}
                    className="w-full h-11 bg-[#0e0e0e] border border-white/10 focus:border-velocity-red rounded-full px-4 text-xs text-white text-center font-mono outline-none transition-colors placeholder:text-text-muted"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!guestUsername.trim()}
                  className="w-full h-10 bg-[#202020] hover:bg-[#282828] disabled:opacity-40 text-white font-semibold text-xs uppercase tracking-wider rounded-full transition-all border border-white/10 font-mono flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <FlaskConical size={13} className="text-velocity-red" />
                  <span>Play as Guest</span>
                </button>
              </form>
              <p className="text-[10px] text-text-muted">
                Guest sessions are free-play only and do not require a crypto wallet.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
