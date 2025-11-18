/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'site-primary': {
          50: '#e9ebf0', // Cor de fundo suave
          500: '#1d416b', // Cor de acento média
          600: '#1d3b5b', // Cor de acento
          700: '#163351', // Cor de acento mais escura
          900: '#10283E', // Cor principal (solicitada)
        },
      },
    },
  },
  plugins: [],
}