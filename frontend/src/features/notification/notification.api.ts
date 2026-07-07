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

export async function getUnreadCount(): Promise<number> {
  const { data } = await api.get<{ count: number }>('/notifications/unread-count');
  return data.count;
}

interface ListNotificationParams {
  unread?: boolean;
}

// Dipakai juga oleh modul Notification (Tahap 8) untuk daftar lengkap.
export async function listNotifications(params: ListNotificationParams = {}): Promise<NotificationItem[]> {
  const { data } = await api.get<NotificationItem[]>('/notifications', {
    params: params.unread ? { unread: 'true' } : undefined,
  });
  return data;
}