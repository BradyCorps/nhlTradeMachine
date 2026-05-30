import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ── The Hockey Ledger brand tokens ──────────────────────
      // These map to the CSS variables in globals.css.
      // Use as: text-ledger-ink, bg-ledger-paper, border-ledger-rule etc.
      colors: {
        ledger: {
          paper:       '#f2ecd7',
          card:        '#e4d8b8',
          inset:       '#d6c8a5',
          dark:        '#b8a98c',
          ink:         '#261e12',
          'ink-mid':   '#403525',
          'ink-light': '#5e4f3a',
          'ink-faint': '#7a6a50',
          rule:        '#a89569',
          'rule-light':'#d6c8a5',
          red:         '#a63524',
          green:       '#245e39',
          amber:       '#946914',
          navy:        '#1a2e5c',
        },
      },
      fontFamily: {
        // next/font injects these CSS variables via layout.tsx
        serif:  ['var(--font-baskerville)', 'Georgia', 'serif'],
        mono:   ['var(--font-courier)',     'Courier New', 'monospace'],
        fraktur:['var(--font-fraktur)',     'serif'],
      },
      fontSize: {
        // Enforce 11px minimum for accessible text
        '2xs': ['0.6875rem', { lineHeight: '1rem' }], // 11px
      },
    },
  },
  plugins: [],
};
export default config;