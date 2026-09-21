/**
 * Ações da conversa na caixa de entrada (auditoria 2026-09-10, P1-18). Espelha as transições de
 * packages/domain/src/whatsapp/conversation.ts sem importar o pacote de domínio no bundle do
 * cliente; conversation-rules.test.ts compara com canTransitionConversation.
 */
export interface ConversationActions {
  /** Passar a conversa para a equipe (o bot para de responder). */
  handoff: boolean;
  /** Devolver a conversa ao atendimento automático. */
  resume: boolean;
}

export function conversationActions(status: string): ConversationActions {
  return {
    handoff: status === 'OPEN' || status === 'ACTIVE',
    resume: status === 'NEEDS_HUMAN',
  };
}
