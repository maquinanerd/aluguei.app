import type { ReactNode } from 'react';
import { cx } from '../lib/cx';
import { Checkbox } from './Checkbox';
import { Icon } from './icons';
import { Skeleton } from './Skeleton';
import { EmptyState } from './StateViews';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Conteúdo da célula. */
  render: (row: T) => ReactNode;
  /** Classe aplicada na célula (ex.: alinhamento). */
  cellClassName?: string;
  sortable?: boolean;
  /** Chave de ordenação se diferente de key. */
  sortKey?: string;
  headerClassName?: string;
}

export interface DataTableProps<T extends { id: string }> {
  columns: ReadonlyArray<Column<T>>;
  rows: readonly T[];
  rowKey?: (row: T) => string;
  loading?: boolean;
  selectedIds?: ReadonlySet<string>;
  onSelectIds?: (ids: Set<string>) => void;
  onSort?: (sortKey: string) => void;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  emptyTitle?: string;
  emptyBody?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  dense?: boolean;
  className?: string;
  onRowClick?: (row: T) => void;
  skeletonRows?: number;
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  rowKey,
  loading = false,
  selectedIds,
  onSelectIds,
  onSort,
  sortKey,
  sortDir,
  emptyTitle = 'Nenhum registro',
  emptyBody = 'Ainda não há dados para exibir.',
  emptyActionLabel,
  onEmptyAction,
  dense = false,
  className,
  onRowClick,
  skeletonRows = 6,
}: DataTableProps<T>) {
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds?.has(r.id));
  const someSelected =
    rows.some((r) => selectedIds?.has(r.id)) && !allSelected;

  function toggleAll() {
    if (!onSelectIds) return;
    const next = new Set(selectedIds ?? []);
    if (allSelected) {
      for (const r of rows) next.delete(r.id);
    } else {
      for (const r of rows) next.add(r.id);
    }
    onSelectIds(next);
  }

  function toggleOne(id: string) {
    if (!onSelectIds) return;
    const next = new Set(selectedIds ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectIds(next);
  }

  return (
    <div className={cx('peg-table-wrap', className)}>
      <table className={cx('peg-table', dense && 'peg-table--dense')}>
        <thead>
          <tr>
            {onSelectIds ? (
              <th style={{ width: 36 }}>
                <Checkbox
                  checked={allSelected}
                  aria-label="Selecionar todos"
                  onChange={toggleAll}
                  ref={undefined}
                  indeterminate={someSelected}
                />
              </th>
            ) : null}
            {columns.map((col) => (
              <th
                key={col.key}
                className={cx(
                  col.sortable && 'peg-table__sortable',
                  sortKey === (col.sortKey ?? col.key) && 'peg-table__sorted',
                  col.headerClassName,
                )}
                onClick={
                  col.sortable && onSort
                    ? () => { onSort(col.sortKey ?? col.key); }
                    : undefined
                }
                aria-sort={
                  sortKey === (col.sortKey ?? col.key)
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined
                }
              >
                <span className="peg-group" style={{ gap: 4 }}>
                  {col.header}
                  {col.sortable ? (
                    <Icon
                      name={
                        sortKey === (col.sortKey ?? col.key)
                          ? sortDir === 'asc'
                            ? 'arrowUp'
                            : 'arrowDown'
                          : 'arrowUpDown'
                      }
                      size={12}
                    />
                  ) : null}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, r) => (
                <tr key={`sk-${String(r)}`} aria-hidden="true">
                  {onSelectIds ? <td style={{ width: 36 }} /> : null}
                  {columns.map((col) => (
                    <td key={col.key}>
                      <Skeleton height={14} width="70%" />
                    </td>
                  ))}
                </tr>
              ))
            : rows.map((row) => {
                const id = rowKey ? rowKey(row) : row.id;
                const selected = selectedIds?.has(id) ?? false;
                return (
                  <tr
                    key={id}
                    className={cx(selected && 'peg-table__selected')}
                    onClick={onRowClick ? () => { onRowClick(row); } : undefined}
                    style={onRowClick ? { cursor: 'pointer' } : undefined}
                  >
                    {onSelectIds ? (
                      <td style={{ width: 36 }} onClick={(e) => { e.stopPropagation(); }}>
                        <Checkbox
                          checked={selected}
                          aria-label={`Selecionar ${id}`}
                          onChange={() => { toggleOne(id); }}
                          ref={undefined}
                        />
                      </td>
                    ) : null}
                    {columns.map((col) => (
                      <td key={col.key} className={col.cellClassName}>
                        {col.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
        </tbody>
      </table>
      {!loading && rows.length === 0 ? (
        (() => {
          const emptyProps: {
            title: string;
            body: string;
            icon: 'inbox';
            actionLabel?: string;
            onAction?: () => void;
          } = { title: emptyTitle, body: emptyBody, icon: 'inbox' };
          if (emptyActionLabel !== undefined) emptyProps.actionLabel = emptyActionLabel;
          if (onEmptyAction !== undefined) emptyProps.onAction = onEmptyAction;
          return <EmptyState {...emptyProps} />;
        })()
      ) : null}
    </div>
  );
}
