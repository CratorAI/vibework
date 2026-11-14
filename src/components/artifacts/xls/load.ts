import type { LegacyWorkbook } from "./parse";
/** The gallery uses the same isolated parser as the full preview. */
export function loadLegacyWorkbook(bytes: Uint8Array): Promise<LegacyWorkbook> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./parse.worker.ts", import.meta.url), { type: "module" });
    const finish = () => { clearTimeout(timer); worker.terminate(); };
    const timer = setTimeout(() => { finish(); reject(new Error("Workbook preview timed out.")); }, 15000);
    worker.onmessage = ({ data }) => { finish(); data.error ? reject(new Error(data.error)) : resolve(data.workbook); };
    worker.onerror = () => { finish(); reject(new Error("Could not read this workbook.")); };
    worker.postMessage(bytes);
  });
}
