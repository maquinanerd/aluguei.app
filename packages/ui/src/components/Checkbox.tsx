'use client';

import { forwardRef, useEffect, useId, useRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: ReactNode;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, indeterminate = false, className, id, ...rest },
  forwardedRef,
) {
  const autoId = useId();
  const checkId = id ?? autoId;
  const localRef = useRef<HTMLInputElement | null>(null);

  function setRefs(node: HTMLInputElement | null) {
    localRef.current = node;
    if (typeof forwardedRef === 'function') {
      forwardedRef(node);
    } else if (forwardedRef) {
      forwardedRef.current = node;
    }
  }

  useEffect(() => {
    if (localRef.current) {
      localRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <label className={cx('peg-choice peg-choice--checkbox', className)} htmlFor={checkId}>
      <input
        ref={setRefs}
        id={checkId}
        type="checkbox"
        aria-checked={indeterminate ? 'mixed' : undefined}
        {...rest}
      />
      <span className="peg-choice__box" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2 4.8 8.5 9.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {label ? <span className="peg-choice__label">{label}</span> : null}
    </label>
  );
});
