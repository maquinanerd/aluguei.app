'use client';

import { useRef } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { useDialogFocus } from '../lib/use-dialog-focus';
import { IconButton } from './IconButton';
import { Icon } from './icons';

/**
 * Formas dos diálogos dos desenhos (spec da Onda 1C, §7.2), além da padrão:
 *
 * - `list`: 520px, título e subtítulo no topo, linhas com divisória e rodapé sem borda — o diálogo
 *   de publicação (`01-painel.dc.html:100-129`). As linhas usam `peg-modal-list__row`.
 * - `notice`: 460px, um só respiro de 20px, texto em cinza e botões à direita — o aviso de limite
 *   de contratos (`03-ajustes.dc.html:49-53`).
 *
 * Nas duas o fechar é pelo botão do rodapé e pelo Esc; não há o "×" do cabeçalho.
 */
export type ModalVariant = 'default' | 'list' | 'notice';

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  variant = 'default',
  className,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Linha abaixo do título (forma `list`): "Kitnet 32 m² · Setor Universitário · IMV-0214". */
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: ModalVariant;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useDialogFocus(open, panelRef, onClose);

  if (!open) return null;

  const padrao = variant === 'default';
  return (
    <div className="peg-modal-overlay" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cx(
          'peg-modal',
          padrao && size !== 'md' && `peg-modal--${size}`,
          !padrao && `peg-modal--${variant}`,
          className,
        )}
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <header className="peg-modal__header">
          <h2 className="peg-modal__title">{title}</h2>
          {padrao ? (
            <IconButton label="Fechar" onClick={onClose} size="sm">
              <Icon name="x" size={16} />
            </IconButton>
          ) : description === undefined ? null : (
            <p className="peg-modal__description">{description}</p>
          )}
        </header>
        <div className="peg-modal__body">{children}</div>
        {footer ? <footer className="peg-modal__footer">{footer}</footer> : null}
      </div>
    </div>
  );
}
