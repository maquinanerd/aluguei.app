/**
 * Nomes e retenção dos backups (G3, trilha F2). O nome carrega o instante em UTC, com segundos:
 * `aluguei-20260921T193507Z.dump.enc`. A retenção olha só para arquivos com esse formato.
 */
const NAME_RE = /^aluguei-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z\.dump\.enc$/;

export function backupFileName(at: Date): string {
  const compact = at.toISOString().slice(0, 19).replaceAll('-', '').replaceAll(':', '');
  return `aluguei-${compact}Z.dump.enc`;
}

export function parseBackupFileName(name: string): Date | null {
  const match = NAME_RE.exec(name);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match.map(Number);
  const date = new Date(
    Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 0, hour ?? 0, minute ?? 0, second ?? 0),
  );
  return backupFileName(date) === name ? date : null;
}

/** Backups a apagar, do mais novo ao mais antigo: tudo o que passa dos `keep` mais recentes. */
export function selectForDeletion(names: readonly string[], keep: number): string[] {
  if (!Number.isInteger(keep) || keep < 1) {
    throw new Error('BACKUP_KEEP precisa ser um inteiro maior que zero');
  }
  return names
    .flatMap((name) => {
      const at = parseBackupFileName(name);
      return at ? [{ name, at: at.getTime() }] : [];
    })
    .sort((a, b) => b.at - a.at)
    .slice(keep)
    .map((backup) => backup.name);
}
