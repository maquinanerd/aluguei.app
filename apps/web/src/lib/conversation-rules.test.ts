import { describe, expect, it } from 'vitest';
import { CONVERSATION_STATUSES, canTransitionConversation } from '@aluguei/domain';
import { conversationActions } from './conversation-rules';

/**
 * G3, trilha E (auditoria 2026-09-10, P1-18): a caixa de entrada mostrava "Assumir" numa conversa
 * já em atendimento humano, e o botão chamava o próprio handoff (sem efeito). Quem está com a
 * conversa precisa é devolvê-la ao atendimento automático.
 */
describe('conversationActions — o que a caixa de entrada oferece', () => {
  it('pedir atendimento humano segue o domínio; devolver só de NEEDS_HUMAN', () => {
    for (const status of CONVERSATION_STATUSES) {
      const actions = conversationActions(status);
      expect(actions.handoff, `handoff ${status}`).toBe(
        status !== 'NEEDS_HUMAN' && canTransitionConversation(status, 'NEEDS_HUMAN'),
      );
      expect(actions.resume, `devolver ${status}`).toBe(status === 'NEEDS_HUMAN');
    }
  });

  it('cada status tem exatamente uma ação, e status desconhecido não tem nenhuma', () => {
    expect(conversationActions('OPEN')).toEqual({ handoff: true, resume: false });
    expect(conversationActions('ACTIVE')).toEqual({ handoff: true, resume: false });
    expect(conversationActions('NEEDS_HUMAN')).toEqual({ handoff: false, resume: true });
    expect(conversationActions('CLOSED')).toEqual({ handoff: false, resume: false });
    expect(conversationActions('OUTRO')).toEqual({ handoff: false, resume: false });
  });
});
