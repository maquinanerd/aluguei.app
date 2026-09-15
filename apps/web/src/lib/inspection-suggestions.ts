/**
 * CONTROLE NEGATIVO (versionado só no commit de RED): o que a revisão de IA
 * (inspections/[id]/inspection-detail-client.tsx) faz hoje — só as sugestões
 * PENDING aparecem, as resolvidas somem sem status, não há rótulo nem tom por
 * status e o erro da API é repetido cru. Substituído pela implementação no
 * commit de correção.
 */
export const SUGGESTION_STATUS_LABELS: Record<string, string> = {};

export function suggestionStatusTone(_status: string): string {
  return 'neutral';
}

export function splitSuggestions<T extends { status: string }>(
  list: readonly T[],
): { pending: T[]; resolved: T[] } {
  return { pending: list.filter((s) => s.status === 'PENDING'), resolved: [] };
}

export function suggestionResolveErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Falha';
}
