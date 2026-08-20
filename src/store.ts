import { create } from 'zustand';

export interface User {
  id?: string;
  walletAddress: string | null;
  username: string;
  avatarUrl?: string;
  bannerUrl?: string;
  createdAt?: any;
}

interface GameState {
  user: User | null;
  solBalance: number | null;
  setUser: (user: User | null) => void;
  setSolBalance: (balance: number | null) => void;
}

export const useGameStore = create<GameState>((set) => ({
  user: null,
  solBalance: null,
  setUser: (user) => set({ user }),
  setSolBalance: (solBalance) => set({ solBalance }),
}));
