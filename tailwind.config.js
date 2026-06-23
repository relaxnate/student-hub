// Build a full 50–950 scale for a status palette wired to CSS variables, so the
// whole ramp can be re-themed at runtime from a single user-chosen color.
const statusScale = (name) => {
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
  return Object.fromEntries(
    shades.map((s) => [s, `rgb(var(--${name}-${s}) / <alpha-value>)`])
  )
}

// Density-aware spacing: padding / gap / space utilities multiply by the runtime
// --density-mult (set per data-density), so the UI compresses or relaxes without
// touching fixed dimensions (widths/heights keep the default spacing scale).
const SPACING_STEPS = [
  0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7, 8, 9, 10, 11, 12,
  14, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60, 64, 72, 80, 96,
]
const densitySpacing = () => {
  const out = { 0: '0px', px: '1px' }
  for (const n of SPACING_STEPS) {
    out[n] = `calc(${n * 0.25}rem * var(--density-mult, 1))`
  }
  return out
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Neutral surface palette — driven by CSS vars so it flips per theme
        // (dark / light / OLED). Defaults defined in index.css.
        surface: {
          950: 'rgb(var(--surface-950) / <alpha-value>)',
          900: 'rgb(var(--surface-900) / <alpha-value>)',
          800: 'rgb(var(--surface-800) / <alpha-value>)',
          700: 'rgb(var(--surface-700) / <alpha-value>)',
          600: 'rgb(var(--surface-600) / <alpha-value>)',
          500: 'rgb(var(--surface-500) / <alpha-value>)',
        },
        // Primary accent — user-customizable ramp. CSS vars carry "r g b"
        // channels; default indigo ramp lives in index.css.
        accent: {
          50:  'rgb(var(--accent-50)  / <alpha-value>)',
          100: 'rgb(var(--accent-100) / <alpha-value>)',
          200: 'rgb(var(--accent-200) / <alpha-value>)',
          300: 'rgb(var(--accent-300) / <alpha-value>)',
          400: 'rgb(var(--accent-400) / <alpha-value>)',
          500: 'rgb(var(--accent-500) / <alpha-value>)',
          600: 'rgb(var(--accent-600) / <alpha-value>)',
          700: 'rgb(var(--accent-700) / <alpha-value>)',
          800: 'rgb(var(--accent-800) / <alpha-value>)',
          900: 'rgb(var(--accent-900) / <alpha-value>)',
          950: 'rgb(var(--accent-950) / <alpha-value>)',
        },
        // Semantic neutral scale. Overrides Tailwind's built-in zinc so the
        // whole UI's text/neutral tones flip for light mode without touching
        // components (dark/OLED use the standard zinc values; light inverts).
        zinc: {
          50:  'rgb(var(--zinc-50)  / <alpha-value>)',
          100: 'rgb(var(--zinc-100) / <alpha-value>)',
          200: 'rgb(var(--zinc-200) / <alpha-value>)',
          300: 'rgb(var(--zinc-300) / <alpha-value>)',
          400: 'rgb(var(--zinc-400) / <alpha-value>)',
          500: 'rgb(var(--zinc-500) / <alpha-value>)',
          600: 'rgb(var(--zinc-600) / <alpha-value>)',
          700: 'rgb(var(--zinc-700) / <alpha-value>)',
          800: 'rgb(var(--zinc-800) / <alpha-value>)',
          900: 'rgb(var(--zinc-900) / <alpha-value>)',
          950: 'rgb(var(--zinc-950) / <alpha-value>)',
        },
        // Status palettes — overridden by user-chosen status colors. CSS vars
        // carry "r g b"; built-in default ramps (exact Tailwind values) live in
        // index.css so the default look is unchanged.
        green: statusScale('green'),
        amber: statusScale('amber'),
        red:   statusScale('red'),
        blue:  statusScale('blue'),

        // Status aliases
        success: 'rgb(var(--green-500) / <alpha-value>)',
        warning: 'rgb(var(--amber-500) / <alpha-value>)',
        danger:  'rgb(var(--red-500) / <alpha-value>)',
        info:    'rgb(var(--blue-500) / <alpha-value>)',
      },
      fontFamily: {
        // Consumes the active font stack chosen in Appearance settings.
        sans:  ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono:  ['JetBrains Mono', 'Fira Code', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.65rem', { lineHeight: '1rem' }],
      },
      // Density-scaled spacing (padding / gap / space-between only)
      padding: densitySpacing(),
      gap:     densitySpacing(),
      space:   densitySpacing(),
      borderRadius: {
        // Corner-style driven; values set per data-corner in index.css.
        DEFAULT: 'var(--r-default)',
        md:      'var(--r-md)',
        lg:      'var(--r-lg)',
        xl:      'var(--r-xl)',
        '2xl':   'var(--r-2xl)',
        '3xl':   'var(--r-3xl)',
      },
      boxShadow: {
        DEFAULT: 'var(--shadow)',
        sm:      'var(--shadow-sm)',
        lg:      'var(--shadow-lg)',
        none:    'none',
      },
      animation: {
        'fade-in':    'fadeIn 0.2s ease-out',
        'slide-up':   'slideUp 0.25s ease-out',
        'slide-in':   'slideIn 0.25s ease-out',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn:     { from: { opacity: '0' },                  to: { opacity: '1' } },
        slideUp:    { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideIn:    { from: { opacity: '0', transform: 'translateX(-8px)' }, to: { opacity: '1', transform: 'translateX(0)' } },
        pulseSoft:  { '0%, 100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
      },
    },
  },
  plugins: [],
}
