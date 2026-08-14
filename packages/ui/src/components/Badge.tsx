import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'brand' | 'neutral';

export function Badge({
  tone = 'neutral',
  children,
  className,
  title,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span className={cx('peg-badge', `peg-badge--${tone}`, className)} title={title}>
      {children}
    </span>
  );
}
