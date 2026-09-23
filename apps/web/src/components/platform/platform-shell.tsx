'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Avatar, Icon, cx } from '@aluguei/ui';
import type { IconName } from '@aluguei/ui';
import { LogoutButton } from '@/components/logout-button';
import { BRAND } from '@/lib/brand';

interface PlatformNavItem {
  href: string;
  label: string;
  icon: IconName;
}

const NAV: readonly PlatformNavItem[] = [
  { href: '/plataforma', label: 'Visão geral', icon: 'layout' },
  { href: '/plataforma/imobiliarias', label: 'Imobiliárias', icon: 'building' },
  { href: '/plataforma/planos', label: 'Planos', icon: 'package' },
];

function isActive(href: string, pathname: string): boolean {
  return href === '/plataforma' ? pathname === href : pathname.startsWith(href);
}

/**
 * Shell do admin da plataforma: mesmas classes do shell do painel (barra lateral,
 * topo, área de conteúdo), com navegação própria e sem troca de imobiliária.
 */
export function PlatformShell({
  user,
  hasOrganization,
  children,
}: {
  user: { name: string; email: string };
  hasOrganization: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="app-shell">
      <a href="#platform-content" className="skip-link">
        Pular para o conteúdo
      </a>
      <div className="app-frame">
        <aside className="app-sidebar" aria-label="Menu da plataforma">
          <header className="app-sidebar__header">
            <Link href="/plataforma" className="app-sidebar__brand" title={BRAND.b2bName}>
              <span className="app-sidebar__logo">A</span>
              <span className="app-sidebar__wordmark">Plataforma</span>
            </Link>
          </header>
          <nav className="app-sidebar__body" aria-label="Administração da plataforma">
            <div className="app-sidebar__group">
              <h2 className="app-sidebar__group-title">Administração</h2>
              {NAV.map((item) => {
                const active = isActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cx('app-sidebar__link', active && 'app-sidebar__link--active')}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className="app-sidebar__icon">
                      <Icon name={item.icon} size={16} />
                    </span>
                    <span className="app-sidebar__label">{item.label}</span>
                  </Link>
                );
              })}
            </div>
            {hasOrganization ? (
              <div className="app-sidebar__group">
                <Link href="/app" className="app-sidebar__link">
                  <span className="app-sidebar__icon">
                    <Icon name="arrowLeft" size={16} />
                  </span>
                  <span className="app-sidebar__label">Voltar ao painel</span>
                </Link>
              </div>
            ) : null}
          </nav>
          <footer className="app-sidebar__footer">
            <div className="app-sidebar__profile">
              <Avatar name={user.name} size="md" />
              <div className="peg-stack app-sidebar__profile-text" style={{ gap: 0, minWidth: 0 }}>
                <span className="app-sidebar__profile-name">{user.name}</span>
                <span className="app-sidebar__profile-role">{user.email}</span>
              </div>
            </div>
          </footer>
        </aside>

        <div className="app-main">
          <header className="app-topbar">
            <nav className="platform-topnav" aria-label="Seções da plataforma">
              {NAV.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href, pathname) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <span className="peg-text-secondary" style={{ fontSize: 13 }}>
              Admin da plataforma
            </span>
            <div className="peg-spacer" />
            <LogoutButton />
          </header>
          <main id="platform-content" className="app-content" tabIndex={-1}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
