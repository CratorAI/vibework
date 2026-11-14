import { reference, type Dashboard } from "./core";
import { parseCsv } from "../sheet/csv";
import type { ArtifactFile } from "@/tauri/artifacts";
export async function resolve(
  d: Dashboard,
  read: (path: string) => Promise<Pick<ArtifactFile, "text" | "base64">>,
): Promise<Dashboard> {
  const cache = new Map<string, Promise<string[][]>>();
  const blocks = await Promise.all(
    d.blocks.map(async (b) => {
      if (!b.options.data) return b;
      try {
        const ref = reference(b.options.data);
        if (!cache.has(b.options.data))
          cache.set(
            b.options.data,
            (async () => {
              const file = await read(ref.path);
              if (ref.path.toLowerCase().endsWith(".csv")) {
                const rows = parseCsv(file.text ?? "").rows;
                if (
                  rows.length * Math.max(1, ...rows.map((r) => r.length)) >
                  10000
                )
                  throw Error("CSV exceeds 10,000 cells.");
                return rows;
              }
              // Initialise WASM directly: the Sheet UI bundle is not needed here.
              const [{ default: init }, { openDocument }] = await Promise.all([
                import("@ironcalc/wasm-xlsx"),
                import("../sheet/workbook"),
              ]);
              await init();
              const { model } = openDocument(ref.path, file);
              try {
                const sheet = model
                  .getWorksheetsProperties()
                  .findIndex((s) => s.name === ref.sheet);
                if (sheet < 0) throw Error(`Sheet “${ref.sheet}” not found.`);
                const rows: string[][] = [];
                for (let r = ref.r1; r <= ref.r2; r++) {
                  const row: string[] = [];
                  for (let c = ref.c1; c <= ref.c2; c++)
                    row.push(model.getFormattedCellValue(sheet, r, c));
                  rows.push(row);
                }
                return rows;
              } finally {
                model.free();
              }
            })(),
          );
        return { ...b, rows: await cache.get(b.options.data)! };
      } catch (e) {
        return {
          ...b,
          error:
            e instanceof Error
              ? e.message
              : typeof e === "object" && e && "message" in e
                ? String(e.message)
                : String(e),
        };
      }
    }),
  );
  return { ...d, blocks };
}
