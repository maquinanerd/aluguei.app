'use client';

import { forwardRef, useId } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { cx } from '../lib/cx';
import { Icon } from './icons';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  size?: 'sm' | 'md' | 'lg';
  options: readonly SelectOption[];
  placeholder?: string;
  label?: string;
  optional?: boolean;
  helper?: string;
  error?: string;
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    size = 'md',
    options,
    placeholder,
    label,
    optional,
    helper,
    error,
    invalid,
    className,
    id,
    ...rest
  },
  ref,
) {
  const autoId = useId();
  const selectId = id ?? autoId;
  return (
    <div className="peg-field">
      {label ? (
        <label className="peg-field__label" htmlFor={selectId}>
          {label}
          {optional ? <span className="peg-field__label--optional"> · opcional</span> : null}
        </label>
      ) : null}
      <div
        className={cx(
          'peg-input',
          `peg-input--${size}`,
          invalid || error ? 'peg-input--error' : undefined,
          rest.disabled && 'peg-input--disabled',
        )}
      >
        <select
          ref={ref}
          id={selectId}
          className={cx('peg-input__control', className)}
          aria-invalid={Boolean(invalid || error)}
          {...rest}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        <span className="peg-input__suffix">
          <Icon name="chevronDown" size={14} />
        </span>
      </div>
      {error ? (
        <span className="peg-field__error" role="alert">
          {error}
        </span>
      ) : null}
      {helper && !error ? <span className="peg-field__helper">{helper}</span> : null}
    </div>
  );
});
