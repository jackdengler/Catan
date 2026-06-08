import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the build works under a GitHub Pages subpath
  // (e.g. https://user.github.io/catan/) as well as at the root.
  base: "./",
  server: {
    port: 5173,
    host: true, // expose on LAN so phones can connect
  },
  build: {
    outDir: "dist",
  },
});
