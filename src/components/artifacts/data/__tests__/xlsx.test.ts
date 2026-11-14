import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { initSync, Model } from "@ironcalc/wasm-xlsx";
import { it, expect } from "vitest";
import { openDocument, bytesToBase64 } from "../../sheet/workbook";
const require = createRequire(import.meta.url);
it("uses the Sheet import path to calculate formulas without caches", () => {
  initSync({
    module: readFileSync(require.resolve("@ironcalc/wasm-xlsx/wasm_bg.wasm")),
  });
  const m = new Model("Sales", "en", "UTC", "en");
  m.setUserInput(0, 1, 1, "Revenue");
  m.setUserInput(0, 2, 1, "=6200+1800");
  const bytes = m.toXlsx();
  m.free();
  const { model } = openDocument("sales.xlsx", {
    base64: bytesToBase64(bytes),
  });
  expect(model.getFormattedCellValue(0, 2, 1)).toBe("8000");
  model.free();
});
