'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, Icon } from '@aluguei/ui';
import { apiClient } from '@/lib/api-client';
import type { Session } from '@/lib/session';

export function OrgSwitcher({ session }: { session: Session }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [busy, setBusy] = useState(false);
  const activeOrg = session.activeOrg;

  async function switchOrg(orgId: string) {
    if (orgId === activeOrg?.id) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await apiClient('/auth/switch-org', { method: 'POST', body: { orgId } });
      router.refresh();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  if (!activeOrg) {
    return (
      <div className="peg-empty" style={{ padding: '8px 4px' }}>
        <span className="peg-empty__body" style={{ fontSize: 12 }}>
          Sem organização ativa.
        </span>
      </div>
    );
  }

  return (
    <div
      ref={rootRef}
      style={{ position: 'relative' }}
      onMouseLeave={() => { setOpen(false); }}
    >
      <button
        type="button"
        className="peg-group"
        style={{
          gap: 8,
          width: '100%',
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          padding: '6px 8px',
          borderRadius: 'var(--peg-radius-sm)',
          color: 'var(--peg-text-primary)',
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Trocar organização"
        onClick={() => { setOpen((v) => !v); }}
      >
        <Avatar name={activeOrg.name} size="sm" />
        <span className="peg-truncate" style={{ fontSize: 13, fontWeight: 500, flex: 1, textAlign: 'left' }}>
          {activeOrg.name}
        </span>
        <Icon name="chevronsUpDown" size={14} />
      </button>
      {open ? (
        <div role="menu" className="peg-menu" style={{ left: 0, right: 0, top: 'calc(100% + 6px)', width: 220 }}>
          <div className="peg-menu__header">Organizações</div>
          {session.memberships.map((m) => {
            const orgName = session.activeOrg?.id === m.orgId ? session.activeOrg.name : null;
            return (
              <button
                key={m.id}
                type="button"
                role="menuitemradio"
                aria-checked={m.orgId === activeOrg.id}
                className="peg-menu__item"
                disabled={busy}
                onClick={() => void switchOrg(m.orgId)}
              >
                <span className="peg-menu__icon">
                  <Icon name="building" size={14} />
                </span>
                <span className="peg-truncate" style={{ flex: 1, textAlign: 'left' }}>
                  {orgName ?? m.orgId.slice(0, 8)}
                </span>
                {m.orgId === activeOrg.id ? <Icon name="check" size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
