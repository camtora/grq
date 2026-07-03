import { create } from 'zustand';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { api, setToken, getToken } from '../services/api';

/**
 * Auth state — the GRQ-JWT flow the native app used (docs/IOS-PLAN.md):
 * Google ID token → POST /api/auth/google → GRQ-JWT in SecureStore → Bearer on
 * every call. Members-only is enforced server-side; we just surface the 403.
 */
export type Me = {
  email: string;
  name: string | null;
  role: string;
  theme: string;
  totalPnlCents: number;
  contributionsCents: number;
};

type AuthState = {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: Me | null;
  signingIn: boolean;
  error: string | null;
  hydrate: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

export const useAuth = create<AuthState>((set) => ({
  status: 'loading',
  me: null,
  signingIn: false,
  error: null,

  // App boot: a stored JWT + a live /api/auth/me = signed in. Runs behind the splash.
  hydrate: async () => {
    try {
      const token = await getToken();
      if (!token) {
        set({ status: 'signedOut' });
        return;
      }
      const me = await api<Me>('/api/auth/me');
      set({ status: 'signedIn', me });
    } catch (e) {
      // 401 = expired/revoked JWT; anything else (offline) also lands on the
      // sign-in screen rather than wedging the app on the splash.
      if (e instanceof Error && e.message.includes('401')) await setToken(null);
      set({ status: 'signedOut' });
    }
  },

  signInWithGoogle: async () => {
    set({ signingIn: true, error: null });
    try {
      const result = await GoogleSignin.signIn();
      const idToken = result.data?.idToken;
      if (!idToken) throw new Error('Google returned no ID token.');
      const { token, me } = await api<{ token: string; me: Me }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ idToken }),
      });
      await setToken(token);
      set({ status: 'signedIn', me, signingIn: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Sign-in failed.';
      // User backing out of the Google sheet isn't an error worth showing.
      const cancelled = /cancel/i.test(msg);
      set({ signingIn: false, error: cancelled ? null : msg });
    }
  },

  signOut: async () => {
    await setToken(null);
    try {
      await GoogleSignin.signOut();
    } catch {}
    set({ status: 'signedOut', me: null });
  },
}));
