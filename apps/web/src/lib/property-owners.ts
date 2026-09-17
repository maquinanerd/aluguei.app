/**
 * Participação dos proprietários no imóvel (auditoria 2026-09-10, P1-08). Espelha
 * assertOwnershipTotal e landlordSharesFromOwners de packages/domain/src/finance/leaseLifecycle.ts
 * sem importar o domínio no bundle do cliente; property-owners.test.ts compara com o domínio.
 */

export interface OwnerShare {
  partyId: string;
  ownershipSharePct: number | null;
}

export type OwnerSharePctResult = { ok: true; pct: number | null } | { ok: false; error: string };

/** Percentual inteiro de 1 a 100; vazio registra o proprietário sem participação. */
export function parseOwnerSharePct(text: string): OwnerSharePctResult {
  const value = text.trim();
  if (value === '') {
    return { ok: true, pct: null };
  }
  const pct = /^\d{1,3}$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(pct) || pct < 1 || pct > 100) {
    return { ok: false, error: 'Informe a participação em número inteiro, de 1% a 100%.' };
  }
  return { ok: true, pct };
}

function registeredTotal(owners: readonly OwnerShare[]): number {
  return owners.reduce((sum, owner) => sum + (owner.ownershipSharePct ?? 0), 0);
}

/** Mensagem quando o novo proprietário levaria a soma acima de 100% (a API recusa com 409). */
export function ownershipExceedsTotal(
  owners: readonly OwnerShare[],
  pct: number | null,
): string | null {
  const total = registeredTotal(owners) + (pct ?? 0);
  return total > 100 ? `As participações somariam ${String(total)}%, acima de 100%.` : null;
}

export interface OwnershipCheck {
  totalPct: number;
  readyForLease: boolean;
  message: string | null;
}

/** Se a locação do imóvel pode ser criada com o repasse dividido, e por que não. */
export function ownershipCheck(owners: readonly OwnerShare[]): OwnershipCheck {
  if (owners.length === 0) {
    return {
      totalPct: 0,
      readyForLease: true,
      message: 'Sem proprietário vinculado, a locação deste imóvel fica sem repasse.',
    };
  }
  const [only] = owners;
  if (
    owners.length === 1 &&
    only &&
    (only.ownershipSharePct === null || only.ownershipSharePct === 100)
  ) {
    return { totalPct: 100, readyForLease: true, message: null };
  }
  const totalPct = registeredTotal(owners);
  if (owners.some((owner) => owner.ownershipSharePct === null)) {
    return {
      totalPct,
      readyForLease: false,
      message: 'Registre a participação de cada proprietário para criar a locação.',
    };
  }
  if (totalPct !== 100) {
    return {
      totalPct,
      readyForLease: false,
      message: `As participações somam ${String(totalPct)}%; para criar a locação, precisam somar 100%.`,
    };
  }
  return { totalPct, readyForLease: true, message: null };
}
