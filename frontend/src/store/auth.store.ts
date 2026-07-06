import { create } from 'zustand';
import type { AuthUser, Peran } from '@/types/auth.types';

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  userId: number | null;
  peran: Peran | null;
  nama: string | null;
  status: AuthStatus;
  setUser: (user: AuthUser) => void;
  clearUser: () => void;
  setLoading: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  peran: null,
  nama: null,
  status: 'idle',
  setUser: ({ userId, peran, nama }) => set({ userId, peran, nama, status: 'authenticated' }),
  clearUser: () => set({ userId: null, peran: null, nama: null, status: 'unauthenticated' }),
  setLoading: () => set({ status: 'loading' }),
}));
