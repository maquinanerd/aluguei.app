'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cx } from '@aluguei/ui';
import { Icon } from '@aluguei/ui';
import type { Session } from '@/lib/session';
import { NAV_GROUPS, NAV_ROOT, breadcrumbFor } from '@/lib/navigation';
import { can, activeRole } from '@/lib/session';
import { ROLE_LABELS } from '@/lib/labels';
import { AccountMenu } from './account-menu';
import { OrgSwitcher } from './org-switcher';
import { GlobalSearch } from './global-search';
import { TopbarClock } from './topbar-clock';

const COLLAPSE_KEY = 'aluguei.sidebar.collapsed';

export function AppShell({ session, children }: { session: Session; children: ReactNode }) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const drawerRef = useRef<HTMLElement | null>(null);
  const crumbs = breadcrumbFor(pathname);
  const activeOrg = session.activeOrg;
  const role = activeRole(session);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch { /* storage indisponível */ }
  }, []);

  function toggleCollapse() {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch { /* ignore */ }
      return next;
    });
  }

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
        <Link href="/app" className="app-sidebar__brand" onClick={() => { setDrawerOpen(false); }} title="Aluguei.app">
          <span className="app-sidebar__logo">A</span>
          {!collapsed ? <span className="app-sidebar__wordmark">Aluguei.app</span> : null}
        </Link>
        {!collapsed ? (
          <button
            type="button"
            className="peg-icon-btn peg-icon-btn--sm app-sidebar__collapse"
            aria-label="Recolher menu lateral"
            onClick={toggleCollapse}
          >
            <Icon name="panelLeft" size={16} />
          </button>
        ) : null}
      </header>
      <nav className="app-sidebar__body" aria-label="Navegação principal" id="mobile-nav">
        {collapsed ? (
          <div className="app-sidebar__rail">
            {NAV_ROOT.filter((i) => !i.permission || can(session, i.permission)).map((item) => (
              <RailLink key={item.href} href={item.href} label={item.label} icon={item.icon} pathname={pathname} onNavigate={() => { setDrawerOpen(false); }} />
            ))}
            {NAV_GROUPS.flatMap((g) => g.items)
              .filter((item) => !item.permission || can(session, item.permission))
              .map((item) => (
                <RailLink key={item.href} href={item.href} label={item.label} icon={item.icon} pathname={pathname} onNavigate={() => { setDrawerOpen(false); }} />
              ))}
          </div>
        ) : (
          <>
            <div className="app-sidebar__group">
              {NAV_ROOT.filter((i) => !i.permission || can(session, i.permission)).map((item) => {
                const isActive = isItemActive(item, pathname);
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
            {NAV_GROUPS.map((group) => {
              const items = group.items.filter((item) => !item.permission || can(session, item.permission));
              if (items.length === 0) return null;
              return (
                <div key={group.title} className="app-sidebar__group">
                  <h2 className="app-sidebar__group-title">{group.title}</h2>
                  {items.map((item) => {
                    const isActive = isItemActive(item, pathname);
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
                        <span className="app-sidebar__label">{item.label}</span>
                        {item.badge !== undefined ? (
                          <span className={cx('app-sidebar__badge', item.badgeTone === 'danger' && 'app-sidebar__badge--danger')}>
                            {item.badge}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </>
        )}
      </nav>
      <footer className="app-sidebar__footer">
        {!collapsed ? <OrgSwitcher session={session} /> : null}
        <div className="app-sidebar__profile">
          <Avatar name={session.user.name} size="md" brand />
          {!collapsed ? (
            <>
              <div className="peg-stack app-sidebar__profile-text" style={{ gap: 0, minWidth: 0 }}>
                <span className="app-sidebar__profile-name">{session.user.name}</span>
                <span className="app-sidebar__profile-role">{ROLE_LABELS[role] ?? role}</span>
              </div>
              <ProfileMenu session={session} />
            </>
          ) : (
            <button
              type="button"
              className="peg-icon-btn peg-icon-btn--sm"
              aria-label="Expandir menu lateral"
              onClick={toggleCollapse}
            >
              <Icon name="panelRight" size={16} />
            </button>
          )}
        </div>
      </footer>
    </>
  );

  return (
    <div className="app-shell">
      <div className="app-frame">
        {/* Sidebar desktop */}
        <aside className={cx('app-sidebar', collapsed && 'app-sidebar--collapsed')}>{sidebar}</aside>

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
            <span className="peg-breadcrumb__separator">·</span>
            {activeOrg ? (
              <span className="peg-text-secondary" style={{ fontSize: 13 }}>{activeOrg.name}</span>
            ) : null}
            <TopbarClock />
            <div className="peg-spacer" />
            <GlobalSearch session={session} />
            {can(session, 'conversation:read') ? (
              <Link
                href="/app/inbox"
                className="peg-icon-btn peg-icon-btn--sm"
                aria-label="Atendimento (Inbox)"
                title="Atendimento"
              >
                <Icon name="bell" size={17} />
              </Link>
            ) : null}
            <AccountMenu session={session} />
          </header>
          <main className="app-content">{children}</main>
        </div>
      </div>

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
    </div>
  );
}

function isItemActive(item: { href: string; activePrefixes?: string[] }, pathname: string): boolean {
  return pathname === item.href || item.activePrefixes?.some((p) => pathname.startsWith(p)) || false;
}

function RailLink({
  href,
  label,
  icon,
  pathname,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: Parameters<typeof Icon>[0]['name'];
  pathname: string;
  onNavigate: () => void;
}) {
  const active = href === '/app' ? pathname === '/app' : pathname.startsWith(href);
  return (
    <Link
      href={href}
      className={cx('app-sidebar__rail-link', active && 'app-sidebar__rail-link--active')}
      aria-current={active ? 'page' : undefined}
      title={label}
      onClick={onNavigate}
    >
      <Icon name={icon} size={18} />
    </Link>
  );
}

function GroupHeader({ onClose }: { onClose: () => void }) {
  return (
    <div className="app-sidebar__header" style={{ justifyContent: 'space-between' }}>
      <span className="app-sidebar__brand">
        <span className="app-sidebar__logo">A</span>
        <span className="app-sidebar__wordmark">Aluguei.app</span>
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

function Avatar({ name, size, brand }: { name: string; size: 'sm' | 'md'; brand?: boolean }) {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  return (
    <span className={cx('peg-avatar', `peg-avatar--${size}`, brand && 'peg-avatar--brand')} aria-hidden="true">
      {initials}
    </span>
  );
}

function ProfileMenu({ session }: { session: Session }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  async function logout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      window.location.href = '/login';
    }
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="peg-icon-btn peg-icon-btn--sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Menu da conta"
        onClick={() => { setOpen((v) => !v); }}
      >
        <Icon name="moreVertical" size={16} />
      </button>
      {open ? (
        <div role="menu" className="peg-menu" style={{ left: 'auto', right: 0, bottom: 'calc(100% + 6px)', width: 200 }}>
          <div className="peg-stack" style={{ gap: 2, padding: '8px 12px' }}>
            <strong style={{ fontSize: 13 }}>{session.user.name}</strong>
            <span style={{ fontSize: 12, color: 'var(--peg-text-tertiary)' }}>{session.user.email}</span>
          </div>
          <div className="peg-menu__separator" />
          <Link href="/app/settings" className="peg-menu__item" role="menuitem" onClick={() => { setOpen(false); }}>
            <span className="peg-menu__icon"><Icon name="settings" size={14} /></span>
            Configurações
          </Link>
          <button type="button" role="menuitem" className="peg-menu__item peg-menu__item--danger" onClick={() => { void logout(); }}>
            <span className="peg-menu__icon"><Icon name="logOut" size={14} /></span>
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}
