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

/**
 * Variáveis do contrato de **compra e venda** (Onda 5). Lista separada de
 * propósito: as duas espécies de contrato falam de partes diferentes (comprador
 * e vendedor, não inquilino e locador), e misturá-las deixaria um template de
 * locação oferecendo `salePrice` — que nunca teria valor.
 */
export const SALE_CONTRACT_TEMPLATE_VARIABLES = [
  'buyerName',
  'sellerName',
  'propertyTitle',
  'salePrice',
] as const;
export type SaleContractTemplateVariable = (typeof SALE_CONTRACT_TEMPLATE_VARIABLES)[number];

/** Dados estruturados de origem (sem cláusulas de IA). `null` = dado ausente. */
export interface ContractVariableSource {
  tenantName: string | null;
  landlordName: string | null;
  propertyTitle: string | null;
  monthlyRentCents: number | null;
}

export interface SaleContractVariableSource {
  buyerName: string | null;
  sellerName: string | null;
  propertyTitle: string | null;
  /** Valor que fechou, ou o em jogo enquanto não fechou. */
  saleAmountCents: number | null;
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

/**
 * Variáveis do contrato de compra e venda. Mesma regra do de locação: valor sai
 * formatado em R$, e dado ausente vira travessão — nunca R$ 0,00, que num
 * contrato de venda seria uma afirmação falsa sobre preço.
 */
export function buildSaleContractVariables(
  source: SaleContractVariableSource,
): Record<SaleContractTemplateVariable, string> {
  return {
    buyerName: source.buyerName ?? MISSING,
    sellerName: source.sellerName ?? MISSING,
    propertyTitle: source.propertyTitle ?? MISSING,
    salePrice: source.saleAmountCents === null ? MISSING : formatCentsBRL(source.saleAmountCents),
  };
}
