'use client';

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  invalid?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
  /** Faz wrap em Field com label/helper/error. */
  label?: string;
  optional?: boolean;
  helper?: ReactNode;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { size = 'md', invalid, prefix, suffix, label, optional, helper, error, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inner = (
    <div
      className={cx(
        'peg-input',
        `peg-input--${size}`,
        invalid || error ? 'peg-input--error' : undefined,
        rest.disabled && 'peg-input--disabled',
      )}
    >
      {prefix ? <span className="peg-input__prefix">{prefix}</span> : null}
      <input
        ref={ref}
        id={inputId}
        className={cx('peg-input__control', className)}
        aria-invalid={Boolean(invalid || error)}
        {...rest}
      />
      {suffix ? <span className="peg-input__suffix">{suffix}</span> : null}
    </div>
  );
  if (!label && !helper && !error) {
    return inner;
  }
  return (
    <div className="peg-field">
      {label ? (
        <label className="peg-field__label" htmlFor={inputId}>
          {label}
          {optional ? <span className="peg-field__label--optional"> · opcional</span> : null}
        </label>
      ) : null}
      {inner}
      {error ? (
        <span className="peg-field__error" role="alert">
          {error}
        </span>
      ) : null}
      {helper && !error ? <span className="peg-field__helper">{helper}</span> : null}
    </div>
  );
});
