import { cx } from '../lib/cx';
import { Icon } from './icons';

export interface PaginationProps {
  page: number; // 0-based
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
  disabled?: boolean;
}

/** Range de páginas visíveis com elipses. */
function pageWindow(page: number, pageCount: number): Array<number | '…'> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i);
  }
  const pages = new Set<number>([0, pageCount - 1, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 0 && p < pageCount).sort((a, b) => a - b);
  const out: Array<number | '…'> = [];
  let prev = -2;
  for (const p of sorted) {
    if (p - prev > 1) {
      out.push('…');
    }
    out.push(p);
    prev = p;
  }
  return out;
}

export function Pagination({ page, pageSize, total, onPageChange, className, disabled }: PaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);
  return (
    <nav className={cx('peg-pagination', className)} aria-label="Paginação">
      <span className="peg-pagination__info">
        {from}–{to} de {total}
      </span>
      <button
        type="button"
        className="peg-pagination__btn"
        aria-label="Página anterior"
        disabled={disabled || page === 0}
        onClick={() => { onPageChange(page - 1); }}
      >
        <Icon name="chevronLeft" size={14} />
      </button>
      {pageWindow(page, pageCount).map((p, i) =>
        p === '…' ? (
          <span key={`e-${String(i)}`} className="peg-pagination__btn" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={p}
            type="button"
            className={cx('peg-pagination__btn', p === page && 'peg-pagination__btn--active')}
            aria-current={p === page ? 'page' : undefined}
            aria-label={`Página ${String(p + 1)}`}
            disabled={disabled}
            onClick={() => { onPageChange(p); }}
          >
            {p + 1}
          </button>
        ),
      )}
      <button
        type="button"
        className="peg-pagination__btn"
        aria-label="Próxima página"
        disabled={disabled || page >= pageCount - 1}
        onClick={() => { onPageChange(page + 1); }}
      >
        <Icon name="chevronRight" size={14} />
      </button>
    </nav>
  );
}
