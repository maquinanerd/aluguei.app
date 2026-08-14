import type { CSSProperties } from 'react';
import { cx } from '../lib/cx';

export function Skeleton({
  width,
  height = 14,
  radius = 'var(--peg-radius-xs)',
  className,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className={cx('peg-skeleton', className)}
      style={{
        width: width ?? '100%',
        height,
        borderRadius: radius,
        display: 'inline-block',
        ...style,
      }}
    />
  );
}

/** Bloco de linhas de skeleton para tabelas/forms. */
export function SkeletonRows({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div role="status" aria-label="Carregando dados" className="peg-stack" style={{ gap: 12 }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="peg-group" style={{ gap: 12 }}>
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} style={{ flex: 1 }} height={16} />
          ))}
        </div>
      ))}
    </div>
  );
}
