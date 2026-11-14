// Unit tests for the Whiteboard artifact: the board generator (skill script) and the save session.
// Run: bunx vitest run --config src/components/artifacts/whiteboard/vitest.config.ts
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: here,
  resolve: { alias: { "@": path.resolve(here, "../../..") } },
  server: { fs: { allow: [path.resolve(here, "../../../..")] } },
  test: {
    include: ["__tests__/**/*.test.ts"],
    environment: "node",
  },
});
