import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Neutral-first ink scale. Only `accent` carries hue.
        ink: {
          DEFAULT: 'rgb(var(--color-ink) / <alpha-value>)',
          soft: 'rgb(var(--color-ink-soft) / <alpha-value>)',
          muted: 'rgb(var(--color-ink-muted) / <alpha-value>)',
        },
        paper: {
          DEFAULT: 'rgb(var(--color-paper) / <alpha-value>)',
          raised: 'rgb(var(--color-paper-raised) / <alpha-value>)',
          sunk: 'rgb(var(--color-paper-sunk) / <alpha-value>)',
        },
        line: {
          DEFAULT: 'rgb(var(--color-line) / <alpha-value>)',
          strong: 'rgb(var(--color-line-strong) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          hover: 'rgb(var(--color-accent-hover) / <alpha-value>)',
          wash: 'rgb(var(--color-accent-wash) / <alpha-value>)',
        },
        state: {
          ok: 'rgb(var(--color-state-ok) / <alpha-value>)',
          run: 'rgb(var(--color-state-run) / <alpha-value>)',
          wait: 'rgb(var(--color-state-wait) / <alpha-value>)',
          error: 'rgb(var(--color-state-error) / <alpha-value>)',
        },
      },
      fontFamily: {
        // Poppins carries display voice, Inter carries every readable surface. No third family.
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        accent: 'var(--shadow-accent)',
        lift: 'var(--shadow-lift)',
        'lift-hover': 'var(--shadow-lift-hover)',
        float: 'var(--shadow-float)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
      },
      transitionDuration: {
        fast: '160ms',
        base: '280ms',
        slow: '600ms',
        cinematic: '1000ms',
      },
      // Overridden so no `text-xs`/`text-sm` in the codebase can render below the readability floor
      // (15px secondary, 17px body). See globals.css type scale.
      fontSize: {
        xs: ['0.9375rem', { lineHeight: '1.5' }],
        sm: ['1.0625rem', { lineHeight: '1.6' }],
        base: ['var(--type-body)', { lineHeight: '1.65' }],
      },
      minHeight: {
        // 24px rem floor for tap targets that must never regress below 44px
        tap: '2.75rem',
      },
      maxWidth: {
        measure: 'var(--measure)',
        shell: '80rem',
      },
    },
  },
  plugins: [],
};

export default config;