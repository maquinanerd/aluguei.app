import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'xs' | 'sm' | 'md';
  bordered?: boolean;
  active?: boolean;
  label: string; // acessibilidade obrigatória
  children: ReactNode;
}

export function IconButton({
  size = 'sm',
  bordered = false,
  active = false,
  label,
  className,
  children,
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cx(
        'peg-icon-btn',
        `peg-icon-btn--${size}`,
        bordered && 'peg-icon-btn--border',
        active && 'peg-icon-btn--active',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
