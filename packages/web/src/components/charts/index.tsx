import { useId, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

export type ChartDatum = { label: string; value: number; color?: string };

const PALETTE = [
  '#7A5FE0',
  '#0E9F6E',
  '#0BA5EC',
  '#DC6803',
  '#AE97F6',
  '#D92D20',
  '#12B76A',
  '#EE46BC',
  '#6172F3',
  '#F79009',
];

export function colorAt(index: number, override?: string) {
  return override ?? PALETTE[index % PALETTE.length];
}

/* --------------------------------------------------------------- donut */

export function DonutChart({
  data,
  size = 168,
  thickness = 18,
  centerLabel,
  centerValue,
  className,
}: {
  data: ChartDatum[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
  className?: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  const segments = useMemo(() => {
    let offset = 0;
    return data.map((datum, index) => {
      const fraction = total > 0 ? datum.value / total : 0;
      const segment = {
        ...datum,
        color: colorAt(index, datum.color),
        fraction,
        dash: fraction * circumference,
        offset: -offset * circumference,
      };
      offset += fraction;
      return segment;
    });
  }, [data, total, circumference]);

  return (
    <div className={cn('flex items-center gap-5', className)}>
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#EAECF0"
            strokeWidth={thickness}
          />
          {segments.map((segment, index) => (
            <motion.circle
              key={segment.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={active === index ? thickness + 4 : thickness}
              strokeLinecap="round"
              strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
              initial={{ strokeDashoffset: segment.offset + segment.dash }}
              animate={{ strokeDashoffset: segment.offset }}
              transition={{ duration: 0.85, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[22px] font-extrabold tracking-[-0.02em] text-ink">
            {active !== null ? segments[active].value : (centerValue ?? total)}
          </span>
          <span className="max-w-[70%] truncate text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
            {active !== null ? segments[active].label : (centerLabel ?? 'Total')}
          </span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {segments.map((segment, index) => (
          <li
            key={segment.label}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            className={cn(
              'flex items-center gap-2 text-[12.5px] transition-opacity',
              active !== null && active !== index && 'opacity-50',
            )}
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: segment.color }} />
            <span className="min-w-0 flex-1 truncate font-medium text-ink-soft">{segment.label}</span>
            <span className="shrink-0 font-bold text-ink">{segment.value}</span>
            <span className="w-10 shrink-0 text-right text-ink-muted">
              {total > 0 ? Math.round((segment.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ bar chart */

export function BarChart({
  data,
  height = 160,
  className,
  valueSuffix = '',
}: {
  data: ChartDatum[];
  height?: number;
  className?: string;
  valueSuffix?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const [active, setActive] = useState<number | null>(null);

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((datum, index) => {
          const pct = (datum.value / max) * 100;
          return (
            <div
              key={`${datum.label}-${index}`}
              className="group relative flex h-full flex-1 flex-col justify-end"
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
            >
              <motion.div
                className="w-full rounded-t-lg"
                style={{ background: colorAt(index, datum.color) }}
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(pct, datum.value > 0 ? 4 : 0)}%` }}
                transition={{ duration: 0.7, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
              />
              {active === index ? (
                <div className="pointer-events-none absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] font-semibold text-white shadow-md">
                  {datum.label}: {datum.value}
                  {valueSuffix}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2">
        {data.map((datum, index) => (
          <span
            key={`label-${datum.label}-${index}`}
            className="min-w-0 flex-1 truncate text-center text-[11px] font-medium text-ink-muted"
          >
            {datum.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------- horizontal bar */

export function HorizontalBars({
  data,
  className,
  max: maxOverride,
}: {
  data: ChartDatum[];
  className?: string;
  max?: number;
}) {
  const max = maxOverride ?? Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className={cn('space-y-2.5', className)}>
      {data.map((datum, index) => (
        <li key={`${datum.label}-${index}`} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[12.5px] font-medium text-ink-soft">
              {datum.label}
            </span>
            <span className="shrink-0 text-[12.5px] font-bold text-ink">{datum.value}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <motion.div
              className="h-full rounded-full"
              style={{ background: colorAt(index, datum.color) }}
              initial={{ width: 0 }}
              animate={{ width: `${(datum.value / max) * 100}%` }}
              transition={{ duration: 0.75, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------- area chart */

export function AreaChart({
  points,
  height = 120,
  className,
  stroke = '#7A5FE0',
  labels,
}: {
  points: number[];
  height?: number;
  className?: string;
  stroke?: string;
  labels?: string[];
}) {
  const gradientId = useId();
  const width = 320;

  const path = useMemo(() => {
    if (points.length === 0) return { line: '', area: '' };
    const max = Math.max(1, ...points);
    const step = points.length > 1 ? width / (points.length - 1) : width;
    const coords = points.map((value, index) => ({
      x: index * step,
      y: height - 8 - (value / max) * (height - 20),
    }));
    const line = coords
      .map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`)
      .join(' ');
    const area = `${line} L${width},${height} L0,${height} Z`;
    return { line, area };
  }, [points, height]);

  if (points.length === 0) {
    return <div className={cn('rounded-xl bg-canvas', className)} style={{ height }} />;
  }

  return (
    <div className={cn('w-full', className)}>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={path.area} fill={`url(#${gradientId})`} />
        <motion.path
          d={path.line}
          fill="none"
          stroke={stroke}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      {labels ? (
        <div className="mt-1 flex justify-between text-[10.5px] font-medium text-ink-muted">
          {labels.map((label) => (
            <span key={label}>{label}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ sparkline */

export function Sparkline({
  points,
  className,
  stroke = '#7A5FE0',
}: {
  points: number[];
  className?: string;
  stroke?: string;
}) {
  if (points.length < 2) return null;
  const width = 80;
  const height = 26;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const range = max - min || 1;
  const step = width / (points.length - 1);
  const d = points
    .map((value, index) => {
      const x = index * step;
      const y = height - ((value - min) / range) * (height - 4) - 2;
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={cn('h-7 w-20', className)}>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
