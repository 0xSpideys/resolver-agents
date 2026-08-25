"use client";

import { useEffect, useState } from "react";

export interface AsyncState<T> {
  data?: T;
  error?: string;
  loading: boolean;
}

/**
 * Run a promise on mount and whenever `key` changes.
 *
 * The site is a static export, so every chain read happens in the browser. That
 * is also the right shape for a dApp: a page built from chain state at deploy
 * time would show whoever opens it a snapshot of the past and call it current.
 *
 * The result carries the key it was fetched for, and a result for a stale key
 * reads as still-loading. That avoids resetting state synchronously inside the
 * effect, which costs a cascading render on every mount, and it means a changed
 * key can never briefly show the previous key's data.
 */
export function useAsync<T>(key: string, fn: () => Promise<T>): AsyncState<T> {
  const [result, setResult] = useState<(AsyncState<T> & { key: string }) | null>(null);

  useEffect(() => {
    let live = true;
    fn()
      .then((data) => {
        if (live) setResult({ key, data, loading: false });
      })
      .catch((err: Error) => {
        if (live) setResult({ key, error: err.message, loading: false });
      });
    return () => {
      live = false;
    };
    // `fn` is an inline closure at most call sites and would restart the fetch
    // on every render if it were a dependency. The key identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return result && result.key === key ? result : { loading: true };
}
