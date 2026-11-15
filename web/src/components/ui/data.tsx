import { type ReactNode, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NumberingBar, useNumbering } from './list-numbering';
import { EmptyState, Skeleton } from './primitives';

/* ------------------------------------------------------------------ *
 * Data table
 * ------------------------------------------------------------------ */

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T, index: number) => ReactNode;
  align?: 'left' | 'right' | 'center';
  className?: string;
  headerClassName?: string;
  sortable?: boolean;
  width?: string;
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  rows,
  rowKey,
  emptyTitle = 'Nothing to show',
  emptyDescription,
  emptyIcon,
  loading = false,
  onRowClick,
  className,
  bodyClassName,
  serial = true,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T, index: number) => string;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: ReactNode;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  className?: string;
  bodyClassName?: string;
  /** Whether the rows carry a serial number column while serial numbering is on. */
  serial?: boolean;
}) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(null);
  const { enabled: numberingOn } = useNumbering();
  const withSerial = serial && numberingOn;

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [rows, sort, columns]);

  const visibleColumns: Column<T>[] = withSerial
    ? [
        {
          key: '__serial',
          header: 'S/N',
          width: '62px',
          className: 'text-[12px] font-semibold tabular-nums text-ink-muted',
          headerClassName: 'text-[11px] font-semibold uppercase tracking-wider text-ink-muted',
          render: (_row, index) => (
            <span className="tabular-nums">{index + 1}.</span>
          ),
        },
        ...columns,
      ]
    : columns;

  if (loading) {
    return (
      <div className="space-y-2">
        <NumberingBar />
        <div className={cn('table-shell divide-y divide-line', className)}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              {visibleColumns.map((col) => (
                <Skeleton key={col.key} className={cn('h-3.5', col.width ?? 'w-24')} />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="space-y-2">
        <NumberingBar />
        <div className={cn('table-shell', className)}>
          <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <NumberingBar />
      <div className={cn('table-shell overflow-x-auto', className)}>
        <table className="w-full min-w-max border-collapse">
          <thead>
            <tr className="table-head">
              {visibleColumns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'px-4 py-3 text-left font-semibold',
                    col.align === 'right' && 'text-right',
                    col.align === 'center' && 'text-center',
                    col.headerClassName,
                  )}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() =>
                        setSort((prev) =>
                          prev?.key === col.key
                            ? { key: col.key, dir: 'desc' }
                            : { key: col.key, dir: 'asc' },
                        )
                      }
                      className="inline-flex items-center gap-1.5 transition-colors hover:text-ink"
                    >
                      {col.header}
                      <ArrowUpDown
                        size={12}
                        className={cn(sort?.key === col.key ? 'text-brand-600' : 'opacity-40')}
                      />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className={bodyClassName}>
            {sorted.map((row, index) => (
              <tr
                key={rowKey(row, index)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('table-row', onRowClick && 'cursor-pointer')}
              >
                {visibleColumns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'table-cell',
                      col.align === 'right' && 'text-right',
                      col.align === 'center' && 'text-center',
                      col.className,
                    )}
                  >
                    {col.render ? col.render(row, index) : (row[col.key] as ReactNode)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tabs
 * ------------------------------------------------------------------ */

export interface TabItem {
  key: string;
  label: string;
  count?: number;
  icon?: ReactNode;
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('no-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1', className)}>
      {tabs.map((tab) => {
        const isActive = tab.key === active;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onChange(tab.key)}
            className={cn(
              'relative flex shrink-0 items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors',
              isActive ? 'text-brand-700' : 'text-ink-muted hover:text-ink',
            )}
          >
            {tab.icon}
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[11px] font-semibold',
                  isActive ? 'bg-brand-100 text-brand-700' : 'bg-surface-sunken text-ink-faint',
                )}
              >
                {tab.count}
              </span>
            )}
            {isActive && (
              <motion.span
                layoutId="tab-underline"
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-brand-600"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Search input
 * ------------------------------------------------------------------ */

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search…',
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="field pl-10 pr-9"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-faint transition-colors hover:bg-surface-sunken hover:text-ink"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Pagination
 * ------------------------------------------------------------------ */

export function Pagination({
  page,
  pageCount,
  onChange,
  total,
  className,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
  total?: number;
  className?: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      {total !== undefined && (
        <p className="text-[12.5px] text-ink-muted">
          Page <span className="font-semibold text-ink">{page}</span> of {pageCount}
        </p>
      )}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="btn-icon h-8 w-8 border border-line-strong"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        {Array.from({ length: pageCount }).slice(Math.max(0, page - 3), Math.max(0, page - 3) + 5).map((_, i) => {
          const p = Math.max(0, page - 3) + i + 1;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange(p)}
              className={cn(
                'h-8 min-w-8 rounded-lg px-2 text-[13px] font-medium transition-colors',
                p === page ? 'bg-brand-700 text-white' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
              )}
            >
              {p}
            </button>
          );
        })}
        <button
          type="button"
          className="btn-icon h-8 w-8 border border-line-strong"
          disabled={page >= pageCount}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Filter bar
 * ------------------------------------------------------------------ */

export function FilterBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end gap-2.5', className)}>{children}</div>
  );
}

/* ------------------------------------------------------------------ *
 * Distribution bar — used by the HR dashboard breakdowns
 * ------------------------------------------------------------------ */

export function DistributionBar({
  items,
  className,
}: {
  items: { label: string; value: number; color?: string }[];
  className?: string;
}) {
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const palette = ['#6d28d9', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#64748b'];
  return (
    <div className={cn('space-y-2.5', className)}>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-surface-sunken">
        {items.map((item, index) => (
          <motion.span
            key={item.label}
            initial={{ width: 0 }}
            animate={{ width: total ? `${(item.value / total) * 100}%` : '0%' }}
            transition={{ duration: 0.6, delay: index * 0.05, ease: 'easeOut' }}
            style={{ background: item.color ?? palette[index % palette.length] }}
            className="h-full"
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((item, index) => (
          <span key={item.label} className="inline-flex items-center gap-1.5 text-[12px] text-ink-muted">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: item.color ?? palette[index % palette.length] }}
            />
            {item.label}
            <span className="font-semibold text-ink">{item.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Chart legend
 * ------------------------------------------------------------------ */

export interface LegendItem {
  label: string;
  color: string;
  value?: string | number;
}

/**
 * Legend rendered outside the chart surface so a pie/donut is never clipped
 * by the space a chart library reserves for its own legend.
 */
export function ChartLegend({
  items,
  className,
}: {
  items: LegendItem[];
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <ul className={cn('flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5', className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-[3px]"
            style={{ backgroundColor: item.color }}
          />
          <span className="text-ink-soft">{item.label}</span>
          {item.value !== undefined && (
            <span className="font-medium tabular-nums text-ink">{item.value}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
