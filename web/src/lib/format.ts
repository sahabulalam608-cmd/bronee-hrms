/** Formatting helpers for money, numbers and initials. */

import { CURRENCY } from '@shared/constants';

export function formatMoney(amount: number): string {
  const sign = amount < 0 ? '-' : '';
  return `${sign}${CURRENCY} ${Math.abs(Math.round(amount)).toLocaleString('en-US')}`;
}

export function formatCompactMoney(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 100000) return `${amount < 0 ? '-' : ''}${CURRENCY} ${(abs / 1000).toFixed(0)}k`;
  return formatMoney(amount);
}

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/** Stable pleasant colour from a string — used for avatars. */
export function avatarHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

export function percent(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}
