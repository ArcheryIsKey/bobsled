import { useState } from 'react';
import { Loader2 } from 'lucide-react';

export default function SetUsernameScreen({ onSubmit, isSubmitting, error }: { onSubmit: (username: string) => void, isSubmitting: boolean, error: string | null }) {
  const [username, setUsername] = useState('');

  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-[#0A0A0A] w-full relative overflow-hidden">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[600px] max-h-[600px] bg-[#AB9FF2]/5 rounded-full blur-[100px] pointer-events-none"></div>
      
      <div className="relative z-10 flex flex-col items-center text-center px-4 backdrop-blur-sm border border-neutral-800/50 p-12 bg-black/40 w-full max-w-md">
        <h1 className="text-2xl font-bold tracking-tighter uppercase mb-2 text-white">
          Claim Identity
        </h1>
        <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-400 mb-8 font-mono">
          One Wallet. One Username. Immutable.
        </p>
        
        <form 
          className="flex flex-col gap-4 items-center w-full"
          onSubmit={(e) => { e.preventDefault(); if(username.trim()) onSubmit(username.trim()); }}
        >
          <input 
            type="text"
            placeholder="Enter Username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            maxLength={15}
            className="bg-[#0A0A0A] border border-neutral-800 px-4 py-3 text-sm font-mono focus:outline-none focus:border-[#AB9FF2] w-full text-white text-center"
          />
          
          {error && (
            <p className="text-[10px] font-mono text-red-500 uppercase tracking-widest">{error}</p>
          )}

          <button
            type="submit"
            disabled={!username.trim() || isSubmitting}
            className="w-full border border-[#AB9FF2] bg-[#AB9FF2]/10 text-[#AB9FF2] px-6 py-3 text-xs uppercase tracking-widest hover:bg-[#AB9FF2]/20 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {isSubmitting ? <Loader2 size={14} className="animate-spin" /> : 'Confirm Identity'}
          </button>
        </form>
      </div>
    </div>
  );
}
