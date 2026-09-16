/**
 * Situação da imobiliária na plataforma (admin da plataforma): para onde a pessoa vai
 * depois de entrar ou cadastrar, e o texto da tela de situação da conta. Módulo puro.
 */

export type OrganizationStatus = 'PENDING_APPROVAL' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';

export interface AccountSnapshot {
  activeOrg: { status: OrganizationStatus } | null;
  platformAdmin: boolean;
}

export const ACCOUNT_STATUS_PATH = '/situacao-da-conta';

/** Imobiliária ativa vai ao painel; não ativa, à situação da conta; admin sem imobiliária, à plataforma. */
export function destinationFor(account: AccountSnapshot): string {
  if (account.activeOrg) {
    return account.activeOrg.status === 'ACTIVE' ? '/app' : ACCOUNT_STATUS_PATH;
  }
  return account.platformAdmin ? '/plataforma' : '/register';
}

export const ACCOUNT_STATUS_COPY: Record<
  Exclude<OrganizationStatus, 'ACTIVE'>,
  { title: string; body: string; tone: 'warning' | 'danger' }
> = {
  PENDING_APPROVAL: {
    title: 'Cadastro em análise',
    body: 'Recebemos o cadastro da sua imobiliária. Assim que a equipe do Aluguei.app aprovar, o painel fica disponível neste mesmo login.',
    tone: 'warning',
  },
  SUSPENDED: {
    title: 'Imobiliária suspensa',
    body: 'O acesso ao painel, ao portal de proprietários e inquilinos e ao site público está suspenso. Fale com a equipe do Aluguei.app para reativar.',
    tone: 'danger',
  },
  REJECTED: {
    title: 'Cadastro recusado',
    body: 'O cadastro da imobiliária não foi aprovado. Fale com a equipe do Aluguei.app se quiser pedir uma nova análise.',
    tone: 'danger',
  },
};

export const ORGANIZATION_STATUS_LABELS: Record<OrganizationStatus, string> = {
  PENDING_APPROVAL: 'Em análise',
  ACTIVE: 'Ativa',
  SUSPENDED: 'Suspensa',
  REJECTED: 'Recusada',
};

/** CPF (11) ou CNPJ (14) só com dígitos → formatado; outro tamanho volta como veio. */
export function formatDocument(digits: string | null): string {
  if (!digits) return '—';
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return digits;
}

/** Telefone com DDD só com dígitos → (11) 98765-4321; outro tamanho volta como veio. */
export function formatPhone(digits: string | null): string {
  if (!digits) return '—';
  const local = digits.length > 11 ? digits.slice(digits.length - 11) : digits;
  if (local.length === 11) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  }
  if (local.length === 10) {
    return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  }
  return digits;
}
