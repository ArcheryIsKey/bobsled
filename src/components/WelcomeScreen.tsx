import React, { useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { Play, FlaskConical } from 'lucide-react';

export default function WelcomeScreen({ onTestLogin }: { onTestLogin?: (username: string) => void }) {
  const [testUsername, setTestUsername] = useState('');

  const handleTestSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (testUsername.trim() && onTestLogin) {
      onTestLogin(testUsername.trim());
    }
  };

  return (
    <div className="bg-[#0e0e0e] text-text-primary min-h-[calc(100vh-64px)] flex flex-col font-body-md relative overflow-hidden w-full">
      {/* Atmospheric Glow */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-velocity-red/5 rounded-full blur-[140px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[600px] h-[600px] bg-[#1a1a1a]/40 rounded-full blur-[120px]" />
      </div>

      <main className="flex-grow flex items-center justify-center p-4 md:p-8 relative z-10 w-full max-w-md mx-auto py-12">
        <div className="bg-[#141414] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.8)] rounded-xl w-full overflow-hidden transition-all duration-300">
          
          <div className="w-full bg-surface-container-highest h-1">
            <div className="bg-velocity-red h-full w-full opacity-80" />
          </div>

          <div className="p-8 md:p-10 flex flex-col gap-7 items-center text-center">
            {/* Logo & Headline */}
            <div className="space-y-2 flex flex-col items-center">
              <img src="/logo.jpg" alt="bobsled.gg logo" className="w-16 h-16 mix-blend-screen mb-1" />
              <h1 className="font-headline-lg text-3xl md:text-4xl text-white font-bold tracking-tight">
                bobsled<span className="text-velocity-red">.</span>gg
              </h1>
              <p className="font-body-sm text-text-secondary text-xs sm:text-sm max-w-xs leading-relaxed">
                Real-time Connect 4 on Solana. Connect wallet to start playing.
              </p>
            </div>

            {/* Wallet Connect Primary Action */}
            <div className="w-full flex justify-center">
              <WalletMultiButton className="!w-full !justify-center !bg-velocity-red hover:!bg-red-600 !text-white !font-semibold !text-xs !py-3.5 !px-6 !transition-all !rounded-md !shadow-[0_0_20px_rgba(255,77,77,0.35)] !tracking-wide uppercase" />
            </div>

            {/* Test User Mode */}
            {onTestLogin && (
              <div className="w-full pt-6 border-t border-white/10 flex flex-col gap-3">
                <div className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-text-muted uppercase tracking-wider">
                  <FlaskConical size={13} className="text-velocity-red" />
                  <span>Test User Mode</span>
                </div>

                <form onSubmit={handleTestSubmit} className="flex flex-col gap-2.5 w-full">
                  <div className="relative flex items-center bg-[#0e0e0e] rounded-md border border-white/10 focus-within:border-velocity-red">
                    <span className="pl-3 text-text-muted text-xs font-mono">@</span>
                    <input
                      type="text"
                      placeholder="Enter test username..."
                      value={testUsername}
                      onChange={(e) => setTestUsername(e.target.value)}
                      maxLength={15}
                      className="w-full bg-transparent border-none text-white text-xs py-2 px-2 focus:ring-0 outline-none placeholder:text-text-muted"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={!testUsername.trim()}
                    className="w-full bg-surface-container hover:bg-surface-elevated text-text-secondary hover:text-white border border-white/10 hover:border-velocity-red text-xs py-2 rounded-md font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    <Play size={12} />
                    <span>Enter Test Mode</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
