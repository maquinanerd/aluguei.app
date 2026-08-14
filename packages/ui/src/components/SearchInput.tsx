'use client';

import { forwardRef } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './icons';

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
  size?: 'sm' | 'md' | 'lg';
  /** placeholder padrão em pt-BR. */
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(function SearchInput(
  { size = 'md', className, placeholder = 'Buscar…', ...rest },
  ref,
) {
  return (
    <div className={cx('peg-input', `peg-input--${size}`)}>
      <span className="peg-input__prefix">
        <Icon name="search" size={14} />
      </span>
      <input
        ref={ref}
        type="search"
        className={cx('peg-input__control', className)}
        placeholder={placeholder}
        aria-label={rest['aria-label'] ?? placeholder}
        {...rest}
      />
    </div>
  );
});
