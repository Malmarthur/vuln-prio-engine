/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      borderRadius: { '2xl': '0.875rem' },
      boxShadow: {
        panel: '0 1px 2px rgba(15, 23, 42, 0.04)',
        floating: '0 18px 50px -18px rgba(15, 23, 42, 0.28)',
      },
    },
  },
  plugins: [],
}
