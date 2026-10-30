/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
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
