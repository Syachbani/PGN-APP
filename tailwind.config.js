// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    // Tambahkan path ini:
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}", 
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}