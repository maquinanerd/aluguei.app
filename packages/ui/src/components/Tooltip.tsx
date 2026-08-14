'use client';

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cx } from '../lib/cx';

export function Tooltip({
  label,
  children,
  side = 'top',
  className,
}: {
  label: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; transform: string } | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);

  function update() {
    const el = wrapRef.current?.firstElementChild as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 6;
    if (side === 'top') {
      setPos({ top: r.top - gap, left: r.left + r.width / 2, transform: 'translate(-50%, -100%)' });
    } else if (side === 'bottom') {
      setPos({ top: r.bottom + gap, left: r.left + r.width / 2, transform: 'translate(-50%, 0)' });
    } else if (side === 'left') {
      setPos({ top: r.top + r.height / 2, left: r.left - gap, transform: 'translate(-100%, -50%)' });
    } else {
      setPos({ top: r.top + r.height / 2, left: r.right + gap, transform: 'translate(0, -50%)' });
    }
  }

  return (
    <span
      ref={wrapRef}
      className={cx('peg-tooltip-wrap', className)}
      onMouseEnter={() => {
        update();
        setShow(true);
      }}
      onMouseLeave={() => { setShow(false); }}
      onFocus={() => {
        update();
        setShow(true);
      }}
      onBlur={() => { setShow(false); }}
    >
      {children}
      {show && pos ? (
        <span role="tooltip" className="peg-tooltip" style={{ top: pos.top, left: pos.left, transform: pos.transform }}>
          {label}
        </span>
      ) : null}
    </span>
  );
}
