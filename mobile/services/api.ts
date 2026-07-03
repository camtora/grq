import * as SecureStore from 'expo-secure-store';

/**
 * GRQ mobile API client — same backend the native app uses:
 * Google ID token → POST /api/auth/google → GRQ-JWT, then Bearer on every call.
 * Wire shapes live in shared/contract.ts; feed builders in web/lib/feed.ts.
 */
export const BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://grq.camerontora.ca';

const TOKEN_KEY = 'grq_jwt';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    // Backend errors carry a plain-English {error} — surface it (e.g. the
    // members-only 403) instead of a bare status code.
    let detail = '';
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) detail = ` — ${body.error}`;
    } catch {}
    throw new Error(`GRQ API ${res.status} on ${path}${detail}`);
  }
  return res.json() as Promise<T>;
}

/** Trade a Google ID token for a GRQ-JWT (members only). */
export async function loginWithGoogle(idToken: string): Promise<void> {
  const { token } = await api<{ token: string }>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
  await setToken(token);
}
