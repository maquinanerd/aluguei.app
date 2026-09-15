'use client';

import { useState } from 'react';
import { Button } from '@aluguei/ui';
import { requestLogout } from '@/lib/logout';

/**
 * "Sair" dos portais do locatário e do proprietário. Antes era só um link para
 * "/" e a sessão do portal continuava no navegador (auditoria 2026-09-10,
 * P1-03): agora chama o logout do portal e só sai quando a API confirma.
 */
export function PortalLogoutButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setBusy(true);
    setError(null);
    const result = await requestLogout('/api/portal/auth/logout');
    if (result.ok) {
      window.location.assign('/');
      return;
    }
    setError(result.message);
    setBusy(false);
  }

  return (
    <span className="peg-group" style={{ gap: 8 }}>
      {error ? (
        <span className="peg-field__error" role="alert">
          {error}
        </span>
      ) : null}
      <Button
        size="sm"
        variant="tertiary"
        disabled={busy}
        onClick={() => {
          void logout();
        }}
      >
        Sair
      </Button>
    </span>
  );
}
