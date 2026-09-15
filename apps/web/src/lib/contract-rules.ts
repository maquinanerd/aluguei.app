/**
 * CONTROLE NEGATIVO (versionado só no commit de RED): as decisões que as telas
 * de contrato tomam hoje — "Gerar" só em DRAFT, sem regenerar, "Enviar" em
 * GENERATED, "Cancelar" em qualquer status que não seja VOID (inclusive DRAFT e
 * SIGNED) e candidaturas APPROVED ou CONTRACTING no modal de novo contrato.
 * Substituído pela implementação no commit de correção.
 */
export interface ContractActions {
  generate: { body: Record<string, never> } | null;
  regenerate: { body: { regenerate: true } } | null;
  send: boolean;
  void: boolean;
}

export function contractActions(
  contract: { status: string },
  _envelope: { status: string } | null,
): ContractActions {
  return {
    generate: contract.status === 'DRAFT' ? { body: {} } : null,
    regenerate: null,
    send: contract.status === 'GENERATED',
    void: contract.status !== 'VOID',
  };
}

export function eligibleApplicationsForContract<T extends { status: string }>(
  applications: readonly T[],
): T[] {
  return applications.filter((a) => a.status === 'APPROVED' || a.status === 'CONTRACTING');
}
