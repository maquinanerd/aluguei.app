import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface FieldProps {
  label?: string;
  optional?: boolean;
  helper?: ReactNode;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, optional, helper, error, htmlFor, children, className }: FieldProps) {
  return (
    <div className={cx('peg-field', className)}>
      {label ? (
        <label className="peg-field__label" htmlFor={htmlFor}>
          {label}
          {optional ? (
            <span className="peg-field__label--optional"> · opcional</span>
          ) : null}
        </label>
      ) : null}
      {children}
      {error ? (
        <span className="peg-field__error" role="alert">
          {error}
        </span>
      ) : null}
      {helper && !error ? <span className="peg-field__helper">{helper}</span> : null}
    </div>
  );
}
