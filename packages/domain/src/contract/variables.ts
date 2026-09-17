import { DomainError } from '../errors.js';

/**
 * Variáveis que a geração do contrato oferece ao template (auditoria
 * 2026-09-10, P2-08). Valor monetário sai formatado em R$, nunca em centavos
 * crus. `monthlyRentCents` é o nome legado usado por templates já aprovados —
 * que são imutáveis —, e por isso renderiza o mesmo valor em R$ que
 * `monthlyRent`.
 */
export const CONTRACT_TEMPLATE_VARIABLES = [
  'tenantName',
  'landlordName',
  'propertyTitle',
  'monthlyRent',
  'monthlyRentCents',
] as const;
export type ContractTemplateVariable = (typeof CONTRACT_TEMPLATE_VARIABLES)[number];

/** Dados estruturados de origem (sem cláusulas de IA). `null` = dado ausente. */
export interface ContractVariableSource {
  tenantName: string | null;
  landlordName: string | null;
  propertyTitle: string | null;
  monthlyRentCents: number | null;
}

/** Dado ausente aparece como travessão — nunca como R$ 0,00. */
const MISSING = '—';

/** Centavos inteiros → "R$ 1.234,56", sem ponto flutuante e sem depender de ICU. */
export function formatCentsBRL(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new DomainError(
      'INVALID_INPUT',
      `Valor monetário deve ser um número inteiro de centavos: ${String(cents)}`,
    );
  }
  const absolute = Math.abs(cents);
  const reais = String(Math.trunc(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centavos = String(absolute % 100).padStart(2, '0');
  return `${cents < 0 ? '-' : ''}R$ ${reais},${centavos}`;
}

export function buildContractVariables(
  source: ContractVariableSource,
): Record<ContractTemplateVariable, string> {
  const rent = source.monthlyRentCents === null ? MISSING : formatCentsBRL(source.monthlyRentCents);
  return {
    tenantName: source.tenantName ?? MISSING,
    landlordName: source.landlordName ?? MISSING,
    propertyTitle: source.propertyTitle ?? MISSING,
    monthlyRent: rent,
    monthlyRentCents: rent,
  };
}
