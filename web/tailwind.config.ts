import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', '../shared/**/*.ts'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        ink: {
          DEFAULT: '#0f172a',
          soft: '#1e293b',
          muted: '#475569',
          faint: '#5f6b7d',
        },
        surface: {
          DEFAULT: '#ffffff',
          sunken: '#f5f6fa',
          raised: '#fafbfe',
        },
        line: {
          DEFAULT: '#e7e9f2',
          strong: '#d7dae7',
        },
        ok: { DEFAULT: '#047857', soft: '#ecfdf5', line: '#a7f3d0' },
        warn: { DEFAULT: '#b45309', soft: '#fffbeb', line: '#fde68a' },
        bad: { DEFAULT: '#b91c1c', soft: '#fef2f2', line: '#fecaca' },
        info: { DEFAULT: '#0ea5e9', soft: '#f0f9ff', line: '#bae6fd' },
      },
      fontFamily: {
        sans: [
          '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica Neue',
          'Noto Sans', 'Noto Sans Bengali', 'Arial', 'sans-serif',
        ],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(15,23,42,0.04), 0 8px 24px -12px rgba(15,23,42,0.10)',
        lift: '0 2px 4px rgba(15,23,42,0.05), 0 18px 40px -16px rgba(91,33,182,0.22)',
        inset: 'inset 0 1px 2px rgba(15,23,42,0.05)',
        brand: '0 8px 24px -8px rgba(109,40,217,0.45)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
        '3xl': '1.5rem',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        shimmer: { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
      },
      animation: {
        'fade-up': 'fade-up 0.35s cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 0.25s ease-out both',
        shimmer: 'shimmer 1.6s linear infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
