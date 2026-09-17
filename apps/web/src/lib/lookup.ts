'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ComboboxOption } from '@aluguei/ui';
import { apiClient } from './api-client';

/**
 * Referências nas telas do painel sem carregar a organização inteira (P1-01,
 * auditoria 2026-09-10). As telas pediam `limit=200` — a API aceita até 100 — e
 * o 400 deixava selects vazios e nomes "—".
 *
 *  - `useLookup`: resolve os nomes das linhas da página pelo parâmetro `ids`
 *    das listagens de pessoas, imóveis e anúncios (até 100 ids por chamada).
 *  - `useAllPages`: para listagens sem `ids` (candidaturas, contratos), percorre
 *    as páginas de 100 em 100, com teto explícito de páginas.
 *  - `searchProperties`: busca do combobox de imóvel (`q`, 20 resultados).
 *  - `searchParties`: busca do combobox de pessoa (`q`, 20 resultados).
 */

export type LookupResource = 'parties' | 'properties' | 'listings';

/** Ids por chamada: o mesmo teto do `limit=100` enviado na URL. */
const IDS_PER_REQUEST = 100;
/** Páginas de 100 percorridas por `useAllPages` antes de marcar a lista como truncada. */
const MAX_PAGES = 50;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Falha ao carregar';
}

export async function fetchByIds<T extends { id: string }>(
  resource: LookupResource,
  ids: readonly string[],
): Promise<Map<string, T>> {
  const unique = [...new Set(ids)];
  const found = new Map<string, T>();
  for (let start = 0; start < unique.length; start += IDS_PER_REQUEST) {
    const chunk = unique.slice(start, start + IDS_PER_REQUEST);
    const data = await apiClient<Partial<Record<LookupResource, T[]>>>(
      `/${resource}?limit=100&ids=${chunk.join(',')}`,
    );
    for (const row of data[resource] ?? []) {
      found.set(row.id, row);
    }
  }
  return found;
}

export interface LookupState<T> {
  map: ReadonlyMap<string, T>;
  loading: boolean;
  error: string | null;
}

/** Nomes das referências visíveis; recarrega quando o conjunto de ids muda. */
export function useLookup<T extends { id: string }>(
  resource: LookupResource,
  ids: ReadonlyArray<string | null | undefined>,
): LookupState<T> {
  const key = [...new Set(ids.filter((id): id is string => typeof id === 'string' && id !== ''))]
    .sort()
    .join(',');
  const [state, setState] = useState<LookupState<T>>({
    map: new Map(),
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (key === '') {
      setState({ map: new Map(), loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchByIds<T>(resource, key.split(','))
      .then((map) => {
        if (!cancelled) setState({ map, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ map: new Map(), loading: false, error: errorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [resource, key]);

  return state;
}

export async function fetchAllPages(
  path: string,
  key: string,
): Promise<{ rows: unknown[]; truncated: boolean }> {
  const rows: unknown[] = [];
  const separator = path.includes('?') ? '&' : '?';
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await apiClient<Partial<Record<string, unknown[]>>>(
      `${path}${separator}limit=100&offset=${String(page * 100)}`,
    );
    const batch = data[key] ?? [];
    rows.push(...batch);
    if (batch.length < 100) {
      return { rows, truncated: false };
    }
  }
  return { rows, truncated: true };
}

export interface AllPagesState<T> {
  rows: T[];
  loading: boolean;
  error: string | null;
  /** Mais registros do que o teto de páginas: a lista mostrada é parcial. */
  truncated: boolean;
  reload: () => void;
}

/** Todas as páginas de uma listagem sem `ids` (`null` não busca). */
export function useAllPages<T>(path: string | null, key: string): AllPagesState<T> {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Omit<AllPagesState<T>, 'reload'>>({
    rows: [],
    loading: path !== null,
    error: null,
    truncated: false,
  });
  const reload = useCallback(() => {
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (path === null) {
      setState({ rows: [], loading: false, error: null, truncated: false });
      return;
    }
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetchAllPages(path, key)
      .then(({ rows, truncated }) => {
        if (!cancelled) setState({ rows: rows as T[], loading: false, error: null, truncated });
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setState({ rows: [], loading: false, error: errorMessage(err), truncated: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [path, key, tick]);

  return { ...state, reload };
}

interface PropertyOptionRow {
  id: string;
  title: string;
  status: string;
}

/** Opções do combobox de imóvel: busca por trecho do título na organização. */
export async function searchProperties(
  query: string,
  signal: AbortSignal,
): Promise<ComboboxOption[]> {
  const params = new URLSearchParams({ limit: '20' });
  const text = query.trim();
  if (text !== '') {
    params.set('q', text);
  }
  const data = await apiClient<{ properties: PropertyOptionRow[] }>(
    `/properties?${params.toString()}`,
    { signal },
  );
  return data.properties.map((p) =>
    p.status === 'ARCHIVED'
      ? { value: p.id, label: p.title, description: 'Arquivado' }
      : { value: p.id, label: p.title },
  );
}

interface PartyOptionRow {
  id: string;
  name: string;
  type: string;
}

/**
 * Opções do combobox de pessoa: busca por trecho do nome, do e-mail ou dos dígitos
 * de CPF, CNPJ ou telefone (P1-17).
 */
export async function searchParties(query: string, signal: AbortSignal): Promise<ComboboxOption[]> {
  const params = new URLSearchParams({ limit: '20' });
  const text = query.trim();
  if (text !== '') {
    params.set('q', text);
  }
  const data = await apiClient<{ parties: PartyOptionRow[] }>(`/parties?${params.toString()}`, {
    signal,
  });
  return data.parties.map((p) =>
    p.type === 'COMPANY'
      ? { value: p.id, label: p.name, description: 'Empresa' }
      : { value: p.id, label: p.name },
  );
}
