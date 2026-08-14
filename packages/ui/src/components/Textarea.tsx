'use client';

import { forwardRef, useId } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cx } from '../lib/cx';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  label?: string;
  optional?: boolean;
  helper?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, label, optional, helper, error, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const textareaId = id ?? autoId;
  return (
    <div className="peg-field">
      {label ? (
        <label className="peg-field__label" htmlFor={textareaId}>
          {label}
          {optional ? <span className="peg-field__label--optional"> · opcional</span> : null}
        </label>
      ) : null}
      <textarea
        ref={ref}
        id={textareaId}
        className={cx('peg-textarea', invalid || error ? 'peg-textarea--error' : undefined, className)}
        aria-invalid={Boolean(invalid || error)}
        {...rest}
      />
      {error ? (
        <span className="peg-field__error" role="alert">
          {error}
        </span>
      ) : null}
      {helper && !error ? <span className="peg-field__helper">{helper}</span> : null}
    </div>
  );
});
