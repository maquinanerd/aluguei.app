import { cx } from '../lib/cx';
import { formatBRL } from '../lib/format';

/** Valor monetário formatado a partir de centavos canônicos (apresentação apenas). */
export function MoneyValue({
  cents,
  muted = false,
  className,
}: {
  cents: number | null | undefined;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span className={cx('peg-money', muted && 'peg-money--muted', className)}>
      {formatBRL(cents)}
    </span>
  );
}
