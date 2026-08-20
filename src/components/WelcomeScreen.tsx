import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

export default function WelcomeScreen() {
  return (
    <div className="bg-surface-base text-text-primary min-h-[calc(100vh-64px)] flex flex-col font-body-md relative overflow-hidden w-full">
      {/* Background Atmospheric Effect */}
      <div className="absolute inset-0 pointer-events-none z-0">
        <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-velocity-red/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[600px] h-[600px] bg-surface-elevated/20 rounded-full blur-[100px]" />
      </div>

      <main className="flex-grow flex items-center justify-center p-4 md:p-8 relative z-10 w-full max-w-md mx-auto py-16">
        <div className="bg-[#161616]/95 backdrop-blur-[16px] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)] rounded-xl w-full overflow-hidden transition-all duration-300">
          
          <div className="w-full bg-surface-container-highest h-1">
            <div className="bg-velocity-red h-full w-full opacity-80" />
          </div>

          <div className="p-8 md:p-10 flex flex-col gap-8 items-center text-center">
            {/* Logo & Headline */}
            <div className="space-y-2 flex flex-col items-center">
              <img src="/logo.jpg" alt="bobsled.gg logo" className="w-16 h-16 mix-blend-screen mb-2" />
              <h1 className="font-headline-lg text-3xl md:text-4xl text-text-primary font-bold tracking-tight">
                bobsled<span className="text-velocity-red">.</span>gg
              </h1>
              <p className="font-body-sm text-text-secondary text-sm max-w-xs leading-relaxed">
                Connect 4 with instant Solana stakes. Connect your wallet to play.
              </p>
            </div>

            {/* Wallet Connect Button */}
            <div className="w-full flex justify-center">
              <WalletMultiButton className="!w-full !justify-center !bg-velocity-red hover:!bg-red-600 !text-white !font-semibold !text-sm !py-3.5 !px-6 !transition-all !rounded-md !shadow-[0_0_20px_rgba(255,77,77,0.35)]" />
            </div>

            {/* Sub-info */}
            <div className="pt-4 border-t border-white/10 w-full text-xs text-text-muted">
              Fast, provably fair multiplayer on Solana.
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
