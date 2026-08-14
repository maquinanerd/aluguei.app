import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  className,
  size = 'md',
}: {
  options: readonly SegmentedOption[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div className={cx('peg-segmented', className)} role="group" aria-label="Visões">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={cx('peg-segmented__btn', value === opt.value && 'peg-segmented__btn--active')}
          style={size === 'sm' ? { height: 24, fontSize: 12, padding: '0 10px' } : undefined}
          aria-pressed={value === opt.value}
          disabled={opt.disabled}
          onClick={() => { onChange(opt.value); }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
