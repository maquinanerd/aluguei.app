import { cx } from '../lib/cx';

export function Divider({ vertical = false, className }: { vertical?: boolean; className?: string }) {
  return <hr className={cx('peg-divider', vertical && 'peg-divider--vertical', className)} />;
}
