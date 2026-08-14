import { cx } from '../lib/cx';
import { initials } from '../lib/format';

export function Avatar({
  name,
  size = 'md',
  src,
  brand = false,
  className,
}: {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  src?: string | null;
  brand?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx('peg-avatar', `peg-avatar--${size}`, brand && 'peg-avatar--brand', className)}
      aria-hidden="true"
    >
      {src ? <img className="peg-avatar__img" src={src} alt="" /> : initials(name)}
    </span>
  );
}
