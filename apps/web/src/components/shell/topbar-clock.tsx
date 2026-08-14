'use client';

import { useEffect, useState } from 'react';

/** Relógio "hoje, HH:MM" — client-only para evitar hydration mismatch. */
export function TopbarClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => { setNow(new Date()); }, 30_000);
    return () => { clearInterval(id); };
  }, []);

  if (!now) return <span className="peg-text-tertiary">hoje</span>;

  const today = new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(now);

  return <span className="peg-text-tertiary">{today.replace(/^./, (c) => c.toUpperCase())}</span>;
}
