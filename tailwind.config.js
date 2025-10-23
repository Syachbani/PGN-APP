// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/app.jsx.{js,ts,jsx,tsx}", // PASTIKAN BARIS INI ADA
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}