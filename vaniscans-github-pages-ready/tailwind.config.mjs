/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/**/*.{astro,html,js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        asura: {
          bg: '#0c0d14',
          card: '#121421',
          cardHover: '#181b2c',
          border: '#23273e',
          primary: '#8b5cf6',
          primaryHover: '#7c3aed',
          accent: '#a855f7',
          glow: 'rgba(139, 92, 246, 0.35)',
          textMuted: '#94a3b8'
        }
      },
    },
  },
  plugins: [],
};
