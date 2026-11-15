/**
 * Bangladesh-time helpers.
 * Everything the employee sees is rendered in Asia/Dhaka regardless of the
 * device timezone; stored timestamps stay UTC/ISO.
 */

export const BD_TZ = 'Asia/Dhaka';

const bdTimeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: BD_TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});

const bdDateFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: BD_TZ,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const bdLongFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: BD_TZ,
  weekday: 'long',
  day: '2-digit',
  month: 'long',
  year: 'numeric',
});

/** `YYYY-MM-DD` for the current Bangladesh day. */
export function todayBD(): string {
  return bdDateKey(new Date());
}

/** `YYYY-MM-DD` for a given instant, evaluated in Bangladesh time. */
export function bdDateKey(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BD_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Minutes past midnight in Bangladesh time. */
export function bdMinutesOfDay(d: Date | string): number {
  const date = typeof d === 'string' ? new Date(d) : d;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BD_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

/** `09:20 AM` */
export function formatTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return bdTimeFmt.format(date).replace(/ /g, ' ');
}

/** `09:20:45 AM` — used by the live clock. */
export function formatTimeSeconds(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return bdTimeFmt.format(date).replace(/ /g, ' ');
}

/** `12 Nov 2026` */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return bdDateFmt.format(date);
}

/** `12 November 2026` */
export function formatLongDate(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return bdLongFmt.format(date);
}

/** `12 Nov 2026, 09:20 AM` */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return '—';
  return `${bdDateFmt.format(date)}, ${bdTimeFmt.format(date).replace(/ /g, ' ')}`;
}

/** `Thursday` */
export function formatWeekday(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat('en-GB', { timeZone: BD_TZ, weekday: 'long' }).format(date);
}

/** `HH:MM:SS` duration from seconds. */
export function formatDuration(totalSeconds: number, opts: { compact?: boolean } = {}): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (opts.compact && h === 0) return `${m}m`;
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

/** `7h 12m` */
export function formatHoursMinutes(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** `3h 24m` from minutes. */
export function formatMinutes(minutes: number): string {
  return formatHoursMinutes(minutes * 60);
}

/** `Sep 2026` */
export function formatMonthKey(key: string): string {
  const [y, m] = key.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(date);
}

/** `YYYY-MM` for the current Bangladesh month. */
export function currentMonthKey(): string {
  return bdDateKey(new Date()).slice(0, 7);
}

/** Add days to a `YYYY-MM-DD` key. */
export function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Inclusive day count between two `YYYY-MM-DD` keys. */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  return Math.floor((b - a) / 86400000) + 1;
}

/** Difference in whole days from today (Bangladesh) — negative means past. */
export function daysFromToday(dateKey: string): number {
  const today = new Date(`${todayBD()}T00:00:00Z`).getTime();
  const target = new Date(`${dateKey}T00:00:00Z`).getTime();
  return Math.round((target - today) / 86400000);
}

/** `09:20 AM` from minutes past midnight. */
export function formatShiftTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
}
