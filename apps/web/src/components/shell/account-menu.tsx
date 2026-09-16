'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Avatar, Icon } from '@aluguei/ui';
import type { Session } from '@/lib/session';
import { requestLogout } from '@/lib/logout';

export function AccountMenu({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  function close() {
    setOpen(false);
  }

  /** Só sai depois que a API confirma o fim da sessão (auditoria 2026-09-10, P1-03). */
  async function logout() {
    setLoggingOut(true);
    setLogoutError(null);
    const result = await requestLogout('/api/auth/logout');
    if (result.ok) {
      // Recarga completa: nada da sessão encerrada fica em memória no navegador.
      window.location.assign('/login');
      return;
    }
    setLogoutError(result.message);
    setLoggingOut(false);
  }

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative' }}
      onMouseLeave={close}
      onBlur={(e) => {
        if (!rootRef.current?.contains(e.relatedTarget as Node)) close();
      }}
    >
      <button
        type="button"
        className="peg-group"
        style={{
          gap: 8,
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          padding: '4px 8px',
          borderRadius: 'var(--peg-radius-sm)',
          color: 'var(--peg-text-primary)',
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu da conta"
        onClick={() => {
          setOpen((v) => !v);
        }}
      >
        <Avatar name={session.user.name} size="sm" brand />
        <span style={{ fontSize: 13, fontWeight: 500 }}>{session.user.name.split(' ')[0]}</span>
        <Icon name="chevronDown" size={14} />
      </button>
      {open ? (
        <div
          role="menu"
          className="peg-menu"
          style={{ right: 0, top: 'calc(100% + 6px)', width: 220 }}
        >
          <div className="peg-stack" style={{ gap: 2, padding: '8px 12px' }}>
            <strong style={{ fontSize: 13 }}>{session.user.name}</strong>
            <span style={{ fontSize: 12, color: 'var(--peg-text-tertiary)' }}>
              {session.user.email}
            </span>
          </div>
          <div className="peg-menu__separator" />
          {session.platformAdmin ? (
            <Link href="/plataforma" className="peg-menu__item" role="menuitem" onClick={close}>
              <span className="peg-menu__icon">
                <Icon name="shield" size={14} />
              </span>
              Admin da plataforma
            </Link>
          ) : null}
          <Link href="/app/settings" className="peg-menu__item" role="menuitem" onClick={close}>
            <span className="peg-menu__icon">
              <Icon name="settings" size={14} />
            </span>
            Configurações
          </Link>
          <button
            type="button"
            role="menuitem"
            className="peg-menu__item peg-menu__item--danger"
            disabled={loggingOut}
            aria-busy={loggingOut}
            onClick={() => void logout()}
          >
            <span className="peg-menu__icon">
              <Icon name="logOut" size={14} />
            </span>
            Sair
          </button>
          {logoutError ? (
            <span className="peg-field__error" role="alert" style={{ padding: '4px 12px 8px' }}>
              {logoutError}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
