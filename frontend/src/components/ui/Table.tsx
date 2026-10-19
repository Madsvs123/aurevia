import type { ReactNode, TableHTMLAttributes } from 'react';
import clsx from 'clsx';
import { Skeleton } from './Skeleton';
import { EmptyState } from './EmptyState';

interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
}

interface TableProps<T> extends TableHTMLAttributes<HTMLTableElement> {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyTitle?: string;
  emptyMessage?: string;
  emptyAction?: ReactNode;
  skeletonRows?: number;
  onSort?: (key: string) => void;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onRowClick?: (row: T) => void;
}

export function Table<T>({
  columns,
  data,
  rowKey,
  loading,
  emptyTitle = 'Nothing here yet',
  emptyMessage = 'No records match the current view.',
  emptyAction,
  skeletonRows = 6,
  onSort,
  sortKey,
  sortDir,
  onRowClick,
  className,
  ...rest
}: TableProps<T>) {
  const alignClass = { left: 'text-right', right: 'text-left', center: 'text-center' };

  return (
    <div className="table-wrap">
      <table className={clsx('table', className)} {...rest}>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={clsx(alignClass[col.align ?? 'left'], col.sortable && 'cursor-pointer select-none')}
                onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
                aria-sort={
                  sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined
                }
              >
                {col.header}
                {col.sortable && sortKey === col.key ? (
                  <span className="ml-1 text-xs">{sortDir === 'asc' ? '↑' : '↓'}</span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {columns.map((col) => (
                    <td key={col.key}>
                      <Skeleton className="h-4 w-full max-w-[140px]" />
                    </td>
                  ))}
                </tr>
              ))
            : data.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={clsx(alignClass[col.align ?? 'left'], col.className)}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {loading && data.length === 0 ? (
        <div className="py-10">
          <EmptyState title={emptyTitle} message={emptyMessage} action={emptyAction} compact />
        </div>
      ) : null}
    </div>
  );
}
