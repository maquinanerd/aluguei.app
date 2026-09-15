import { describe, expect, it } from 'vitest';
import { suggestionStatusSchema } from '@aluguei/contracts';
import { ApiClientError } from './api-client';
import {
  splitSuggestions,
  SUGGESTION_STATUS_LABELS,
  suggestionResolveErrorMessage,
  suggestionStatusTone,
} from './inspection-suggestions';

/**
 * Revisão de IA da vistoria diante das regras da trilha A do G2 (P1-05, ADR
 * G2A-5): a sugestão resolvida grava o status resultante — ACCEPTED, REJECTED
 * ou EDITED — e resolver de novo responde 409. A tela lista as resolvidas com o
 * status (antes sumiam) e explica o 409 em vez de repetir a mensagem crua.
 */
describe('status das sugestões de IA', () => {
  it('todo status do contrato da API tem rótulo em pt-BR', () => {
    for (const status of suggestionStatusSchema.options) {
      expect(SUGGESTION_STATUS_LABELS[status], status).toBeTruthy();
    }
    expect(SUGGESTION_STATUS_LABELS).toEqual({
      PENDING: 'Pendente',
      ACCEPTED: 'Aceita',
      REJECTED: 'Rejeitada',
      EDITED: 'Editada',
    });
  });

  it.each([
    ['PENDING', 'warning'],
    ['ACCEPTED', 'success'],
    ['REJECTED', 'danger'],
    ['EDITED', 'info'],
    ['ACCEPT', 'neutral'],
  ] as const)('%s → tom %s', (status, tone) => {
    expect(suggestionStatusTone(status)).toBe(tone);
  });

  it('separa pendentes (com ação) das resolvidas (só leitura), na ordem recebida', () => {
    const list = [
      { id: 'a', status: 'PENDING' },
      { id: 'b', status: 'ACCEPTED' },
      { id: 'c', status: 'REJECTED' },
      { id: 'd', status: 'EDITED' },
      { id: 'e', status: 'PENDING' },
    ];
    const { pending, resolved } = splitSuggestions(list);
    expect(pending.map((s) => s.id)).toEqual(['a', 'e']);
    expect(resolved.map((s) => s.id)).toEqual(['b', 'c', 'd']);
  });
});

describe('suggestionResolveErrorMessage', () => {
  it('409: a sugestão já foi resolvida — a tela explica e recarrega', () => {
    const err = new ApiClientError(409, 'Sugestão já resolvida', 'CONFLICT');
    expect(suggestionResolveErrorMessage(err)).toBe(
      'Esta sugestão já foi resolvida. A lista foi atualizada.',
    );
  });

  it('outros erros da API mantêm a mensagem recebida', () => {
    expect(suggestionResolveErrorMessage(new ApiClientError(400, 'Descrição obrigatória'))).toBe(
      'Descrição obrigatória',
    );
  });

  it('erro desconhecido tem mensagem genérica', () => {
    expect(suggestionResolveErrorMessage('boom')).toBe('Falha ao resolver a sugestão.');
  });
});
