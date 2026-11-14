// Unit tests for the Doc artifact (Markdown round-tripping and the save/reload session).
// Run: bunx vitest run --config src/components/artifacts/doc/vitest.config.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  // Keep Vite's cache out of the source tree.
  cacheDir: path.resolve(here, "../../../../node_modules/.vite/doc-tests"),
  resolve: { alias: { "@": path.resolve(here, "../../..") } },
  test: {
    include: ["__tests__/**/*.test.ts"],
    environment: "node",
  },
});
