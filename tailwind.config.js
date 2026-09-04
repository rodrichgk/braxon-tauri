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
        // Two outcome-identity colors (not really "semantic" the way the
        // four above are — see RemanAnalytics.tsx's COLOR_SOLD/
        // COLOR_SUBCONTRACTOR), now theme-aware tokens instead of the
        // flat hex they used to be inlined as directly in that file.
        sold:            'rgb(var(--color-sold-rgb) / <alpha-value>)',
        subcontractor:   'rgb(var(--color-subcontractor-rgb) / <alpha-value>)',
        // The `primary-*` legacy alias (a static, non-theme-aware blue
        // scale) was removed here — Bench Report finding: it existed
        // solely to keep ABSTester.tsx working, the one file still
        // reaching for it instead of `accent`. Now migrated onto tokens
        // (see ABSTester.tsx's own Bench Report comments), so the alias
        // had no remaining reason to exist and stood as an open invitation
        // for future code to reach for it out of habit. Confirmed no
        // other file referenced it before removing.
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
