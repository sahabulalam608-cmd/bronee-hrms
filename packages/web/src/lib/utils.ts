import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as Bangladeshi Taka. */
export function formatBDT(amount: number | null | undefined): string {
  const value = Math.round(Number(amount ?? 0));
  return `৳${value.toLocaleString('en-IN')}`;
}

/** Format a number with optional decimals. */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  const n = Number(value ?? 0);
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Human readable relative time ("3 minutes ago"). */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (abs < minute) return 'just now';
  if (abs < hour) {
    const n = Math.floor(abs / minute);
    return diff > 0 ? `${n}m ago` : `in ${n}m`;
  }
  if (abs < day) {
    const n = Math.floor(abs / hour);
    return diff > 0 ? `${n}h ago` : `in ${n}h`;
  }
  if (abs < 30 * day) {
    const n = Math.floor(abs / day);
    return diff > 0 ? `${n}d ago` : `in ${n}d`;
  }
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Download a Blob as a file. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Extract the initials of a name (max 2 characters). */
export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Shift accent colours — a calm, distinct palette per shift code. */
export const SHIFT_COLORS: Record<string, { bg: string; text: string; ring: string; dot: string }> = {
  MORNING: { bg: 'bg-amber-50', text: 'text-amber-700', ring: 'ring-amber-200', dot: 'bg-amber-500' },
  E1: { bg: 'bg-sky-50', text: 'text-sky-700', ring: 'ring-sky-200', dot: 'bg-sky-500' },
  E2: { bg: 'bg-indigo-50', text: 'text-indigo-700', ring: 'ring-indigo-200', dot: 'bg-indigo-500' },
  LE: { bg: 'bg-violet-50', text: 'text-violet-700', ring: 'ring-violet-200', dot: 'bg-violet-500' },
  SS: { bg: 'bg-teal-50', text: 'text-teal-700', ring: 'ring-teal-200', dot: 'bg-teal-500' },
  OFF: { bg: 'bg-slate-100', text: 'text-slate-600', ring: 'ring-slate-200', dot: 'bg-slate-400' },
};

export const SHIFT_COLOR_DEFAULT = {
  bg: 'bg-brand-50',
  text: 'text-brand-700',
  ring: 'ring-brand-200',
  dot: 'bg-brand-500',
};

export function shiftColor(code: string | null | undefined) {
  return (code && SHIFT_COLORS[code]) || SHIFT_COLOR_DEFAULT;
}

export const TASK_STATUS_META: Record<string, { label: string; className: string }> = {
  yet_to_start: { label: 'Yet to start', className: 'bg-slate-100 text-slate-700' },
  in_progress: { label: 'In progress', className: 'bg-info-soft text-info-deep' },
  pending: { label: 'Pending review', className: 'bg-warning-soft text-warning-deep' },
  complete: { label: 'Complete', className: 'bg-success-soft text-success-deep' },
};

export const PRIORITY_META: Record<string, { label: string; className: string }> = {
  low: { label: 'Low', className: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Medium', className: 'bg-info-soft text-info-deep' },
  high: { label: 'High', className: 'bg-warning-soft text-warning-deep' },
  urgent: { label: 'Urgent', className: 'bg-danger-soft text-danger-deep' },
};

export const LATE_STATUS_META: Record<string, { label: string; className: string }> = {
  on_time: { label: 'On time', className: 'bg-success-soft text-success-deep' },
  pending_review: { label: 'Pending review', className: 'bg-warning-soft text-warning-deep' },
  late: { label: 'Late', className: 'bg-danger-soft text-danger-deep' },
  excused: { label: 'Excused', className: 'bg-brand-100 text-brand-700' },
  rejected: { label: 'Rejected', className: 'bg-slate-100 text-slate-600' },
};

/** Build a CSV string from rows. */
export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          const value = cell === null || cell === undefined ? '' : String(cell);
          return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
        })
        .join(','),
    )
    .join('\n');
}

/** Trigger a browser download for a CSV payload. */
export function downloadCsv(filename: string, csv: string) {
  downloadBlob(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' }), filename);
}

/** Debounce a value. */
export function debounce<T extends (...args: never[]) => void>(fn: T, delay = 250) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
