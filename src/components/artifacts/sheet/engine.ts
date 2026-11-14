/**
 * The IronCalc engine (Rust compiled to WebAssembly, with xlsx import/export)
 * and the widget's translations, initialised once per app run.
 */

import { init } from "./vendor/ironcalc-workbook/ironcalc.js";

let ready: Promise<void> | null = null;

export function loadEngine(): Promise<void> {
  if (!ready) {
    ready = init().catch((err: unknown) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}
