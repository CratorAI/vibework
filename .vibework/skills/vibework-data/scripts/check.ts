import { parse, reference } from "./core.js";
import { resolve } from "node:path";
const path = process.argv.slice(2).find((a) => a !== "--check");
if (!path) {
  console.error("Usage: bun check.ts file.dashboard.md --check");
  process.exit(1);
}
const d = parse(await Bun.file(path).text());
const errors = [...d.errors];
for (const b of d.blocks) {
  if (!b.options.source) errors.push(`${b.title}: missing Source:`);
  if (b.options.data)
    try {
      const r = reference(b.options.data);
      if (!(await Bun.file(resolve(process.cwd(), r.path)).exists()))
        throw Error(`Unresolved source: ${r.path}`);
    } catch (e) {
      errors.push(`${b.title}: ${e.message}`);
    }
}
for (const e of errors) console.error(e);
console.log(`${d.blocks.length} blocks; ${errors.length} issues`);
process.exitCode = errors.length ? 1 : 0;
