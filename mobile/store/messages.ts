import { create } from 'zustand';
import { api } from '../services/api';

/** The Cam↔Graham DM badge (D61). Refreshed when a chrome header mounts;
 * zeroed when the thread is opened (POST /api/messages/read). */
type MessagesState = {
  unread: number;
  setUnread: (n: number) => void;
  refreshUnread: () => Promise<void>;
};

export const useMessages = create<MessagesState>((set) => ({
  unread: 0,
  setUnread: (n) => set({ unread: n }),
  refreshUnread: async () => {
    try {
      const { unread } = await api<{ unread: number }>('/api/messages/unread');
      set({ unread });
    } catch {
      /* badge is best-effort */
    }
  },
}));
