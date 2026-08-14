import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'danger' | 'danger-subtle' | 'brand';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  /** Mantém largura com spinner (evita salto de layout). */
  fullWidth?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        'peg-btn',
        `peg-btn--${variant}`,
        `peg-btn--${size}`,
        loading && 'peg-btn--loading',
        fullWidth && 'peg-btn--full',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={14} /> : icon}
      <span className="peg-btn__label">{children}</span>
    </button>
  );
}
