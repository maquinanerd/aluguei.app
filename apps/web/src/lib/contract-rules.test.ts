import { describe, expect, it } from 'vitest';
import { canTransitionContract, CONTRACT_STATUSES } from '@aluguei/domain';
import { contractActions, eligibleApplicationsForContract } from './contract-rules';

/**
 * Telas de contrato diante das regras da trilha A do G2 (P0-04 e P1-06, ADRs
 * G2A-1 e G2A-2): o texto só é gerado em DRAFT; em GENERATED sem envelope a
 * regeneração é explícita (`{ regenerate: true }`) e vira nova versão; a partir
 * do envio o texto fica congelado; SIGNED e VOID são terminais; DRAFT não vai
 * direto para VOID. Contrato novo só nasce de candidatura APPROVED — em
 * CONTRACTING já existe contrato e a API responde 409.
 */
describe('contractActions — ações oferecidas no detalhe do contrato', () => {
  it('DRAFT: gerar o texto; sem enviar nem cancelar', () => {
    expect(contractActions({ status: 'DRAFT' }, null)).toEqual({
      generate: { body: {} },
      regenerate: null,
      send: false,
      void: false,
    });
  });

  it('GENERATED sem envelope: regerar com regenerate: true, enviar e cancelar', () => {
    expect(contractActions({ status: 'GENERATED' }, null)).toEqual({
      generate: null,
      regenerate: { body: { regenerate: true } },
      send: true,
      void: true,
    });
  });

  it('GENERATED com envelope registrado: não oferece regerar', () => {
    expect(contractActions({ status: 'GENERATED' }, { status: 'FAILED' }).regenerate).toBeNull();
  });

  it.each(['SENT_FOR_SIGNATURE', 'PARTIALLY_SIGNED'])(
    '%s: texto congelado — só cancelar',
    (status) => {
      expect(contractActions({ status }, { status: 'SENT' })).toEqual({
        generate: null,
        regenerate: null,
        send: false,
        void: true,
      });
    },
  );

  it.each(['SIGNED', 'VOID'])('%s: estado terminal, nenhuma ação', (status) => {
    expect(contractActions({ status }, null)).toEqual({
      generate: null,
      regenerate: null,
      send: false,
      void: false,
    });
  });

  it('cancelar aparece exatamente onde o domínio permite ir para VOID', () => {
    for (const status of CONTRACT_STATUSES) {
      const allowed = status !== 'VOID' && canTransitionContract(status, 'VOID');
      expect(contractActions({ status }, null).void, status).toBe(allowed);
    }
  });
});

describe('eligibleApplicationsForContract — candidaturas no modal de novo contrato', () => {
  it('só APPROVED', () => {
    const applications = [
      'DRAFT',
      'SUBMITTED',
      'SCREENING',
      'MANUAL_REVIEW',
      'APPROVED',
      'REJECTED',
      'CONTRACTING',
    ].map((status, index) => ({ id: String(index), status }));
    expect(eligibleApplicationsForContract(applications).map((a) => a.status)).toEqual([
      'APPROVED',
    ]);
  });
});
