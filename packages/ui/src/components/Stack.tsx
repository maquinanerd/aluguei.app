import type { HTMLAttributes } from 'react';
import { cx } from '../lib/cx';

export type GapSize = 0 | 1 | 2 | 3 | 4 | 6 | 8;

const GAP_CLASS: Record<GapSize, string> = {
  0: 'gap-0',
  1: 'gap-1',
  2: 'gap-2',
  3: 'gap-3',
  4: 'gap-4',
  6: 'gap-6',
  8: 'gap-8',
};

export interface StackProps extends HTMLAttributes<HTMLDivElement> {
  gap?: GapSize;
}

/** Coluna vertical com gap da escala PEG. */
export function Stack({ gap = 4, className, ...rest }: StackProps) {
  return <div className={cx('peg-stack', GAP_CLASS[gap], className)} {...rest} />;
}

export interface GroupProps extends HTMLAttributes<HTMLDivElement> {
  gap?: GapSize;
  wrap?: boolean;
  between?: boolean;
  end?: boolean;
  stretch?: boolean;
  start?: boolean;
}

/** Linha horizontal com gap da escala PEG. */
export function Group({ gap = 2, wrap, between, end, stretch, start, className, ...rest }: GroupProps) {
  return (
    <div
      className={cx(
        'peg-group',
        GAP_CLASS[gap],
        wrap && 'wrap',
        between && 'between',
        end && 'end',
        stretch && 'stretch',
        start && 'start',
        className,
      )}
      {...rest}
    />
  );
}
