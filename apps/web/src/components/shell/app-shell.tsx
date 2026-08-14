'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@aluguei/ui';
import { Icon } from '@aluguei/ui';
import type { Session } from '@/lib/session';
import { NAV_GROUPS, breadcrumbFor } from '@/lib/navigation';
import { can } from '@/lib/session';
import { AccountMenu } from './account-menu';
import { OrgSwitcher } from './org-switcher';

export function AppShell({ session, children }: { session: Session; children: ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const crumbs = breadcrumbFor(pathname);
  const activeOrg = session.activeOrg;

  useEffect(() => {
    if (!drawerOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = drawer.querySelectorAll<HTMLElement>(
      'a[href], button, [tabindex]:not([tabindex="-1"])',
    );
    focusables[0]?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setDrawerOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus();
    };
  }, [drawerOpen]);

  const sidebar = (
    <>
      <header className="app-sidebar__header">
        <Link href="/app" className="app-sidebar__brand" onClick={() => { setDrawerOpen(false); }}>
          <span className="app-sidebar__logo">A</span>
          Aluguei.app
        </Link>
      </header>
      <nav className="app-sidebar__body" aria-label="Navegação principal" id="mobile-nav">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((item) => !item.permission || can(session, item.permission));
          if (items.length === 0) return null;
          return (
            <div key={group.title} className="app-sidebar__group">
              <h2 className="app-sidebar__group-title">{group.title}</h2>
              {items.map((item) => {
                const isActive = pathname === item.href || item.activePrefixes?.some((p) => pathname.startsWith(p));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cx('app-sidebar__link', isActive && 'app-sidebar__link--active')}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={() => { setDrawerOpen(false); }}
                  >
                    <span className="app-sidebar__icon">
                      <Icon name={item.icon} size={16} />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <footer className="app-sidebar__footer">
        <OrgSwitcher session={session} />
      </footer>
    </>
  );

  return (
    <div className="app-shell">
      {/* Sidebar desktop */}
      <aside className="app-sidebar">{sidebar}</aside>

      {/* Drawer mobile */}
      {drawerOpen ? (
        <div className="app-drawer-overlay" onClick={() => { setDrawerOpen(false); }} aria-hidden="true" />
      ) : null}
      {drawerOpen ? (
        <aside ref={drawerRef} className="app-drawer-sidebar" role="dialog" aria-modal="true" aria-label="Menu de navegação">
          <GroupHeader onClose={() => { setDrawerOpen(false); }} />
          {sidebar}
        </aside>
      ) : null}

      <div className="app-main">
        <header className="app-topbar">
          <button
            type="button"
            className="peg-icon-btn peg-icon-btn--sm app-topbar__menu"
            aria-label="Abrir menu"
            aria-expanded={drawerOpen}
            aria-controls="mobile-nav"
            onClick={() => { setDrawerOpen(true); }}
          >
            <Icon name="menu" size={18} />
          </button>
          <nav aria-label="Trilha de navegação" className="peg-breadcrumb">
            {crumbs.map((c, i) => {
              const last = i === crumbs.length - 1;
              return (
                <span key={i} className="peg-group" style={{ gap: 8 }}>
                  {i > 0 ? <span className="peg-breadcrumb__separator">/</span> : null}
                  {last || !c.href ? (
                    <span className={last ? 'peg-breadcrumb__current' : undefined}>{c.label}</span>
                  ) : (
                    <Link href={c.href} className="peg-breadcrumb__link">
                      {c.label}
                    </Link>
                  )}
                </span>
              );
            })}
          </nav>
          <div className="peg-spacer" />
          {activeOrg ? (
            <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
              {activeOrg.name}
            </span>
          ) : null}
          <AccountMenu session={session} />
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}

function GroupHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="app-sidebar__header" style={{ justifyContent: 'space-between' }}>
      <span className="app-sidebar__brand">
        <span className="app-sidebar__logo">A</span>
        Aluguei.app
      </span>
      <button
        type="button"
        className="peg-icon-btn peg-icon-btn--sm"
        aria-label="Fechar menu"
        onClick={onClose}
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
