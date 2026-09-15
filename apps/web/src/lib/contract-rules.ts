/**
 * Ações das telas de contrato diante das regras da trilha A do G2 (P0-04 e
 * P1-06, ADRs G2A-1 e G2A-2). Espelha as transições de
 * packages/domain/src/contract/contract.ts sem importar o pacote de domínio no
 * bundle do cliente (ele traz node:crypto); contract-rules.test.ts compara com
 * canTransitionContract.
 */
export interface ContractActions {
  /** Gerar o texto pela primeira vez (DRAFT). */
  generate: { body: Record<string, never> } | null;
  /** Regerar em GENERATED antes do envio: pedido explícito, vira nova versão. */
  regenerate: { body: { regenerate: true } } | null;
  send: boolean;
  void: boolean;
}

/** Estados com transição para VOID no domínio: DRAFT não cancela; SIGNED e VOID são terminais. */
const VOIDABLE_STATUSES: readonly string[] = [
  'GENERATED',
  'SENT_FOR_SIGNATURE',
  'PARTIALLY_SIGNED',
];

export function contractActions(
  contract: { status: string },
  envelope: { status: string } | null,
): ContractActions {
  const { status } = contract;
  return {
    generate: status === 'DRAFT' ? { body: {} } : null,
    regenerate: status === 'GENERATED' && envelope === null ? { body: { regenerate: true } } : null,
    send: status === 'GENERATED',
    void: VOIDABLE_STATUSES.includes(status),
  };
}

/** Contrato novo só de candidatura APPROVED: em CONTRACTING já existe contrato (a API responde 409). */
export function eligibleApplicationsForContract<T extends { status: string }>(
  applications: readonly T[],
): T[] {
  return applications.filter((a) => a.status === 'APPROVED');
}
