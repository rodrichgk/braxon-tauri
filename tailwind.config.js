/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      colors: {
        // All tokens reference CSS variables → single source of truth for light/dark
        app:             'var(--color-app)',
        sidebar:         'var(--color-sidebar)',
        'sidebar-border':'var(--color-sidebar-border)',
        card:            'var(--color-card)',
        elevated:        'var(--color-elevated)',
        border:          'var(--color-border)',
        'text-primary':  'var(--color-text-primary)',
        'text-secondary':'var(--color-text-secondary)',
        // RGB-channel format so Tailwind can apply /15, /25, /50 opacity modifiers
        'text-tertiary': 'rgb(var(--color-text-tertiary-rgb) / <alpha-value>)',
        accent:          'rgb(var(--color-accent-rgb) / <alpha-value>)',
        success:         'rgb(var(--color-success-rgb) / <alpha-value>)',
        warning:         'rgb(var(--color-warning-rgb) / <alpha-value>)',
        danger:          'rgb(var(--color-danger-rgb) / <alpha-value>)',

        // Legacy aliases so existing pages keep working
        primary: {
          50:  '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd',
          400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8',
          800: '#1e40af', 900: '#1e3a8a',
        },
      },
      animation: {
        'fade-in':    'fadeIn 0.25s ease-out',
        'slide-up':   'slideUp 0.25s ease-out',
        'pulse-slow': 'pulse 2.5s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' },                              to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(6px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
}
