/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F7F5FF',
          100: '#EFEAFF',
          200: '#E0D8FF',
          300: '#C9BAFB',
          400: '#AE97F6',
          500: '#8F76EF',
          600: '#7A5FE0',
          700: '#6748C4',
          800: '#583C9F',
          900: '#4B3480',
        },
        ink: {
          DEFAULT: '#101828',
          soft: '#475467',
          muted: '#98A2B3',
          faint: '#D0D5DD',
        },
        canvas: '#F6F6FA',
        surface: '#FFFFFF',
        line: '#EAECF0',
        success: { DEFAULT: '#0E9F6E', soft: '#E7F7F0', deep: '#046C4E' },
        warning: { DEFAULT: '#DC6803', soft: '#FEF3E2', deep: '#B54708' },
        danger: { DEFAULT: '#D92D20', soft: '#FEE4E2', deep: '#912018' },
        info: { DEFAULT: '#0BA5EC', soft: '#E0F2FE', deep: '#026AA2' },
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Hind Siliguri', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        bangla: ['"Hind Siliguri"', '"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: {
        '4xl': '2rem',
      },
      boxShadow: {
        xs: '0 1px 2px rgba(16, 24, 40, 0.04)',
        sm: '0 1px 3px rgba(16, 24, 40, 0.06), 0 1px 2px rgba(16, 24, 40, 0.04)',
        md: '0 4px 14px -3px rgba(16, 24, 40, 0.08), 0 2px 6px -2px rgba(16, 24, 40, 0.05)',
        lg: '0 14px 36px -10px rgba(16, 24, 40, 0.14), 0 4px 12px -4px rgba(16, 24, 40, 0.06)',
        xl: '0 28px 60px -18px rgba(16, 24, 40, 0.20)',
        glow: '0 0 0 1px rgba(122, 95, 224, 0.14), 0 8px 28px -10px rgba(122, 95, 224, 0.35)',
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
