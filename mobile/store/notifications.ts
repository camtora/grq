import { create } from 'zustand';
import { api } from '../services/api';

/** The bell badge — unread count from the notifications feed (D63). */
type NotificationsState = {
  unread: number;
  setUnread: (n: number) => void;
  refreshUnread: () => Promise<void>;
};

export const useNotifications = create<NotificationsState>((set) => ({
  unread: 0,
  setUnread: (n) => set({ unread: n }),
  refreshUnread: async () => {
    try {
      const { unread } = await api<{ unread: number }>('/api/notifications');
      set({ unread });
    } catch {
      /* badge is best-effort */
    }
  },
}));
