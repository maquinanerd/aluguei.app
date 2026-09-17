'use client';

import { useEffect, useRef, useState } from 'react';
import { PORTAL_ENTRY_PATH, consumeErrorMessage, portalDestination } from '@/lib/portal-access';
import type { PortalKind } from '@/lib/portal-access';

/**
 * Consome o token de uso único do link do portal (P1-16). O token sai da barra de
 * endereço antes da chamada e o consumo roda uma vez só (o React em desenvolvimento
 * executa efeitos duas vezes, e um segundo consumo gastaria o link).
 */
export function PortalEntry() {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get('token');
    window.history.replaceState(null, '', PORTAL_ENTRY_PATH);
    if (!token) {
      setError(consumeErrorMessage(401));
      return;
    }
    void (async () => {
      try {
        const res = await fetch('/api/portal/auth/consume', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          setError(consumeErrorMessage(res.status));
          return;
        }
        const body = (await res.json()) as { kind: PortalKind };
        window.location.assign(portalDestination(body.kind));
      } catch {
        setError(consumeErrorMessage(0));
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="peg-stack" style={{ gap: 12 }}>
        <h1 style={{ fontSize: 20 }}>Não foi possível entrar</h1>
        <p role="alert" style={{ fontSize: 14, color: 'var(--peg-danger)' }}>
          {error}
        </p>
      </div>
    );
  }
  return (
    <p aria-live="polite" style={{ fontSize: 14 }}>
      Abrindo o portal…
    </p>
  );
}
