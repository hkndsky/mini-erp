import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../api/client';

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Minimal fetch-state hook. `fn` is read through a ref so pages can inline
 * query objects without triggering re-fetches on every render; `deps` lists
 * the query inputs (page, filters…).
 */
export function useAsync<T>(fn: () => Promise<T>, deps: readonly unknown[] = []): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fnRef
      .current()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState((s) => ({ ...s, error: errorMessage(err), loading: false }));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
