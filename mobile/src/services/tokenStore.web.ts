// Web: the session token lives in this browser's localStorage (cleared on sign out).
const KEY = 'baci.session';

const safe = <T,>(fn: () => T, fallback: T) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const tokenStore = {
  get: async () => safe(() => window.localStorage.getItem(KEY), null),
  set: async (token: string) => safe(() => window.localStorage.setItem(KEY, token), undefined),
  clear: async () => safe(() => window.localStorage.removeItem(KEY), undefined),
};
