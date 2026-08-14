import { cx } from '../lib/cx';

export function Spinner({
  size = 16,
  brand = true,
  className,
}: {
  size?: number;
  brand?: boolean;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Carregando"
      className={cx('peg-spinner', brand && 'peg-spinner--brand', className)}
      style={{ width: size, height: size, borderWidth: Math.max(2, Math.round(size / 8)) }}
    />
  );
}
