/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
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
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(26,26,31,0.04), 0 4px 16px rgba(26,26,31,0.04)',
        soft: '0 8px 30px rgba(46,16,101,0.08)',
        lift: '0 12px 40px rgba(46,16,101,0.12)',
      },
    },
  },
  plugins: [],
}
