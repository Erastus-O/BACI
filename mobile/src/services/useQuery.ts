import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ApiError, serverEvents } from './api';

/** Re-renders whenever server state changes. */
export function useServerVersion() {
  return useSyncExternalStore(serverEvents.subscribe, serverEvents.getVersion, serverEvents.getVersion);
}

export type Query<T> = { data: T | undefined; error: ApiError | Error | null; loading: boolean; reload: () => void };

/** Loads `fn`, and re-loads whenever server state changes (like a cache invalidation). */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): Query<T> {
  const v = useServerVersion();
  const [data, setData] = useState<T>();
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let live = true;
    setLoading(true);
    fnRef
      .current()
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e) => live && setError(e))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v, nonce, ...deps]);

  return { data, error, loading: loading && data === undefined, reload: useCallback(() => setNonce((n) => n + 1), []) };
}

/** Runs a mutation with busy / error state. */
export function useMutation<A extends unknown[], R>(fn: (...args: A) => Promise<R>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const run = useCallback(
    async (...args: A): Promise<{ ok: true; value: R } | { ok: false; error: Error }> => {
      setBusy(true);
      setError(null);
      try {
        return { ok: true, value: await fn(...args) };
      } catch (e) {
        setError(e as Error);
        return { ok: false, error: e as Error };
      } finally {
        setBusy(false);
      }
    },
    [fn],
  );
  return { run, busy, error, clearError: () => setError(null) };
}

export const isConsentError = (e: unknown) => e instanceof ApiError && e.code === 'consent_required';
