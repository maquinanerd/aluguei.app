import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export function Card({
  title,
  actions,
  children,
  className,
  bodyClassName,
  padless = false,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  padless?: boolean;
}) {
  return (
    <section className={cx('peg-card', className)}>
      {title ? (
        <header className="peg-card__header">
          <h3 className="peg-card__title">{title}</h3>
          {actions ? <div className="peg-group" style={{ gap: 8 }}>{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx(padless ? 'peg-card__body--padless' : 'peg-card__body', bodyClassName)}>
        {children}
      </div>
    </section>
  );
}
