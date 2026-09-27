/** @type {import('tailwindcss').Config} */

// Harmonia design tokens.
// The palette is deliberately closed: one neutral scale, one accent for
// interactive elements, and a four-step priority scale (red → orange → amber →
// green) that is reserved for severity/priority semantics. Any other Tailwind
// hue is intentionally unavailable so off-palette colors cannot creep back in.
const neutral = {
  50: '#f6f7f9',
  100: '#eceef2',
  200: '#dde0e6',
  300: '#c4c9d2',
  400: '#8f97a4',
  500: '#6a7280',
  600: '#4e5663',
  700: '#3a414c',
  800: '#272d36',
  900: '#191e25',
  950: '#10141a',
};

export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    colors: {
      transparent: 'transparent',
      current: 'currentColor',
      white: '#ffffff',
      black: '#000000',
      gray: neutral,
      // Slate steel-blue: primary actions, selection, focus, neutral data.
      accent: {
        50: '#eef3f8',
        100: '#dce6f0',
        200: '#b9cbde',
        300: '#8eaac6',
        400: '#6286ab',
        500: '#436a91',
        600: '#335778',
        700: '#294763',
        800: '#223a51',
        900: '#1c3044',
        950: '#122030',
      },
      // Priority scale — P0/V0/A0 (critical) … P3/V3/A3 (low).
      red: {
        50: '#fbf1f0',
        100: '#f5dddb',
        200: '#ebb8b4',
        300: '#dc8c85',
        400: '#c95f57',
        500: '#b23c33',
        600: '#982f27',
        700: '#7c261f',
        800: '#63201a',
        900: '#501b16',
      },
      orange: {
        50: '#fcf4ed',
        100: '#f8e3d1',
        200: '#efc39f',
        300: '#e39d69',
        400: '#d57c3e',
        500: '#c26424',
        600: '#a4511c',
        700: '#844118',
        800: '#6a3416',
        900: '#562c14',
      },
      amber: {
        50: '#fcf8eb',
        100: '#f7eecb',
        200: '#eedc96',
        300: '#e2c55f',
        400: '#d5b038',
        500: '#bf9720',
        600: '#a07a19',
        700: '#7f5f17',
        800: '#664c16',
        900: '#543f15',
      },
      green: {
        50: '#eff6f1',
        100: '#d9ebdf',
        200: '#b3d6bf',
        300: '#86bb98',
        400: '#5c9d73',
        500: '#3f8158',
        600: '#316846',
        700: '#29533a',
        800: '#224330',
        900: '#1d3728',
      },
    },
    fontFamily: {
      sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
    },
    borderRadius: {
      none: '0',
      sm: '2px',
      DEFAULT: '2px',
      md: '3px',
      lg: '3px',
      xl: '4px',
      '2xl': '4px',
      '3xl': '4px',
      full: '9999px',
    },
    boxShadow: {
      none: 'none',
      sm: '0 1px 0 rgba(16, 20, 26, 0.04)',
      DEFAULT: '0 1px 0 rgba(16, 20, 26, 0.05)',
      md: '0 2px 6px rgba(16, 20, 26, 0.10)',
      lg: '0 6px 16px rgba(16, 20, 26, 0.14)',
      xl: '0 10px 28px rgba(16, 20, 26, 0.18)',
      inner: 'inset 0 1px 2px rgba(16, 20, 26, 0.06)',
    },
    extend: {},
  },
  plugins: [],
}
