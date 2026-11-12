/**
 * Time utilities — all business calculations are anchored on Asia/Dhaka.
 * The API persists UTC ISO timestamps; the client renders Dhaka local time.
 */
import { APP_TIME_ZONE, APP_UTC_OFFSET_MINUTES } from './constants.js';

const BH_OFFSET_MS = APP_UTC_OFFSET_MINUTES * 60 * 1000;

/** Current instant as an ISO-8601 UTC string (server authoritative). */
export function nowIso(): string {
  return new Date().toISOString();
}

/** Shift a UTC instant into the Dhaka wall-clock representation. */
export function toDhaka(date: Date | string | number): Date {
  const d = typeof date === 'string' ? new Date(date) : typeof date === 'number' ? new Date(date) : date;
  return new Date(d.getTime() + BH_OFFSET_MS);
}

/** `YYYY-MM-DD` for the Dhaka local day of the given instant. */
export function dhakaDateKey(date: Date | string | number = new Date()): string {
  return toDhaka(date).toISOString().slice(0, 10);
}

/** `HH:MM` for the Dhaka local wall clock of the given instant. */
export function dhakaTimeKey(date: Date | string | number = new Date()): string {
  return toDhaka(date).toISOString().slice(11, 16);
}

/** Bengali digits for a numeric string. */
export function toBanglaDigits(input: string | number): string {
  const map: Record<string, string> = {
    '0': '০',
    '1': '১',
    '2': '২',
    '3': '৩',
    '4': '৪',
    '5': '৫',
    '6': '৬',
    '7': '৭',
    '8': '৮',
    '9': '৯',
  };
  return String(input).replace(/[0-9]/g, (d) => map[d] ?? d);
}

const BN_MONTHS = [
  'জানুয়ারি',
  'ফেব্রুয়ারি',
  'মার্চ',
  'এপ্রিল',
  'মে',
  'জুন',
  'জুলাই',
  'আগস্ট',
  'সেপ্টেম্বর',
  'অক্টোবর',
  'নভেম্বর',
  'ডিসেম্বর',
];

const BN_DAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

/** `12 নভেম্বর ২০২৬` */
export function formatBanglaDate(dateKey: string, opts: { withDay?: boolean; withYear?: boolean } = {}): string {
  const withDay = opts.withDay ?? false;
  const withYear = opts.withYear ?? true;
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return dateKey;
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dayName = BN_DAYS[dt.getUTCDay()];
  const base = `${toBanglaDigits(d)} ${BN_MONTHS[m - 1]}`;
  const year = withYear ? ` ${toBanglaDigits(y)}` : '';
  return withDay ? `${dayName}, ${base}${year}` : `${base}${year}`;
}

/** Short weekday label, e.g. `রবি` */
export function shortBanglaDay(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (!y || !m || !d) return '';
  const idx = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return ['রবি', 'সোম', 'মঙ্গল', 'বুধ', 'বৃহ', 'শুক্র', 'শনি'][idx] ?? '';
}

/** Bengali month label for a `YYYY-MM` key. */
export function banglaMonthLabel(year: number, month: number): string {
  return `${BN_MONTHS[month - 1]} ${toBanglaDigits(year)}`;
}

/** Parse `HH:MM` into minutes from midnight. */
export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** Format minutes-from-midnight back into `HH:MM`. */
export function minutesToTime(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Resolve the UTC instant at which a Dhaka-local `HH:MM` occurs on `dateKey`.
 * `dayOffset` shifts into the next (+1) or previous (-1) calendar day.
 */
export function dhakaInstant(dateKey: string, time: string, dayOffset = 0): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  const minutes = timeToMinutes(time);
  const baseUtcMidnight = Date.UTC(y, m - 1, d);
  return new Date(baseUtcMidnight + minutes * 60 * 1000 - BH_OFFSET_MS + dayOffset * 86400000);
}

/** Duration in seconds between two ISO instants (never negative). */
export function secondsBetween(startIso: string | null, endIso: string | null): number {
  if (!startIso || !endIso) return 0;
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

/** Seconds -> `HH:MM:SS` */
export function formatDuration(totalSeconds: number, withSeconds = true): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const base = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return withSeconds ? `${base}:${String(seconds).padStart(2, '0')}` : base;
}

/** Seconds -> human `7h 30m` */
export function humanDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/** Whole days between two `YYYY-MM-DD` keys (inclusive of the start day). */
export function daysInclusive(fromDate: string, toDate: string): number {
  const a = Date.parse(`${fromDate}T00:00:00Z`);
  const b = Date.parse(`${toDate}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86400000) + 1;
}

/** Add `n` days to a `YYYY-MM-DD` key. */
export function addDays(dateKey: string, n: number): string {
  const t = Date.parse(`${dateKey}T00:00:00Z`) + n * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

/** `YYYY-MM` key for an instant in Dhaka time. */
export function dhakaMonthKey(date: Date | string | number = new Date()): string {
  return dhakaDateKey(date).slice(0, 7);
}

/** Weekday index (0 = Sunday) for a `YYYY-MM-DD` key. */
export function dayOfWeek(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Format a UTC instant for display in Dhaka time. */
export function formatDhakaDateTime(iso: string | null | undefined, opts: { bangla?: boolean; seconds?: boolean } = {}): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const shifted = toDhaka(d);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  const ss = opts.seconds ? `:${String(shifted.getUTCSeconds()).padStart(2, '0')}` : '';
  if (opts.bangla) {
    return `${toBanglaDigits(day)} ${BN_MONTHS[m - 1]} ${toBanglaDigits(y)}, ${toBanglaDigits(hh)}:${toBanglaDigits(mm)}${ss}`;
  }
  const monthName = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return `${day} ${monthName} ${y}, ${hh}:${mm}${ss}`;
}

/** Format a UTC instant as a plain Dhaka clock reading. */
export function formatDhakaTime(iso: string | null | undefined, opts: { seconds?: boolean; bangla?: boolean } = {}): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const shifted = toDhaka(d);
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  const mm = String(shifted.getUTCMinutes()).padStart(2, '0');
  const ss = opts.seconds ? `:${String(shifted.getUTCSeconds()).padStart(2, '0')}` : '';
  if (opts.bangla) return `${toBanglaDigits(hh)}:${toBanglaDigits(mm)}${ss}`;
  return `${hh}:${mm}${ss}`;
}

/**
 * Resolve the Dhaka-local wall clock for an instant, exposed as parts so the
 * UI can render a live ticking clock without extra formatting work.
 */
export function dhakaClockParts(date: Date | string | number = new Date()) {
  const shifted = toDhaka(date);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hours: shifted.getUTCHours(),
    minutes: shifted.getUTCMinutes(),
    seconds: shifted.getUTCSeconds(),
    weekday: shifted.getUTCDay(),
    timeZone: APP_TIME_ZONE,
  };
}
