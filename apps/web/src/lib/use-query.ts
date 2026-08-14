'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiClient, ApiClientError } from './api-client';

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
  reload: () => void;
  setData: (updater: (prev: T | null) => T) => void;
}

/** Hook de query simples: loading/error/permission/retry para client components. */
export function useQuery<T>(path: string | null, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  const depsKey = JSON.stringify(deps);

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPermissionDenied(false);
    apiClient<T>(path)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          setPermissionDenied(true);
        } else {
          setError(err instanceof Error ? err.message : 'Falha ao carregar');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, tick, depsKey]);

  return { data, loading, error, permissionDenied, reload, setData };
}
