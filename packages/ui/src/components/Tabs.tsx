import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface TabItem {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  count?: number;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
}: {
  items: readonly TabItem[];
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cx('peg-tabs', className)} role="tablist" aria-label="Abas">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          className={cx('peg-tab', value === item.value && 'peg-tab--active')}
          disabled={item.disabled}
          onClick={() => { onChange(item.value); }}
        >
          {item.icon}
          {item.label}
          {item.count !== undefined ? (
            <span className="peg-text-tertiary" style={{ fontSize: 12 }}>
              {item.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
