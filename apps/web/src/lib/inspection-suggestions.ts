import { ApiClientError } from './api-client';

/**
 * Revisão de IA da vistoria diante das regras da trilha A do G2 (P1-05, ADR
 * G2A-5): a sugestão resolvida grava o status resultante — ACCEPTED, REJECTED
 * ou EDITED — e resolver de novo responde 409. Os valores espelham
 * `suggestionStatusSchema` de @aluguei/contracts (conferido no teste).
 */
export type SuggestionStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EDITED';

export type SuggestionTone = 'neutral' | 'warning' | 'success' | 'danger' | 'info';

export const SUGGESTION_STATUS_LABELS: Readonly<Record<SuggestionStatus, string>> = {
  PENDING: 'Pendente',
  ACCEPTED: 'Aceita',
  REJECTED: 'Rejeitada',
  EDITED: 'Editada',
};

const SUGGESTION_STATUS_TONES: Readonly<Record<SuggestionStatus, SuggestionTone>> = {
  PENDING: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'danger',
  EDITED: 'info',
};

function isSuggestionStatus(status: string): status is SuggestionStatus {
  return Object.hasOwn(SUGGESTION_STATUS_LABELS, status);
}

export function suggestionStatusLabel(status: string): string {
  return isSuggestionStatus(status) ? SUGGESTION_STATUS_LABELS[status] : status;
}

export function suggestionStatusTone(status: string): SuggestionTone {
  return isSuggestionStatus(status) ? SUGGESTION_STATUS_TONES[status] : 'neutral';
}

/** Pendentes (com ação) e resolvidas (só leitura), na ordem recebida. */
export function splitSuggestions<T extends { status: string }>(
  list: readonly T[],
): { pending: T[]; resolved: T[] } {
  const pending: T[] = [];
  const resolved: T[] = [];
  for (const suggestion of list) {
    if (suggestion.status === 'PENDING') {
      pending.push(suggestion);
    } else {
      resolved.push(suggestion);
    }
  }
  return { pending, resolved };
}

export function suggestionResolveErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError && err.status === 409) {
    return 'Esta sugestão já foi resolvida. A lista foi atualizada.';
  }
  return err instanceof Error ? err.message : 'Falha ao resolver a sugestão.';
}
