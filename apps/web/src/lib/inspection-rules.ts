/**
 * Evidência da vistoria na tela (auditoria 2026-09-10, P1-24). Espelha
 * INSPECTION_EVIDENCE_WRITABLE_STATUSES de packages/domain/src/inspection/stateMachine.ts sem
 * importar o pacote de domínio no bundle do cliente; inspection-rules.test.ts compara com o domínio.
 */
const EVIDENCE_OPEN_STATUSES: readonly string[] = ['DRAFT', 'CAPTURING', 'PROCESSING', 'REVIEW'];

/** Ambiente, mídia, ocorrência e sugestão só mudam com a vistoria em andamento. */
export function canEditInspectionEvidence(status: string): boolean {
  return EVIDENCE_OPEN_STATUSES.includes(status);
}

export const EVIDENCE_CLOSED_NOTE =
  'Vistoria concluída: a evidência está fechada e não pode mais ser alterada.';
