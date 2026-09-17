'use client';

import { useState } from 'react';
import { Button } from '@aluguei/ui';
import { requestLogout } from '@/lib/logout';

/** "Sair" fora do shell do painel (situação da conta, plataforma): só sai quando a API confirma. */
export function LogoutButton({ variant = 'tertiary' }: { variant?: 'tertiary' | 'secondary' }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    setBusy(true);
    setError(null);
    const result = await requestLogout('/api/auth/logout');
    if (result.ok) {
      window.location.assign('/login');
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
        variant={variant}
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
