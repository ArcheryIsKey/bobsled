import { create } from 'zustand';

export interface User {
  id?: string;
  walletAddress: string | null;
  username: string;
  avatarUrl?: string;
  bannerUrl?: string;
  isTestUser?: boolean;
  isAdmin?: boolean;
  role?: string;
  createdAt?: any;
}

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
}

interface GameState {
  user: User | null;
  solBalance: number | null;
  toasts: ToastItem[];
  setUser: (user: User | null) => void;
  setSolBalance: (balance: number | null) => void;
  addToast: (type: ToastItem['type'], message: string, durationMs?: number) => void;
  removeToast: (id: string) => void;
}

export const useGameStore = create<GameState>((set) => ({
  user: null,
  solBalance: null,
  toasts: [],
  setUser: (user) => set({ user }),
  setSolBalance: (solBalance) => set({ solBalance }),
  addToast: (type, message, durationMs = 4000) => {
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: ToastItem = { id, type, message };
    set((state) => ({ toasts: [...(state.toasts || []), newToast] }));
    setTimeout(() => {
      set((state) => ({ toasts: (state.toasts || []).filter((t) => t.id !== id) }));
    }, durationMs);
  },
  removeToast: (id) => set((state) => ({ toasts: (state.toasts || []).filter((t) => t.id !== id) })),
}));

