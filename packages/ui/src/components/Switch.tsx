'use client';

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: ReactNode;
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, className, id, ...rest },
  ref,
) {
  const autoId = useId();
  const switchId = id ?? autoId;
  return (
    <label className={cx('peg-switch', className)} htmlFor={switchId}>
      <input ref={ref} id={switchId} type="checkbox" role="switch" {...rest} />
      <span className="peg-switch__track" aria-hidden="true">
        <span className="peg-switch__thumb" />
      </span>
      {label ? <span className="peg-switch__label">{label}</span> : null}
    </label>
  );
});
