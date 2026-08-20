import { create } from 'zustand';

export interface User {
  id?: string;
  walletAddress: string | null;
  username: string;
  elo: number;
  freeTokens: number;
  avatarUrl?: string;
  isTestUser?: boolean;
  testSolBalance?: number;
}

interface GameState {
  user: User | null;
  currentGameId: string | null;
  spectatingGameId: string | null;
  setUser: (user: User | null) => void;
  setCurrentGameId: (id: string | null) => void;
  setSpectatingGameId: (id: string | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  user: null,
  currentGameId: null,
  spectatingGameId: null,
  setUser: (user) => set({ user }),
  setCurrentGameId: (id) => set({ currentGameId: id, spectatingGameId: null }),
  setSpectatingGameId: (id) => set({ spectatingGameId: id, currentGameId: null }),
}));
