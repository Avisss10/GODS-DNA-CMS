import { api } from '@/api/client';

export interface NotificationItem {
  id: number;
  user_id: number;
  jenis: string;
  judul: string;
  pesan: string;
  is_read: boolean;
  created_at: string;
}

// Query key terpusat — dipakai NotificationWidget (dashboard), Topbar,
// dan NotificationPage. invalidateQueries di satu tempat otomatis
// menyegarkan badge di semua tempat lain yang subscribe key ini.
export const notificationKeys = {
  all: ['notifications'] as const,
  unreadCount: () => [...notificationKeys.all, 'unread-count'] as const,
  list: (unread: boolean) => [...notificationKeys.all, 'list', unread ? 'unread' : 'all'] as const,
};

export async function getUnreadCount(): Promise<number> {
  const { data } = await api.get<{ count: number }>('/notifications/unread-count');
  return data.count;
}

interface ListNotificationParams {
  unread?: boolean;
}

// Dipakai juga oleh dashboard widget & modul Notification (Tahap 8) untuk daftar lengkap.
export async function listNotifications(params: ListNotificationParams = {}): Promise<NotificationItem[]> {
  const { data } = await api.get<NotificationItem[]>('/notifications', {
    params: params.unread ? { unread: 'true' } : undefined,
  });
  return data;
}

export async function markAsRead(id: number): Promise<{ message: string }> {
  const { data } = await api.patch<{ message: string }>(`/notifications/${id}/read`);
  return data;
}

export async function markAllAsRead(): Promise<{ message: string }> {
  const { data } = await api.patch<{ message: string }>('/notifications/read-all');
  return data;
}