'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PlanModule } from '@aluguei/domain';
import { apiClient, ApiClientError, moduloForaDoPlano } from './api-client';
import { useAvisarForaDoPlano } from '@/components/shell/fora-do-plano';

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  permissionDenied: boolean;
  /**
   * Módulo fora do plano quando o 403 é `PLAN_MODULE_NOT_INCLUDED`: a tela mostra o upgrade, não
   * o "sem permissão" genérico (defeito 13). `permissionDenied` continua verdadeiro junto.
   */
  foraDoPlano: PlanModule | null;
  reload: () => void;
  setData: (updater: (prev: T | null) => T) => void;
}

/** Hook de query simples: loading/error/permission/retry para client components. */
export function useQuery<T>(path: string | null, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [foraDoPlano, setForaDoPlano] = useState<PlanModule | null>(null);
  const [tick, setTick] = useState(0);
  const avisarForaDoPlano = useAvisarForaDoPlano();

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
    setForaDoPlano(null);
    apiClient<T>(path)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiClientError && (err.status === 401 || err.status === 403)) {
          setPermissionDenied(true);
          const modulo = moduloForaDoPlano(err);
          setForaDoPlano(modulo);
          if (modulo) avisarForaDoPlano(modulo);
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
  }, [path, tick, depsKey, avisarForaDoPlano]);

  return { data, loading, error, permissionDenied, foraDoPlano, reload, setData };
}
