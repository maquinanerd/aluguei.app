'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

const NEXT_STATUSES: Record<string, readonly string[]> = {
  NEW: ['QUALIFYING', 'LOST'],
  QUALIFYING: ['QUALIFIED', 'LOST'],
  QUALIFIED: ['VISIT', 'LOST'],
  VISIT: ['PROPOSAL', 'QUALIFIED', 'LOST'],
  PROPOSAL: ['APPLICATION', 'LOST'],
  APPLICATION: ['WON', 'LOST'],
};

export function LeadStatusButtons({ leadId, status }: { leadId: string; status: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const next = NEXT_STATUSES[status] ?? [];

  async function transition(nextStatus: string) {
    setBusy(true);
    setError(null);
    const reason = nextStatus === 'LOST' ? window.prompt('Motivo do LOST:') : undefined;
    if (nextStatus === 'LOST' && !reason) {
      setBusy(false);
      return;
    }
    const res = await fetch(`/api/leads/${leadId}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: nextStatus, reason }),
    });
    if (!res.ok) {
      const data: unknown = await res.json().catch(() => ({}));
      const message =
        typeof data === 'object' &&
        data !== null &&
        'message' in data &&
        typeof data.message === 'string'
          ? data.message
          : 'Falha na transição';
      setError(message);
    }
    setBusy(false);
    router.refresh();
  }

  return (
    <span>
      {next.map((s) => (
        <button key={s} type="button" disabled={busy} onClick={() => void transition(s)}>
          {s}
        </button>
      ))}
      {error ? <em className="error">{error}</em> : null}
    </span>
  );
}
