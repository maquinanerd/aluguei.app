'use client';

import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { IconButton } from './IconButton';
import { Icon } from './icons';

export function Drawer({
  open,
  onClose,
  title,
  children,
  footer,
  side = 'right',
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  side?: 'right' | 'left';
  className?: string;
}) {
  useEffect(() => {
    if (!open) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => { document.removeEventListener('keydown', onKeyDown); };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="peg-drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cx('peg-drawer', side === 'left' ? 'peg-drawer--left' : 'peg-drawer--right', className)}
      >
        <header className="peg-drawer__header">
          <h2 className="peg-drawer__title">{title}</h2>
          <IconButton label="Fechar" onClick={onClose} size="sm">
            <Icon name="x" size={16} />
          </IconButton>
        </header>
        <div className="peg-drawer__body">{children}</div>
        {footer ? <footer className="peg-drawer__footer">{footer}</footer> : null}
      </aside>
    </>
  );
}
