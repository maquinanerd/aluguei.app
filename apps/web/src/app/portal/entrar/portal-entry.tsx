'use client';

import { useEffect, useRef, useState } from 'react';
import { PORTAL_ENTRY_PATH, consumeErrorMessage, portalDestination } from '@/lib/portal-access';
import type { PortalKind } from '@/lib/portal-access';
import { PedirLink } from './pedir-link';

/**
 * Consome o token de uso único do link do portal (P1-16). O token sai da barra de
 * endereço antes da chamada e o consumo roda uma vez só (o React em desenvolvimento
 * executa efeitos duas vezes, e um segundo consumo gastaria o link).
 */
export function PortalEntry() {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Sem token na URL, a pessoa chegou aqui para PEDIR um link — não para
  // consumir um. Antes, esse caso virava "link inválido", o que culpava quem
  // apenas abriu o endereço.
  const [pedindo, setPedindo] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.search).get('token');
    window.history.replaceState(null, '', PORTAL_ENTRY_PATH);
    if (!token) {
      setPedindo(true);
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

  if (pedindo) {
    return <PedirLink />;
  }

  if (error) {
    return (
      <div className="peg-stack" style={{ gap: 12 }}>
        <h1 style={{ fontSize: 20 }}>Este link já foi usado ou venceu</h1>
        <p role="alert" style={{ fontSize: 14, color: 'var(--peg-text-secondary)' }}>
          {error}
        </p>
        {/* Beco sem saída é o pior desfecho aqui: quem perdeu o link pede outro
            na mesma tela, sem precisar ligar para a imobiliária. */}
        <PedirLink />
      </div>
    );
  }
  return (
    <p aria-live="polite" style={{ fontSize: 14 }}>
      Abrindo o portal…
    </p>
  );
}
