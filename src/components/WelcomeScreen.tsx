import { useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function WelcomeScreen({ onTestLogin }: { onTestLogin: (username: string) => void }) {
  const [testUsername, setTestUsername] = useState('');

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#0A0A0A] w-full relative overflow-hidden">
      {/* Blurred background effect */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[600px] max-h-[600px] bg-[#AB9FF2]/5 rounded-full blur-[100px] pointer-events-none"></div>
      
      <div className="relative z-10 flex flex-col items-center text-center px-4 backdrop-blur-sm border border-neutral-800/50 p-12 bg-black/40">
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tighter lowercase mb-10 text-white drop-shadow-2xl">
          bobsled<span className="text-[#AB9FF2]">.</span>gg
        </h1>
        
        <WalletMultiButton className="!bg-[#AB9FF2] !text-black !font-bold !text-[11px] !uppercase !tracking-[0.2em] !py-4 !px-8 hover:!opacity-90 !transition-opacity !rounded-none" />
        
        <form 
          className="mt-8 border-t border-neutral-800 pt-8 flex flex-col gap-4 items-center w-full"
          onSubmit={(e) => { e.preventDefault(); if(testUsername.trim()) onTestLogin(testUsername); }}
        >
          <p className="text-[10px] text-neutral-500 uppercase tracking-widest">Test Mode</p>
          <div className="flex gap-2 w-full max-w-xs">
            <input 
              type="text"
              placeholder="Test Username"
              value={testUsername}
              onChange={e => setTestUsername(e.target.value)}
              className="bg-[#0A0A0A] border border-neutral-800 px-4 py-2 text-xs font-mono focus:outline-none focus:border-[#AB9FF2] flex-1 text-white"
            />
            <button
              type="submit"
              disabled={!testUsername.trim()}
              className="border border-[#AB9FF2] text-[#AB9FF2] px-6 py-2 text-xs uppercase tracking-widest hover:bg-[#AB9FF2]/10 disabled:opacity-50 transition-colors"
            >
              Login
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
