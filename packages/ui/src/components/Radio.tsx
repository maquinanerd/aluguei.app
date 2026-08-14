'use client';

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: ReactNode;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const radioId = id ?? autoId;
  return (
    <label className={cx('peg-choice peg-choice--radio', className)} htmlFor={radioId}>
      <input ref={ref} id={radioId} type="radio" {...rest} />
      <span className="peg-choice__box" aria-hidden="true" />
      {label ? <span className="peg-choice__label">{label}</span> : null}
    </label>
  );
});
