import { defineConfig } from "vitest/config";

// Only run the TypeScript sources under src — not the tsc-compiled copies that
// `tsc -b` emits into dist-tsc.
export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
