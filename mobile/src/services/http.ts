import { tokenStore } from './tokenStore';

/** The BACI API. Unset → the app runs on sample data only (no sign-in, no real banks). */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? '').replace(/\/$/, '');
export const liveAvailable = Boolean(API_URL);

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

let token: string | null = null;
let onSignedOut: (() => void) | null = null;

export const session = {
  async load() {
    token = await tokenStore.get();
    return token;
  },
  async set(t: string) {
    token = t;
    await tokenStore.set(t);
  },
  async clear() {
    token = null;
    await tokenStore.clear();
  },
  has: () => Boolean(token),
  /** Called when the server says the session has ended (expired, signed out elsewhere, account deleted). */
  onSignedOut(fn: () => void) {
    onSignedOut = fn;
  },
};

export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new HttpError(0, 'network', 'Can’t reach BACI. Check your connection and try again.');
  }
  const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  if (!res.ok) {
    if (res.status === 401 && token && !path.startsWith('/v1/auth/')) {
      await session.clear();
      onSignedOut?.();
    }
    throw new HttpError(res.status, json.error?.code ?? 'internal', json.error?.message ?? `Request failed (${res.status})`);
  }
  return json as T;
}
