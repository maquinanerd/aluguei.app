import { describe, expect, it } from 'vitest';
import {
  canTransitionProposal,
  canTransitionVisit,
  isProposalExpired,
  PROPOSAL_STATUSES,
  proposalEditable as domainProposalEditable,
  VISIT_STATUSES,
  visitReschedulable,
} from '@aluguei/domain';
import {
  canRescheduleVisit,
  civilDateFromInput,
  proposalActions,
  proposalEditable,
  proposalValidityError,
  proposalValidityLabel,
  visitActions,
} from './crm-lifecycle';

/**
 * G3, trilha D (auditoria 2026-09-10, P2-02): ações da visita e da proposta nas telas. As regras
 * espelham o domínio sem importá-lo no bundle do cliente; aqui cada uma é comparada com a dele.
 */
describe('ações da visita = domínio', () => {
  it('cada status mostra exatamente as transições que o domínio aceita', () => {
    for (const from of VISIT_STATUSES) {
      const actions = visitActions(from);
      for (const to of VISIT_STATUSES) {
        // Voltar para agendada é o reagendamento, que tem ação própria.
        if (to === from || to === 'SCHEDULED') {
          continue;
        }
        const offered = actions.find((action) => action.to === to);
        expect(Boolean(offered), `${from} → ${to}`).toBe(
          canTransitionVisit(from, to, { reason: 'motivo' }),
        );
        if (offered) {
          expect(offered.needsReason, `${from} → ${to} motivo`).toBe(
            !canTransitionVisit(from, to, {}),
          );
        }
      }
      expect(canRescheduleVisit(from), from).toBe(visitReschedulable(from));
    }
  });

  it('rótulos em português, cancelar pede motivo', () => {
    expect(visitActions('SCHEDULED').map((action) => action.label)).toEqual([
      'Confirmar',
      'Marcar realizada',
      'Não compareceu',
      'Cancelar',
    ]);
    expect(visitActions('SCHEDULED').find((action) => action.to === 'CANCELLED')).toMatchObject({
      needsReason: true,
      tone: 'danger',
    });
    expect(visitActions('DONE')).toEqual([]);
  });
});

describe('ações da proposta = domínio', () => {
  it('cada status mostra exatamente as transições que o domínio aceita', () => {
    for (const from of PROPOSAL_STATUSES) {
      const actions = proposalActions(from);
      for (const to of PROPOSAL_STATUSES) {
        if (to === from || to === 'EXPIRED') {
          continue; // expirar é do worker, não da tela
        }
        const offered = actions.find((action) => action.to === to);
        expect(Boolean(offered), `${from} → ${to}`).toBe(
          canTransitionProposal(from, to, { reason: 'motivo', validUntil: '2099-12-31' }),
        );
        if (offered) {
          expect(offered.needsReason, `${from} → ${to} motivo`).toBe(
            !canTransitionProposal(from, to, { validUntil: '2099-12-31' }),
          );
          expect(offered.needsValidity, `${from} → ${to} validade`).toBe(
            !canTransitionProposal(from, to, { reason: 'motivo' }),
          );
        }
      }
      expect(proposalEditable(from), from).toBe(domainProposalEditable(from));
    }
    expect(proposalActions('SENT').map((action) => action.label)).toEqual(['Aceitar', 'Recusar']);
  });

  it('validade: data civil de hoje em diante; vencida igual ao domínio', () => {
    const today = '2026-09-21';
    expect(proposalValidityError('', today)).toBe('Informe a validade');
    expect(proposalValidityError('2026-02-30', today)).toBe('Data inexistente');
    expect(proposalValidityError('2026-09-20', today)).toBe(
      'A validade precisa ser hoje ou uma data futura',
    );
    expect(proposalValidityError('2026-09-21', today)).toBeNull();
    for (const [validUntil, day] of [
      ['2026-09-21', '2026-09-21'],
      ['2026-09-21', '2026-09-22'],
      ['2026-09-21', '2026-09-20'],
    ] as const) {
      expect(proposalValidityLabel('SENT', validUntil, day).expired, `${validUntil} ${day}`).toBe(
        isProposalExpired(validUntil, day),
      );
    }
    expect(proposalValidityLabel('SENT', null, today)).toEqual({ text: '—', expired: false });
    // Só a enviada "vence": aceita com a data passada não aparece como vencida.
    expect(proposalValidityLabel('ACCEPTED', '2026-09-01', today).expired).toBe(false);
  });

  it('o campo de data do formulário vira data civil sem passar por instante', () => {
    expect(civilDateFromInput('2026-10-10')).toBe('2026-10-10');
    expect(civilDateFromInput(' 2026-10-10 ')).toBe('2026-10-10');
    expect(civilDateFromInput('')).toBeNull();
    expect(civilDateFromInput('10/10/2026')).toBeNull();
  });
});
