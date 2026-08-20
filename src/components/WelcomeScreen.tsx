import { useState } from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function WelcomeScreen({ onTestLogin }: { onTestLogin: (username: string) => void }) {
  const [testUsername, setTestUsername] = useState('');

  return (
    <div className="bg-surface-base text-text-primary min-h-screen flex flex-col font-body-md relative overflow-hidden w-full">
      {/* Background Atmospheric Effect */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-velocity-red/5 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-surface-elevated/20 rounded-full blur-[100px]"></div>
      </div>
      
      <main className="flex-grow flex items-center justify-center p-margin-mobile md:p-margin-desktop relative z-10 w-full max-w-max-width mx-auto">
        <div className="bg-[rgba(26,26,26,0.8)] backdrop-blur-[16px] border border-[rgba(255,255,255,0.1)] shadow-[0_4px_30px_rgba(0,0,0,0.5)] rounded-xl w-full max-w-md overflow-hidden transition-all duration-300">
          {/* Progress Bar Header - empty state for login */}
          <div className="w-full bg-surface-container-highest h-1"></div>
          
          <div className="p-8 flex flex-col gap-8">
            <h1 className="font-headline-lg-mobile md:font-headline-lg text-[40px] text-text-primary font-bold tracking-tight text-center">
              bobsled<span className="text-velocity-red">.</span>gg
            </h1>
            
            <div className="flex justify-center">
              <WalletMultiButton className="!bg-velocity-red !text-text-primary !font-label-caps !text-label-caps !uppercase !tracking-wider !py-4 !px-8 hover:!bg-primary-container !transition-all !rounded !font-bold" />
            </div>
            
            <form 
              className="pt-8 border-t border-glass-border flex flex-col gap-4 items-center w-full"
              onSubmit={(e) => { e.preventDefault(); if(testUsername.trim()) onTestLogin(testUsername); }}
            >
              <p className="font-label-caps text-label-caps text-text-muted uppercase text-center w-full">Test Mode</p>
              
              <div className="relative flex items-center bg-surface-container rounded border-b border-glass-border transition-colors duration-200 focus-within:border-velocity-red focus-within:shadow-[0_1px_0_var(--color-velocity-red)] w-full">
                <span className="pl-4 font-body-md text-body-md text-text-muted select-none">@</span>
                <input 
                  type="text"
                  placeholder="Test Username"
                  value={testUsername}
                  onChange={e => setTestUsername(e.target.value)}
                  className="w-full bg-transparent border-none text-text-primary font-body-md text-body-md py-3 px-3 focus:ring-0 placeholder-surface-container-high outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={!testUsername.trim()}
                className="w-full border border-velocity-red/50 text-velocity-red font-label-caps text-label-caps uppercase py-3 rounded hover:bg-velocity-red/10 disabled:opacity-50 transition-colors"
              >
                Login Anonymously
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
