import { api } from '@/api/client';
import type { Peran } from '@/types/auth.types';

export interface ManagedUser {
  id: number;
  username: string;
  peran: Peran;
  aktif: boolean;
  last_login_at: string | null;
}

export interface CreateUserInput {
  username: string;
  password: string;
  peran: Peran;
}

// GET /users — SEMUA user (LEADER+ADMIN), bukan /users/admins.
export async function listUsers(): Promise<ManagedUser[]> {
  const { data } = await api.get<ManagedUser[]>('/users');
  return data;
}

// 409 kalau username sudah ada — tangani via isAxiosError di caller.
export async function createUser(input: CreateUserInput): Promise<{ id: number; username: string; peran: Peran }> {
  const { data } = await api.post('/users', input);
  return data;
}

// Hanya berlaku utk target ber-peran ADMIN — backend balas 403 kalau target LEADER.
// Sesi aktif target langsung diinvalidasi backend setelah reset.
export async function resetPassword(id: number, newPassword: string): Promise<{ message: string }> {
  const { data } = await api.put<{ message: string }>(`/users/${id}/reset-password`, { newPassword });
  return data;
}

// 400 kalau ini akan menonaktifkan satu-satunya LEADER aktif.
export async function updateUserStatus(id: number, aktif: boolean): Promise<{ message: string }> {
  const { data } = await api.patch<{ message: string }>(`/users/${id}/status`, { aktif });
  return data;
}