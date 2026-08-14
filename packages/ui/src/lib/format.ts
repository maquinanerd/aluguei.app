/** Formatação de apresentação. Dinheiro parte de centavos canônicos. */

export function formatBRL(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) {
    return '—';
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

export function formatBRLShort(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) {
    return '—';
  }
  if (cents >= 1_000_000) {
    return `R$ ${(cents / 100_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  }
  if (cents >= 100_000) {
    return `R$ ${(cents / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil`;
  }
  return formatBRL(cents);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '—';
  }
  return d.toLocaleDateString('pt-BR');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '—';
  }
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) {
    return '—';
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '—';
  }
  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  if (abs < 60_000) return 'agora';
  if (abs < 3_600_000) return rtf.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return rtf.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 604_800_000) return rtf.format(Math.round(diff / 86_400_000), 'day');
  return formatDate(iso);
}

/** Iniciais para avatar (máx. 2). */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0] ?? '';
  const last = parts[parts.length - 1] ?? '';
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  return `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase();
}

export function formatArea(sqm: number | null | undefined): string {
  if (sqm === null || sqm === undefined) return '—';
  return `${String(sqm)} m²`;
}

export function formatPercent(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return '—';
  return `${String(pct)}%`;
}
