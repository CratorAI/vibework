// Unit tests for message Markdown (tables while streaming, numeric columns).
// Run: bunx vitest run --config src/components/blocks/vitest.config.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  cacheDir: path.resolve(here, "../../../node_modules/.vite/blocks-tests"),
  resolve: { alias: { "@": path.resolve(here, "../..") } },
  test: {
    include: ["__tests__/*.test.ts?(x)"],
    environment: "node",
  },
});
