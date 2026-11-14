// Unit tests for the search window's matching and ranking (src/lib/search.ts).
// Run: bunx vitest run --config src/lib/search.vitest.config.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  cacheDir: path.resolve(here, "../../node_modules/.vite/search-tests"),
  resolve: { alias: { "@": path.resolve(here, "..") } },
  test: {
    include: ["__tests__/search.test.ts"],
    environment: "node",
  },
});
