import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export interface InspectorRow {
  label: string;
  value: ReactNode;
}

export function Inspector({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <aside className={cx('peg-inspector', className)}>{children}</aside>;
}

export function InspectorSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cx('peg-inspector__section', className)}>
      {title ? <h3 className="peg-inspector__section-title">{title}</h3> : null}
      {children}
    </section>
  );
}

export function InspectorRows({ rows }: { rows: readonly InspectorRow[] }) {
  return (
    <div>
      {rows.map((row) => (
        <div key={row.label} className="peg-inspector__row">
          <span className="peg-inspector__row-label">{row.label}</span>
          <span className="peg-inspector__row-value">{row.value}</span>
        </div>
      ))}
    </div>
  );
}
