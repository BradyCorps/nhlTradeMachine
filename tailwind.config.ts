import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        ledger: {
          // Paper tones
          paper:        '#f2ecd7',
          card:         '#e4d8b8',
          'card-light': '#ede4cc',
          inset:        '#d6c8a5',
          dark:         '#b8a98c',
          cream:        '#dfd0a8',
          warm:         '#e8dab8',
          // Ink tones
          ink:          '#1c140a',
          'ink-deep':   '#261e12',
          'ink-mid':    '#3d2e18',
          'ink-body':   '#4a3820',
          'ink-light':  '#5e4f3a',
          'ink-faint':  '#9a7d58',
          // Rule tones
          rule:         '#b8a070',
          'rule-mid':   '#c8b890',
          'rule-light': '#c8b078',
          'rule-faint': '#d6c8a5',
          // Accent
          red:          '#b83020',
          'red-deep':   '#c0392b',
          'red-dark':   '#d43820',
          green:        '#1a5c2e',
          navy:         '#1a2e5c',
          brown:        '#6b5030',
          amber:        '#8a5c00',
          'amber-dark': '#9a6b00',
          gold:         '#946914',
          orange:       '#d97706',
        },
      },
      fontFamily: {
        serif:   ['var(--font-baskerville)', 'Georgia', 'serif'],
        mono:    ['var(--font-courier)',     'Courier New', 'monospace'],
        fraktur: ['var(--font-fraktur)',     'serif'],
      },
      fontSize: {
        '2xs': ['0.75rem', { lineHeight: '1rem' }], // 11px minimum
      },
    },
  },
  plugins: [],
};
export default config;