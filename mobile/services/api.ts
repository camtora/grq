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

/** Stream the Ask-Alfred chat (POST /api/chat SSE) — RN's fetch can't read
 * response bodies progressively, so this rides XMLHttpRequest's incremental
 * responseText. Frames: `data: {type: "text"|"status"|"error", text}`. */
export async function streamChat(
  body: { message: string; symbol?: string; owner?: string },
  handlers: {
    onText: (fullTextSoFar: string) => void;
    onStatus: (status: string | null) => void;
    onDone: (finalText: string) => void;
    onError: (message: string) => void;
  },
): Promise<void> {
  const token = await getToken();
  const xhr = new XMLHttpRequest();
  let framesSeen = 0;
  let acc = '';

  const pump = (final: boolean) => {
    const parts = xhr.responseText.split('\n\n');
    const complete = final ? parts : parts.slice(0, -1);
    for (; framesSeen < complete.length; framesSeen++) {
      const line = complete[framesSeen];
      if (!line.startsWith('data: ')) continue;
      try {
        const ev = JSON.parse(line.slice(6)) as { type: string; text?: string };
        if (ev.type === 'text' && ev.text) {
          acc += (acc ? '\n\n' : '') + ev.text;
          handlers.onText(acc);
          handlers.onStatus(null);
        } else if (ev.type === 'status' && ev.text) {
          handlers.onStatus(ev.text);
        } else if (ev.type === 'error' && ev.text) {
          handlers.onError(ev.text);
        }
      } catch {
        /* partial frame */
      }
    }
  };

  await new Promise<void>((resolve) => {
    xhr.open('POST', `${BASE_URL}/api/chat`);
    xhr.setRequestHeader('Content-Type', 'application/json');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3) pump(false);
      if (xhr.readyState === 4) {
        if (xhr.status >= 200 && xhr.status < 300) pump(true);
        else handlers.onError(`Chat failed (HTTP ${xhr.status}).`);
        handlers.onDone(acc);
        resolve();
      }
    };
    xhr.onerror = () => {
      handlers.onError('Chat connection failed.');
      handlers.onDone(acc);
      resolve();
    };
    xhr.send(JSON.stringify(body));
  });
}

/** Trade a Google ID token for a GRQ-JWT (members only). */
export async function loginWithGoogle(idToken: string): Promise<void> {
  const { token } = await api<{ token: string }>('/api/auth/google', {
    method: 'POST',
    body: JSON.stringify({ idToken }),
  });
  await setToken(token);
}
