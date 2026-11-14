// Unit tests for the Slides artifact (parsing, write-back, rendering, export).
// Run: bunx vitest run --config src/components/artifacts/slides/vitest.config.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  // Keep Vite's cache out of the source tree.
  cacheDir: path.resolve(here, "../../../../node_modules/.vite/slides-tests"),
  resolve: { alias: { "@": path.resolve(here, "../../..") } },
  test: {
    include: ["__tests__/**/*.test.ts"],
    environment: "node",
  },
});
