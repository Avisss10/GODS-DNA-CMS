import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { toast } from '@/lib/toast';
import { router } from '@/routes';
import { useAuthStore } from '@/store/auth.store';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api',
  withCredentials: true,
});

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

// '/auth/me' TIDAK dikecualikan: heartbeat sesi & restore sesi awal (AppInit)
// sama-sama memanggil endpoint ini dan harus tetap bisa memicu auto-refresh.
const NO_REFRESH_PATHS = ['/auth/login', '/auth/refresh'];

let isRefreshing = false;
let pendingQueue: {
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  config: RetryableRequestConfig;
}[] = [];

function flushQueue(error: unknown) {
  pendingQueue.forEach(({ resolve, reject, config }) => {
    if (error) {
      reject(error);
    } else {
      resolve(api(config));
    }
  });
  pendingQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    const status = error.response?.status;
    const requestUrl = originalRequest?.url ?? '';
    const isAuthRoute = NO_REFRESH_PATHS.some((path) => requestUrl.includes(path));

    if (status !== 401 || isAuthRoute || !originalRequest || originalRequest._retry) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject, config: originalRequest });
      });
    }

    isRefreshing = true;
    try {
      await api.post('/auth/refresh');
      isRefreshing = false;
      flushQueue(null);
      return api(originalRequest);
    } catch (refreshError) {
      isRefreshing = false;
      flushQueue(refreshError);

      // Hanya tampilkan toast + redirect kalau user memang sedang dalam
      // sesi aktif (mis. heartbeat mendeteksi refresh token invalid).
      // Saat restore sesi awal (AppInit) gagal, status belum pernah
      // 'authenticated' â€” user memang belum pernah login, jangan tampilkan
      // toast "sesi berakhir" yang menyesatkan.
      const wasAuthenticated = useAuthStore.getState().status === 'authenticated';
      useAuthStore.getState().clearUser();
      if (wasAuthenticated) {
        toast.error('Sesi berakhir, silakan login kembali');
        router.navigate('/login');
      }
      return Promise.reject(refreshError);
    }
  },
);
