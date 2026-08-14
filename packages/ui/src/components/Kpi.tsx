import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon, type IconName } from './icons';

export function Kpi({
  label,
  value,
  delta,
  deltaTone = 'neutral',
  icon,
  className,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaTone?: 'up' | 'down' | 'neutral';
  icon?: IconName;
  className?: string;
}) {
  return (
    <div className={cx('peg-kpi', className)}>
      <div className="peg-group between">
        <span className="peg-kpi__label">{label}</span>
        {icon ? <Icon name={icon} size={16} /> : null}
      </div>
      <div className="peg-kpi__value">{value}</div>
      {delta ? (
        <span className={cx('peg-kpi__delta', `peg-kpi__delta--${deltaTone}`)}>
          {deltaTone === 'up' ? (
            <Icon name="trendingUp" size={14} />
          ) : deltaTone === 'down' ? (
            <Icon name="trendingDown" size={14} />
          ) : null}
          {delta}
        </span>
      ) : null}
    </div>
  );
}
