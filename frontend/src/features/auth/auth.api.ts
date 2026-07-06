import { api } from '@/api/client';
import type { AuthUser, Peran } from '@/types/auth.types';

interface LoginResponse {
  peran: Peran;
  nama: string;
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/auth/login', { username, password });
  return data;
}

export async function logout(): Promise<void> {
  await api.post('/auth/logout');
}

export async function refresh(): Promise<void> {
  await api.post('/auth/refresh');
}

export async function getMe(): Promise<AuthUser> {
  const { data } = await api.get<AuthUser>('/auth/me');
  return data;
}
