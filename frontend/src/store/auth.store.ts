import { create } from 'zustand';

export type Peran = 'LEADER' | 'ADMIN';

interface AuthState {
  userId: number | null;
  peran: Peran | null;
  nama: string | null;
  setUser: (user: { userId: number; peran: Peran; nama: string }) => void;
  clearUser: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  peran: null,
  nama: null,
  setUser: ({ userId, peran, nama }) => set({ userId, peran, nama }),
  clearUser: () => set({ userId: null, peran: null, nama: null }),
}));
