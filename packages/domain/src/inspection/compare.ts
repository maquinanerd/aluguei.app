export type ComparisonKind = 'NEW' | 'RESOLVED' | 'UNCHANGED' | 'CHANGED';

export interface ComparableObservation {
  roomId: string | null;
  roomName: string | null;
  category: string;
  severity: string;
  description: string;
}

export interface DifferenceItem {
  kind: ComparisonKind;
  roomId: string | null;
  roomName: string | null;
  category: string;
  description: string;
  checkinSeverity?: string;
  checkoutSeverity?: string;
}

/** Comparação entrada×saída: agrupa por room+category e casa por descrição normalizada. */
export function computeInspectionDifferences(
  checkin: readonly ComparableObservation[],
  checkout: readonly ComparableObservation[],
): DifferenceItem[] {
  const key = (obs: ComparableObservation): string =>
    `${obs.roomId ?? '*'}:${obs.category}:${obs.description.trim().toLowerCase()}`;

  const checkinByKey = new Map<string, ComparableObservation>();
  for (const obs of checkin) {
    checkinByKey.set(key(obs), obs);
  }

  const results: DifferenceItem[] = [];
  const matched = new Set<string>();

  for (const obs of checkout) {
    const k = key(obs);
    const checkinMatch = checkinByKey.get(k);
    if (!checkinMatch) {
      results.push({
        kind: 'NEW',
        roomId: obs.roomId,
        roomName: obs.roomName,
        category: obs.category,
        description: obs.description,
        checkoutSeverity: obs.severity,
      });
      continue;
    }
    matched.add(k);
    if (checkinMatch.severity !== obs.severity || checkinMatch.category !== obs.category) {
      results.push({
        kind: 'CHANGED',
        roomId: obs.roomId,
        roomName: obs.roomName,
        category: obs.category,
        description: obs.description,
        checkinSeverity: checkinMatch.severity,
        checkoutSeverity: obs.severity,
      });
    } else {
      results.push({
        kind: 'UNCHANGED',
        roomId: obs.roomId,
        roomName: obs.roomName,
        category: obs.category,
        description: obs.description,
        checkinSeverity: checkinMatch.severity,
      });
    }
  }

  for (const [k, obs] of checkinByKey) {
    if (!matched.has(k)) {
      results.push({
        kind: 'RESOLVED',
        roomId: obs.roomId,
        roomName: obs.roomName,
        category: obs.category,
        description: obs.description,
        checkinSeverity: obs.severity,
      });
    }
  }

  return results;
}
