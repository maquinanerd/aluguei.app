import { describe, expect, it } from 'vitest';
import { INSPECTION_STATUSES, canWriteInspectionEvidence } from '@aluguei/domain';
import { EVIDENCE_CLOSED_NOTE, canEditInspectionEvidence } from './inspection-rules';

/**
 * G3, trilha E (auditoria 2026-09-10, P1-24): a tela da vistoria oferecia ambiente novo, ocorrência
 * nova e resolução de sugestão mesmo depois de concluída — e a API aceitava. Fechada a vistoria, a
 * tela também precisa parar de oferecer.
 */
describe('canEditInspectionEvidence — o que a tela da vistoria oferece', () => {
  it('segue o domínio em todos os status', () => {
    for (const status of INSPECTION_STATUSES) {
      expect(canEditInspectionEvidence(status), status).toBe(canWriteInspectionEvidence(status));
    }
  });

  it('em andamento edita; concluída e assinada não', () => {
    for (const status of ['DRAFT', 'CAPTURING', 'PROCESSING', 'REVIEW']) {
      expect(canEditInspectionEvidence(status), status).toBe(true);
    }
    for (const status of ['COMPLETED', 'SIGNED', 'OUTRO']) {
      expect(canEditInspectionEvidence(status), status).toBe(false);
    }
  });

  it('o aviso da tela explica por que não dá para mudar', () => {
    expect(EVIDENCE_CLOSED_NOTE).toContain('concluída');
    expect(EVIDENCE_CLOSED_NOTE.length).toBeLessThan(160);
  });
});
