import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/ai-motion-capture/",
  server: { port: 5173 },
  build: { target: "esnext", chunkSizeWarningLimit: 1500 },
});
