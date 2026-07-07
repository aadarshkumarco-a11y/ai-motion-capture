/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: { extend: {
    colors: { bg: "#0a0a0f", surface: "#13131f", accent: "#7c3aed", cyan: "#06b6d4" },
    fontFamily: { sans: ["system-ui", "-apple-system", "sans-serif"] },
  }},
  plugins: [],
};
