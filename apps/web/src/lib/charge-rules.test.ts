import { describe, expect, it } from 'vitest';
import { canTransitionCharge, CHARGE_STATUSES } from '@aluguei/domain';
import { chargeActions } from './charge-rules';

/**
 * Ações da lista de cobranças diante do domínio (auditoria 2026-09-10, P1-17): a
 * cobrança agendada — o estado em que a cobrança nasce antes do vencimento — não
 * oferecia "Cancelar", embora o domínio permita; a vencida oferecia, e a API
 * responde 409 (vencida só é recebida ou reaberta).
 */
describe('chargeActions — o que a lista oferece em cada status', () => {
  it('SCHEDULED: receber e cancelar', () => {
    expect(chargeActions('SCHEDULED')).toEqual({ receive: true, cancel: true, refund: false });
  });

  it('OPEN: receber e cancelar', () => {
    expect(chargeActions('OPEN')).toEqual({ receive: true, cancel: true, refund: false });
  });

  it('OVERDUE: só receber — cobrança vencida não é cancelada', () => {
    expect(chargeActions('OVERDUE')).toEqual({ receive: true, cancel: false, refund: false });
  });

  it('PAID: só estornar', () => {
    expect(chargeActions('PAID')).toEqual({ receive: false, cancel: false, refund: true });
  });

  it.each(['CANCELLED', 'REFUNDED', 'DESCONHECIDO'])('%s: nenhuma ação', (status) => {
    expect(chargeActions(status)).toEqual({ receive: false, cancel: false, refund: false });
  });

  it('cada ação oferecida é uma transição que o domínio aceita', () => {
    for (const status of CHARGE_STATUSES) {
      const actions = chargeActions(status);
      expect(actions.receive, `${status} → PAID`).toBe(
        status !== 'PAID' && canTransitionCharge(status, 'PAID'),
      );
      expect(actions.cancel, `${status} → CANCELLED`).toBe(
        status !== 'CANCELLED' && canTransitionCharge(status, 'CANCELLED'),
      );
      expect(actions.refund, `${status} → REFUNDED`).toBe(
        status !== 'REFUNDED' && canTransitionCharge(status, 'REFUNDED'),
      );
    }
  });
});
