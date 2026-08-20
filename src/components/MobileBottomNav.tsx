import { useLocation, useNavigate } from 'react-router-dom';
import { Gamepad2, User, Shield, PlusCircle } from 'lucide-react';
import { useGameStore } from '../store';

const OWNER_WALLET = '11111111111111111111111111111111';

interface MobileBottomNavProps {
  onOpenCreateMatch?: () => void;
}

export default function MobileBottomNav({ onOpenCreateMatch }: MobileBottomNavProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useGameStore();

  if (!user) return null;

  // Hide bottom nav on game screens to provide full immersion for the board
  const isGameRoute = location.pathname.startsWith('/game/') || location.pathname.startsWith('/watch/');
  if (isGameRoute) return null;

  const isLobby = location.pathname === '/';
  const isProfile = location.pathname.startsWith('/profile');
  const isAdminRoute = location.pathname === '/admin';

  const isOwner = user?.walletAddress === OWNER_WALLET;
  const isAdmin = isOwner || user?.isAdmin || user?.role === 'admin';

  return (
    <nav
      aria-label="Mobile Navigation"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#121212]/92 backdrop-blur-xl border-t border-white/10 px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] shadow-[0_-8px_30px_rgba(0,0,0,0.85)] flex items-center justify-around"
    >
      {/* Lobby Tab */}
      <button
        onClick={() => navigate('/')}
        className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all cursor-pointer ${
          isLobby
            ? 'text-velocity-red font-bold'
            : 'text-text-secondary hover:text-white'
        }`}
      >
        <Gamepad2 size={20} className={isLobby ? 'text-velocity-red' : 'text-text-muted'} />
        <span className="text-[10px] uppercase font-mono tracking-wider">Lobby</span>
      </button>

      {/* Quick Play / Center Create Action */}
      <button
        onClick={() => {
          navigate('/');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        className="flex flex-col items-center justify-center -mt-5 cursor-pointer group"
      >
        <div className="w-12 h-12 rounded-full bg-velocity-red text-white flex items-center justify-center shadow-[0_0_20px_rgba(255,77,77,0.6)] group-active:scale-95 transition-transform border-2 border-[#121212]">
          <PlusCircle size={24} />
        </div>
        <span className="text-[9px] uppercase font-mono tracking-wider text-velocity-red font-bold mt-0.5">Play</span>
      </button>

      {/* Profile Tab */}
      <button
        onClick={() => navigate('/profile')}
        className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all cursor-pointer ${
          isProfile
            ? 'text-velocity-red font-bold'
            : 'text-text-secondary hover:text-white'
        }`}
      >
        <User size={20} className={isProfile ? 'text-velocity-red' : 'text-text-muted'} />
        <span className="text-[10px] uppercase font-mono tracking-wider">Profile</span>
      </button>

      {/* Admin Tab (If Admin / Owner) */}
      {isAdmin && (
        <button
          onClick={() => navigate('/admin')}
          className={`flex flex-col items-center gap-1 py-1 px-3 rounded-xl transition-all cursor-pointer ${
            isAdminRoute
              ? 'text-velocity-red font-bold'
              : 'text-text-secondary hover:text-white'
          }`}
        >
          <Shield size={20} className={isAdminRoute ? 'text-velocity-red' : 'text-text-muted'} />
          <span className="text-[10px] uppercase font-mono tracking-wider">Admin</span>
        </button>
      )}
    </nav>
  );
}
