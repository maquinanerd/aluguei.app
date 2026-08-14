import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Icon, type IconName } from './icons';

export function Tag({
  children,
  onRemove,
  icon,
  className,
}: {
  children: ReactNode;
  onRemove?: () => void;
  icon?: IconName;
  className?: string;
}) {
  return (
    <span className={cx('peg-tag', className)}>
      {icon ? <Icon name={icon} size={12} /> : null}
      {children}
      {onRemove ? (
        <button type="button" className="peg-tag__remove" onClick={onRemove} aria-label="Remover">
          <Icon name="x" size={12} />
        </button>
      ) : null}
    </span>
  );
}
