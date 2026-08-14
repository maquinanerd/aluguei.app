'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, Icon } from '@aluguei/ui';
import type { Session } from '@/lib/session';

export function AccountMenu({ session }: { session: Session }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  function close() {
    setOpen(false);
  }

  async function logout() {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
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
        onClick={() => { setOpen((v) => !v); }}
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
            <span style={{ fontSize: 12, color: 'var(--peg-text-tertiary)' }}>{session.user.email}</span>
          </div>
          <div className="peg-menu__separator" />
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
            onClick={() => void logout()}
          >
            <span className="peg-menu__icon">
              <Icon name="logOut" size={14} />
            </span>
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}
