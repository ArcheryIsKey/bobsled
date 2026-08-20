import { useState } from 'react';
import { Loader2, CheckCircle, ArrowRight } from 'lucide-react';

export default function SetUsernameScreen({ onSubmit, isSubmitting, error }: { onSubmit: (username: string) => void, isSubmitting: boolean, error: string | null }) {
  const [username, setUsername] = useState('');

  return (
    <div className="bg-surface-base text-text-primary min-h-screen flex flex-col font-body-md relative overflow-hidden w-full">
      {/* Background Atmospheric Effect */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-velocity-red/5 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-surface-elevated/20 rounded-full blur-[100px]"></div>
      </div>

      <main className="flex-grow flex items-center justify-center p-margin-mobile md:p-margin-desktop relative z-10 w-full max-w-max-width mx-auto">
        <div className="bg-[rgba(26,26,26,0.8)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.1)] shadow-[0_4px_30px_rgba(0,0,0,0.5)] rounded-xl w-full max-w-md overflow-hidden transition-all duration-300">
          {/* Progress Bar Header */}
          <div className="w-full bg-surface-container-highest h-1">
            <div className="bg-velocity-red h-full w-1/3 transition-all duration-500 ease-out" role="progressbar"></div>
          </div>
          
          <form 
            className="p-8 flex flex-col gap-8"
            onSubmit={(e) => { e.preventDefault(); if(username.trim()) onSubmit(username.trim()); }}
          >
            {/* Branding & Title */}
            <div className="text-center space-y-2">
              <h1 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-text-primary font-bold tracking-tight">Claim Your Identity</h1>
              <p className="font-body-sm text-body-sm text-text-secondary">Your handle on the bobsled.gg network.</p>
            </div>
            
            {/* Input Area */}
            <div className="space-y-4">
              <label className="font-label-caps text-label-caps text-text-muted uppercase block" htmlFor="username">Username</label>
              <div className="relative flex items-center bg-surface-container rounded border-b border-glass-border transition-colors duration-200 focus-within:border-velocity-red focus-within:shadow-[0_1px_0_var(--color-velocity-red)]">
                <span className="pl-4 font-body-md text-body-md text-text-muted select-none">@</span>
                <input 
                  autoComplete="off" 
                  className="w-full bg-transparent border-none text-text-primary font-body-md text-body-md py-3 px-3 focus:ring-0 placeholder-surface-container-high outline-none" 
                  id="username" 
                  name="username" 
                  placeholder="pilot_zero" 
                  spellCheck="false" 
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  maxLength={15}
                />
                {/* Status Icon */}
                {username.length > 3 && !error && (
                  <div className="pr-4" id="status-icon">
                    <CheckCircle className="text-text-muted w-5 h-5" />
                  </div>
                )}
              </div>
              
              {/* Helper Text / Validation Message */}
              <div className="flex justify-between items-center min-h-[20px]">
                {error ? (
                  <p className="font-body-sm text-body-sm text-velocity-red">{error}</p>
                ) : (
                  <p className="font-body-sm text-body-sm text-text-secondary" id="username-helper">4-15 characters, alphanumeric and underscores.</p>
                )}
                {username.length > 3 && !error && (
                  <span className="font-label-caps text-label-caps text-text-muted">AVAILABLE</span>
                )}
              </div>
            </div>
            
            {/* Actions */}
            <div className="pt-4 mt-2 border-t border-glass-border">
              <button 
                className="w-full bg-velocity-red text-text-primary font-label-caps text-label-caps uppercase py-4 rounded font-bold tracking-wider hover:bg-primary-container active:scale-[0.98] transition-all duration-200 flex justify-center items-center gap-2 group disabled:opacity-50" 
                type="submit"
                disabled={!username.trim() || isSubmitting || username.length < 4}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <>
                    <span>Initialize</span>
                    <ArrowRight className="w-[18px] h-[18px] group-hover:translate-x-1 transition-transform duration-300" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
