/**
 * Ações da lista de cobranças (auditoria 2026-09-10, P1-17). Espelha as
 * transições de packages/domain/src/finance/stateMachines.ts sem importar o pacote
 * de domínio no bundle do cliente; charge-rules.test.ts compara com
 * canTransitionCharge.
 */
export interface ChargeActions {
  /** Iniciar o recebimento (agendada, em aberto ou vencida). */
  receive: boolean;
  /** Cancelar: só antes de vencer — vencida é recebida ou reaberta. */
  cancel: boolean;
  refund: boolean;
}

const RECEIVABLE: readonly string[] = ['SCHEDULED', 'OPEN', 'OVERDUE'];
const CANCELLABLE: readonly string[] = ['SCHEDULED', 'OPEN'];

export function chargeActions(status: string): ChargeActions {
  return {
    receive: RECEIVABLE.includes(status),
    cancel: CANCELLABLE.includes(status),
    refund: status === 'PAID',
  };
}
