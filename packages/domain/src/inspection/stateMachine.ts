import { DomainError } from '../errors.js';

export const INSPECTION_STATUSES = [
  'DRAFT',
  'CAPTURING',
  'PROCESSING',
  'REVIEW',
  'COMPLETED',
  'SIGNED',
] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export interface InspectionTransitionContext {
  pendingTranscripts: number;
  pendingSuggestions: number;
  draftObservations: number;
}

const TRANSITIONS: Record<InspectionStatus, readonly InspectionStatus[]> = {
  DRAFT: ['CAPTURING'],
  CAPTURING: ['PROCESSING'],
  PROCESSING: ['REVIEW', 'CAPTURING'],
  REVIEW: ['CAPTURING', 'COMPLETED'],
  COMPLETED: ['SIGNED'],
  SIGNED: [],
};

/**
 * Evidência (ambiente, mídia, observação e sugestão de IA) só muda enquanto a vistoria está em
 * andamento: depois de COMPLETED, o relatório é a prova do estado do imóvel e não pode ser
 * reescrito (auditoria 2026-09-10, P1-24).
 */
export const INSPECTION_EVIDENCE_WRITABLE_STATUSES: readonly InspectionStatus[] = [
  'DRAFT',
  'CAPTURING',
  'PROCESSING',
  'REVIEW',
];

export function canWriteInspectionEvidence(status: string): boolean {
  return (INSPECTION_EVIDENCE_WRITABLE_STATUSES as readonly string[]).includes(status);
}

export function assertInspectionEvidenceWritable(status: string): void {
  if (!canWriteInspectionEvidence(status)) {
    throw new DomainError(
      'INVALID_TRANSITION',
      `Vistoria ${status}: a evidência está fechada e não pode mais ser alterada`,
      { status },
    );
  }
}

export function isInspectionStatus(value: string): value is InspectionStatus {
  return (INSPECTION_STATUSES as readonly string[]).includes(value);
}

export function canTransitionInspection(
  from: InspectionStatus,
  to: InspectionStatus,
  ctx?: InspectionTransitionContext,
): boolean {
  if (from === to) {
    return true; // idempotente
  }
  if (!TRANSITIONS[from].includes(to)) {
    return false;
  }
  if (to === 'REVIEW' && ctx) {
    // Guard: nenhum transcript PENDING (sugestões PENDING são o resultado esperado
    // do processamento e entram na revisão humana; falhas de IA viram FAILED).
    return ctx.pendingTranscripts === 0;
  }
  if (to === 'COMPLETED' && ctx) {
    // Guard: nenhuma observation DRAFT e nenhuma suggestion PENDING (toda sugestão resolvida).
    return ctx.draftObservations === 0 && ctx.pendingSuggestions === 0;
  }
  return true;
}

/** Lista motivos que bloqueiam a transição (vazio = pode transicionar). */
export function inspectionCompletionIssues(
  from: InspectionStatus,
  to: InspectionStatus,
  ctx: InspectionTransitionContext,
): string[] {
  const issues: string[] = [];
  if (!TRANSITIONS[from].includes(to) && from !== to) {
    issues.push(`Transição inválida: ${from} → ${to}`);
    return issues;
  }
  if (to === 'REVIEW') {
    if (ctx.pendingTranscripts > 0) {
      issues.push(`${String(ctx.pendingTranscripts)} transcrição(ões) pendente(s)`);
    }
  }
  if (to === 'COMPLETED') {
    if (ctx.pendingSuggestions > 0) {
      issues.push(`${String(ctx.pendingSuggestions)} sugestão(ões) de IA pendente(s)`);
    }
    if (ctx.draftObservations > 0) {
      issues.push(`${String(ctx.draftObservations)} observação(ões) em rascunho`);
    }
  }
  return issues;
}

export function transitionInspection(
  from: InspectionStatus,
  to: InspectionStatus,
  ctx?: InspectionTransitionContext,
): InspectionStatus {
  if (!canTransitionInspection(from, to, ctx)) {
    const issues = ctx
      ? inspectionCompletionIssues(from, to, ctx)
      : [`Transição inválida: ${from} → ${to}`];
    throw new DomainError(
      'INVALID_TRANSITION',
      `Transição inválida: ${from} → ${to} (${issues.join('; ')})`,
      {
        from,
        to,
        issues,
      },
    );
  }
  return to;
}
