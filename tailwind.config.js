/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Tabular figures matter here: columns of money must line up.
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        income: '#16a34a',
        expense: '#dc2626',
        transfer: '#2563eb',
      },
    },
  },
  plugins: [],
};
