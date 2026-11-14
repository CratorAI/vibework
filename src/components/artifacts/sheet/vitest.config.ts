// Unit tests for the Sheet artifact (xlsx/csv round trips, package inspection, theming).
// Run: bunx vitest run --config src/components/artifacts/sheet/vitest.config.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  // keep vitest's cache out of the source tree
  cacheDir: path.resolve(here, "../../../../node_modules/.vite/sheet-tests"),
  resolve: { alias: { "@": path.resolve(here, "../../..") } },
  test: {
    include: ["__tests__/**/*.test.ts"],
    environment: "node",
  },
});
