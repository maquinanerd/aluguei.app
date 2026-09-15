'use client';

import { useRef } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useDialogFocus } from '../lib/use-dialog-focus';
import { IconButton } from './IconButton';
import { Icon } from './icons';

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(open, panelRef, onClose);

  if (!open) return null;

  return (
    <div className="peg-modal-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cx('peg-modal', size !== 'md' && `peg-modal--${size}`, className)}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header className="peg-modal__header">
          <h2 className="peg-modal__title">{title}</h2>
          <IconButton label="Fechar" onClick={onClose} size="sm">
            <Icon name="x" size={16} />
          </IconButton>
        </header>
        <div className="peg-modal__body">{children}</div>
        {footer ? <footer className="peg-modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
