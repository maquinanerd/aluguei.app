'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Icon } from '@aluguei/ui';
import type { Session } from '@/lib/session';
import { can } from '@/lib/session';
import { NAV_GROUPS, NAV_ROOT } from '@/lib/navigation';

/**
 * Busca global no painel — filtra itens de navegação por permissão da sessão
 * e navega para o primeiro resultado. Comportamento real (navegação), sem fake.
 */
export function GlobalSearch({ session }: { session: Session }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // ⌘K / Ctrl+K foca a busca
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onPointer(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matches: Array<{ href: string; label: string; icon: Parameters<typeof Icon>[0]['name']; group: string }> = [];
    for (const item of NAV_ROOT) {
      if (item.label.toLowerCase().includes(q)) {
        matches.push({ href: item.href, label: item.label, icon: item.icon, group: '' });
      }
    }
    for (const group of NAV_GROUPS) {
      if (!group.items.length) continue;
      for (const item of group.items) {
        if (item.permission && !can(session, item.permission)) continue;
        if (item.label.toLowerCase().includes(q)) {
          matches.push({ href: item.href, label: item.label, icon: item.icon, group: group.title });
        }
      }
    }
    return matches.slice(0, 8);
  }, [query, session]);

  function go(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }} className="app-topbar__search">
      <div className="peg-input peg-input--sm">
        <span className="peg-input__prefix">
          <Icon name="search" size={15} />
        </span>
        <input
          ref={inputRef}
          type="text"
          className="peg-input__control"
          placeholder="Buscar…"
          aria-label="Busca global"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => { setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results.length > 0) { const first = results[0]; if (first) go(first.href); }
            if (e.key === 'Escape') setOpen(false);
          }}
        />
        <span className="peg-input__suffix">
          <kbd className="app-kbd">⌘K</kbd>
        </span>
      </div>
      {open && results.length > 0 ? (
        <div role="listbox" className="peg-menu" style={{ left: 0, right: 0, top: 'calc(100% + 6px)' }}>
          {results.map((r) => (
            <button
              key={r.href}
              type="button"
              role="option"
              className="peg-menu__item"
              onClick={() => { go(r.href); }}
            >
              <span className="peg-menu__icon">
                <Icon name={r.icon} size={14} />
              </span>
              <span className="peg-grow" style={{ textAlign: 'left' }}>{r.label}</span>
              {r.group ? <span className="peg-text-tertiary" style={{ fontSize: 11 }}>{r.group}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
