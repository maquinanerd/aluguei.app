'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon, type IconName } from './icons';

export interface MenuItem {
  key: string;
  label: ReactNode;
  icon?: IconName;
  onSelect?: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export function Dropdown({
  trigger,
  items,
  align = 'start',
  className,
  menuClassName,
  ariaLabel,
}: {
  trigger: ReactNode;
  items: readonly MenuItem[];
  align?: 'start' | 'end';
  className?: string;
  menuClassName?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();

  useLayoutEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setOpen(true);
        setFocusedIndex(0);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedIndex((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cx('peg-dropdown', className)}>
      <span role="button" tabIndex={0} aria-haspopup="menu" aria-expanded={open} aria-label={ariaLabel} onKeyDown={onKeyDown} onClick={() => { setOpen((v) => !v); }}>
        {trigger}
      </span>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cx('peg-menu', align === 'end' ? 'peg-menu--end' : undefined, menuClassName)}
        >
          {items.map((item, i) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              className={cx('peg-menu__item', item.danger && 'peg-menu__item--danger')}
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect?.();
              }}
              onMouseEnter={() => { setFocusedIndex(i); }}
              style={focusedIndex === i ? { background: 'var(--peg-surface-subtle)' } : undefined}
            >
              {item.icon ? (
                <span className="peg-menu__icon">
                  <Icon name={item.icon} size={14} />
                </span>
              ) : null}
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
