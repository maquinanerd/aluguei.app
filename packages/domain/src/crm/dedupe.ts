export type IdentityKind = 'EMAIL' | 'PHONE' | 'CPF' | 'CNPJ' | 'PASSPORT';

export interface RequestedIdentity {
  kind: IdentityKind;
  value: string;
}

export interface ExistingIdentity {
  partyId: string;
  partyName: string;
  kind: IdentityKind;
  value: string;
}

export interface DedupeMatch {
  partyId: string;
  name: string;
  reasons: IdentityKind[];
}

/**
 * Deduplicação básica: retorna candidatos existentes por identidade solicitada
 * (par kind+value normalizado), com a razão de cada match. Merge é ação humana futura.
 * Casa por (kind, value) — nunca apenas pelo valor, para evitar falso positivo
 * entre kinds diferentes (ex.: dígitos de CPF coincidindo com telefone).
 */
export function findDedupeMatches(
  requested: readonly RequestedIdentity[],
  existing: readonly ExistingIdentity[],
): DedupeMatch[] {
  const byParty = new Map<string, DedupeMatch>();

  for (const entry of existing) {
    if (!requested.some((r) => r.kind === entry.kind && r.value === entry.value)) {
      continue;
    }
    const match = byParty.get(entry.partyId) ?? {
      partyId: entry.partyId,
      name: entry.partyName,
      reasons: [],
    };
    match.reasons.push(entry.kind);
    byParty.set(entry.partyId, match);
  }

  return [...byParty.values()];
}
