/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      keyframes: {
        // Light sweeps across the wordmark, then rests: 4 seconds per cycle.
        shimmer: {
          '0%': { backgroundPosition: '200% center' },
          '55%, 100%': { backgroundPosition: '-100% center' },
        },
      },
      animation: {
        shimmer: 'shimmer 4s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}

