import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface Crumb {
  label: ReactNode;
  href?: string;
}

/**
 * Breadcrumb independente de Next (usa <a> puro). Em apps com router,
 * passar href e a navegação é tratada pelo Link externo quando aplicável.
 */
export function Breadcrumb({ items, className }: { items: readonly Crumb[]; className?: string }) {
  return (
    <nav className={cx('peg-breadcrumb', className)} aria-label="Trilha de navegação">
      {items.map((item, i) => {
        const last = i === items.length - 1;
        return (
          <Fragment key={i}>
            {i > 0 ? (
              <span className="peg-breadcrumb__separator" aria-hidden="true">
                /
              </span>
            ) : null}
            {last || !item.href ? (
              <span className={cx(last && 'peg-breadcrumb__current')}>{item.label}</span>
            ) : (
              <a href={item.href}>{item.label}</a>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
