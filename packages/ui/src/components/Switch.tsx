'use client';

import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  label?: ReactNode;
  /**
   * `md`: 30 × 18 com rótulo de 13px (`01-painel.dc.html:151`, "Aceita financiamento"); `sm`:
   * 26 × 16 com rótulo de 11,5px em cinza (`03-ajustes.dc.html:87`, "Pública no portal").
   */
  size?: 'md' | 'sm';
}

export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, className, id, size = 'md', ...rest },
  ref,
) {
  const autoId = useId();
  const switchId = id ?? autoId;
  return (
    <label
      className={cx('peg-switch', size === 'sm' && 'peg-switch--sm', className)}
      htmlFor={switchId}
    >
      <input ref={ref} id={switchId} type="checkbox" role="switch" {...rest} />
      <span className="peg-switch__track" aria-hidden="true">
        <span className="peg-switch__thumb" />
      </span>
      {label ? <span className="peg-switch__label">{label}</span> : null}
    </label>
  );
});
