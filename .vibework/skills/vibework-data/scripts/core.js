// @bun
// src/components/artifacts/data/core.ts
var kinds = ["metric", "bar", "hbar", "stacked", "line", "area", "pie", "donut", "sparkline", "table", "note", "status"];
function parse(source) {
  const d = { title: "Untitled dashboard", titleLine: -1, subtitle: "", period: "", blocks: [], errors: [] };
  let section = "", block;
  source.split(/\r?\n/).forEach((line, i) => {
    if (line.startsWith("# ")) {
      d.title = line.slice(2);
      d.titleLine = i;
    } else if (line.startsWith("## ")) {
      section = line.slice(3);
      block = undefined;
    } else if (line.startsWith("### ")) {
      const m = /^### (\w+): (.+)$/.exec(line);
      block = { kind: m?.[1] || "note", title: m?.[2] || line.slice(4), section, options: {}, rows: [], line: i };
      if (!m || !kinds.includes(block.kind))
        block.error = "Unknown block kind. Use kind: Title.";
      d.blocks.push(block);
    } else if (line.startsWith("|") && block) {
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((v) => v.trim());
      if (!cells.every((c) => /^:?-+:?$/.test(c)))
        block.rows.push(cells);
    } else if (line.trim()) {
      const m = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
      if (m) {
        const key = m[1].toLowerCase();
        if (block)
          block.options[key] = m[2];
        else if (key === "period" || key === "subtitle")
          d[key] = m[2];
        else
          d.errors.push(`Line ${i + 1}: unknown page field`);
      } else
        d.errors.push(`Line ${i + 1}: expected a heading, field or table`);
    }
  });
  if (d.titleLine < 0)
    d.errors.push("Add a # Dashboard title");
  if (!d.blocks.length)
    d.errors.push("Add at least one block");
  d.blocks.forEach((b) => {
    if (b.options.data && b.rows.length)
      b.error = "Use inline data or a data reference, not both.";
    if (b.kind === "note" && !b.options.text)
      b.error = "Add text: to this note.";
    if (b.kind !== "note" && !b.options.data && b.rows.length < 2)
      b.error = "Add a table with a header and at least one row.";
    if (b.rows.some((r) => r.length !== b.rows[0].length))
      b.error = "Table rows must have the same number of columns.";
    if (b.options.data) {
      try {
        reference(b.options.data);
      } catch (e) {
        b.error = e.message;
      }
    }
    if (!b.options.data && b.kind !== "note" && b.kind !== "table" && b.kind !== "status") {
      const rows = b.rows.slice(1);
      if (rows.some((r) => r.length < 2 || (b.kind === "metric" ? [r[1]] : r.slice(1)).some((v) => number(v) === null)))
        b.error = "Every value must be numeric; state units in the block fields.";
    }
    if (b.kind === "status" && b.rows.slice(1).some((r) => !["on track", "at risk", "off track"].includes(r[1])))
      b.error = "State must be on track, at risk or off track.";
    if (b.error)
      d.errors.push(`${b.title}: ${b.error}`);
  });
  return d;
}
function number(raw) {
  const s = raw.trim().replace(/[$\u00A3\u20AC\u20B9,%\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s))
    return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
function format(n, style = "number") {
  const currency = /^[A-Z]{3}$/.test(style);
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: style === "integer" ? 0 : 2, ...style === "compact" ? { notation: "compact" } : {}, ...currency ? { style: "currency", currency: style } : {} }).format(n) + (style === "percent" ? "%" : "");
}
function reference(value) {
  const m = /^([^#]+\.(?:csv|xlsx))(?:#(.+)!([A-Z]+)(\d+):([A-Z]+)(\d+))?$/i.exec(value);
  if (!m || m[1].startsWith("/") || m[1].split(/[\\/]/).includes("..") || m[1].includes(":"))
    throw Error("Use a working-folder relative CSV or workbook.xlsx#Sheet!A1:D13 reference.");
  if (m[1].toLowerCase().endsWith(".xlsx") && !m[2])
    throw Error("An XLSX source needs a sheet and range.");
  const col = (s) => [...s.toUpperCase()].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const r1 = Number(m[4] || 1), r2 = Number(m[6] || 1), c1 = col(m[3] || "A"), c2 = col(m[5] || "A");
  if (r1 < 1 || r2 < r1 || c2 < c1 || r2 > 1048576 || c2 > 16384 || (r2 - r1 + 1) * (c2 - c1 + 1) > 1e4)
    throw Error("Invalid range or more than 10,000 cells.");
  return { path: m[1], sheet: m[2]?.replace(/^'(.*)'$/, "$1"), r1, r2, c1, c2 };
}
function editLine(source, line, value) {
  const eol = source.includes(`\r
`) ? `\r
` : `
`;
  const lines = source.split(/\r?\n/);
  if (line < 0 || line >= lines.length)
    return source;
  lines[line] = value.replace(/[\r\n]+/g, " ");
  return lines.join(eol);
}
function editNote(source, block, text) {
  const lines = source.split(/\r?\n/);
  let i = block.line + 1;
  for (;i < lines.length && !lines[i].startsWith("#"); i++)
    if (/^text:/i.test(lines[i]))
      return editLine(source, i, `text: ${text}`);
  return source;
}
export {
  reference,
  parse,
  number,
  kinds,
  format,
  editNote,
  editLine
};
