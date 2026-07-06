import { useQuery } from '@tanstack/react-query';
import { getMe } from '@/features/auth/auth.api';

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Ping /auth/me berkala selagi user berada di area terautentikasi.
 * Placeholder pages di Tahap 1 tidak memanggil API sama sekali, jadi
 * tanpa heartbeat ini interceptor auto-refresh (client.ts) tidak
 * pernah punya request nyata untuk mendeteksi sesi kadaluwarsa/invalid.
 */
export function useSessionHeartbeat() {
  useQuery({
    queryKey: ['session-heartbeat'],
    queryFn: getMe,
    refetchInterval: HEARTBEAT_INTERVAL_MS,
    refetchOnWindowFocus: true,
    retry: false,
  });
}
