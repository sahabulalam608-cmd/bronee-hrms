/**
 * BRONEE HRMS — design tokens.
 *
 * The brand palette is the one established by the original BRONEE HRMS
 * Phase 01 (published at bronee-hrms.pages.dev), so the finished system keeps
 * the same identity. `brand-*` is kept as an alias of `bronee-*` for
 * backwards compatibility with existing components.
 *
 * @type {import('tailwindcss').Config}
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bronee: {
          50: '#F8F6FC',
          100: '#F0ECF8',
          200: '#E0D8F0',
          300: '#C4B5E0',
          400: '#9B84C9',
          500: '#6B4FA0',
          600: '#5C2D91',
          700: '#4A2475',
          800: '#3B1A63',
          900: '#2E1065',
        },
        brand: {
          50: '#F8F6FC',
          100: '#F0ECF8',
          200: '#E0D8F0',
          300: '#C4B5E0',
          400: '#9B84C9',
          500: '#6B4FA0',
          600: '#5C2D91',
          700: '#4A2475',
          800: '#3B1A63',
          900: '#2E1065',
        },
        ink: {
          DEFAULT: '#1A1A1F',
          soft: '#3F3F46',
          muted: '#71717A',
          faint: '#A1A1AA',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          soft: '#FAFAFB',
          muted: '#F4F4F5',
        },
        canvas: '#FAFAFB',
        line: '#EAECF0',
        success: { DEFAULT: '#0E9F6E', soft: '#E7F7F0', deep: '#046C4E' },
        warning: { DEFAULT: '#DC6803', soft: '#FEF3E2', deep: '#B54708' },
        danger: { DEFAULT: '#D92D20', soft: '#FEE4E2', deep: '#912018' },
        info: { DEFAULT: '#0BA5EC', soft: '#E0F2FE', deep: '#026AA2' },
      },
      fontFamily: {
        sans: ['Inter', '"Hind Siliguri"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        bangla: ['"Hind Siliguri"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(26,26,31,0.04), 0 4px 16px rgba(26,26,31,0.04)',
        soft: '0 8px 30px rgba(46,16,101,0.08)',
        lift: '0 12px 40px rgba(46,16,101,0.12)',
        xs: '0 1px 2px rgba(16, 24, 40, 0.04)',
        sm: '0 1px 3px rgba(16, 24, 40, 0.06), 0 1px 2px rgba(16, 24, 40, 0.04)',
        md: '0 4px 14px -3px rgba(16, 24, 40, 0.08), 0 2px 6px -2px rgba(16, 24, 40, 0.05)',
        lg: '0 14px 36px -10px rgba(16, 24, 40, 0.14), 0 4px 12px -4px rgba(16, 24, 40, 0.06)',
        xl: '0 28px 60px -18px rgba(16, 24, 40, 0.20)',
        glow: '0 0 0 1px rgba(92, 45, 145, 0.14), 0 8px 28px -10px rgba(92, 45, 145, 0.32)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-480px 0' },
          '100%': { backgroundPosition: '480px 0' },
        },
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(14, 159, 110, 0.35)' },
          '70%': { boxShadow: '0 0 0 10px rgba(14, 159, 110, 0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(14, 159, 110, 0)' },
        },
        float: {
          '0%, 100%': { transform: 'translate3d(0,0,0)' },
          '50%': { transform: 'translate3d(0,-14px,0)' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(100%)' },
          '100%': { transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .38s cubic-bezier(.22,1,.36,1) both',
        'fade-in': 'fade-in .28s ease both',
        'scale-in': 'scale-in .22s cubic-bezier(.22,1,.36,1) both',
        shimmer: 'shimmer 1.4s linear infinite',
        'pulse-ring': 'pulse-ring 2s ease-out infinite',
        float: 'float 9s ease-in-out infinite',
        'slide-up': 'slide-up .28s cubic-bezier(.22,1,.36,1) both',
      },
    },
  },
  plugins: [],
};
