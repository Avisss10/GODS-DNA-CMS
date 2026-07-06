export type Peran = 'LEADER' | 'ADMIN';

export interface AuthUser {
  userId: number;
  peran: Peran;
  nama: string;
}
