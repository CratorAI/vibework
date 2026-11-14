#!/usr/bin/env bun
// Large and many-file fixtures for the performance harness, written under
// <out>/work (default /tmp/vibework-perf/work). Deterministic; safe to rerun.
//   bun scripts/perf/fixtures.mjs [/tmp/vibework-perf]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";

const OUT = process.argv[2] || "/tmp/vibework-perf";
const WORK = `${OUT}/work`;
const BIG = `${WORK}/big`;
const MANY = `${WORK}/many`;
fs.mkdirSync(BIG, { recursive: true });
fs.mkdirSync(MANY, { recursive: true });

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const WORDS = "the quarterly revenue forecast for each region shows supplier invoice margin churn cohort pipeline renewal contract headcount budget variance roadmap launch pricing tier retention inventory shipment warehouse audit compliance summary".split(" ");
const words = (n) => Array.from({ length: n }, () => WORDS[Math.floor(rnd() * WORDS.length)]).join(" ");
const sentence = (n = 18) => { const s = words(n); return s[0].toUpperCase() + s.slice(1) + "."; };

// 1. A 200-page markdown document (~500 words a page) and the same as .docx.
{
  const parts = ["# Annual operations review\n"];
  for (let ch = 1; ch <= 40; ch++) {
    parts.push(`\n## ${ch}. ${sentence(5).slice(0, -1)}\n`);
    for (let p = 0; p < 12; p++) parts.push(`\n${Array.from({ length: 5 }, () => sentence()).join(" ")}\n`);
    parts.push(`\n| Region | Revenue | Change |\n|---|---:|---:|\n${Array.from({ length: 6 }, () => `| ${words(1)} | ${Math.floor(rnd() * 99999)} | ${Math.floor(rnd() * 40)}% |`).join("\n")}\n`);
    parts.push(`\n- ${sentence(10)}\n- ${sentence(10)}\n- ${sentence(10)}\n`);
  }
  const md = parts.join("");
  fs.writeFileSync(`${BIG}/review-200p.md`, md);

  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const paras = md.split("\n").filter((l) => l.trim() && !l.startsWith("|")).map((l) => {
    const h = l.startsWith("## ") ? "Heading2" : l.startsWith("# ") ? "Heading1" : null;
    const text = esc(l.replace(/^#+ |^- /, ""));
    return `<w:p>${h ? `<w:pPr><w:pStyle w:val="${h}"/></w:pPr>` : ""}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
  });
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras.join("")}</w:body></w:document>`);
  fs.writeFileSync(`${BIG}/review-200p.docx`, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

// 2. A 50-slide deck: vibework slides markdown and a .pptx.
{
  const slides = [];
  for (let i = 1; i <= 50; i++) {
    slides.push(`# ${sentence(4).slice(0, -1)}\n\n- ${sentence(8)}\n- ${sentence(8)}\n- ${sentence(8)}\n- ${sentence(8)}`);
  }
  fs.writeFileSync(`${BIG}/deck-50.slides.md`, slides.join("\n\n---\n\n") + "\n");
  const pptx = new PptxGenJS();
  for (let i = 1; i <= 50; i++) {
    const s = pptx.addSlide();
    s.addText(`Slide ${i}: ${sentence(4)}`, { x: 0.5, y: 0.4, w: 9, h: 0.8, fontSize: 28, bold: true });
    s.addText(Array.from({ length: 4 }, () => ({ text: sentence(9), options: { bullet: true } })), { x: 0.6, y: 1.4, w: 8.8, h: 3.4, fontSize: 18 });
    if (i % 5 === 0) s.addShape(pptx.ShapeType.rect, { x: 7, y: 4.2, w: 2, h: 1, fill: { color: "4477AA" } });
  }
  fs.writeFileSync(`${BIG}/deck-50.pptx`, Buffer.from(await pptx.write({ outputType: "arraybuffer" })));
}

// 3. A 20,000-row sheet (.xlsx and .csv).
{
  const header = ["Order", "Date", "Region", "Product", "Units", "Price", "Revenue", "Margin", "Rep", "Status"];
  const rows = [header];
  for (let r = 1; r <= 20000; r++) {
    const units = Math.floor(rnd() * 500), price = +(rnd() * 200).toFixed(2);
    rows.push([10000 + r, `2026-${String(1 + (r % 12)).padStart(2, "0")}-${String(1 + (r % 28)).padStart(2, "0")}`, words(1), words(2), units, price, +(units * price).toFixed(2), +(rnd()).toFixed(3), words(1), r % 7 ? "shipped" : "open"]);
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Orders");
  fs.writeFileSync(`${BIG}/orders-20k.xlsx`, XLSX.write(wb, { type: "buffer", bookType: "xlsx", compression: true }));
  fs.writeFileSync(`${BIG}/orders-20k.csv`, rows.map((r) => r.join(",")).join("\n") + "\n");
}

// 4. A large PDF: 300 text pages (a minimal hand-written PDF).
{
  const pages = 300;
  const objs = [];
  const add = (s) => { objs.push(s); return objs.length; };
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];
  const pagesId = pages * 2 + 2; // font, then (content, page) per page
  for (let p = 0; p < pages; p++) {
    let stream = "BT /F1 11 Tf 56 780 Td 14 TL\n";
    stream += `(Page ${p + 1}: ${sentence(6)}) Tj T*\n`;
    for (let l = 0; l < 48; l++) stream += `(${sentence(12).replace(/[()\\]/g, "")}) Tj T*\n`;
    stream += "ET";
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    pageIds.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  const realPages = add(`<< /Type /Pages /Kids [${pageIds.map((i) => `${i} 0 R`).join(" ")}] /Count ${pages} >>`);
  if (realPages !== pagesId) throw new Error(`pages id ${realPages} != ${pagesId}`);
  const catalog = add(`<< /Type /Catalog /Pages ${realPages} 0 R >>`);
  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("")}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(`${BIG}/report-300p.pdf`, pdf, "latin1");
}

// 5. A big image (8000×6000) made from the app icon with sips.
{
  const icon = path.resolve(new URL("../../src-tauri/icons/icon.png", import.meta.url).pathname);
  execFileSync("sips", ["-z", "6000", "8000", icon, "--out", `${BIG}/big-8000x6000.png`], { stdio: "ignore" });
}

// 6. The 1,000×100 legacy .xls limit fixture and the 300-element design, when present.
for (const [from, to] of [["/tmp/vibework-daily/work/legacy.xls", "legacy-large.xls"], ["/tmp/vibework-design/fixtures/performance.design.html", "elements-300.design.html"]]) {
  if (fs.existsSync(from)) fs.copyFileSync(from, `${BIG}/${to}`);
}

// 7. 320 gallery files of mixed types (copies of small real documents, plus images).
{
  const seeds = ["/tmp/vibework-daily/work/sample.docx", "/tmp/vibework-daily/work/budget.xlsx", "/tmp/vibework-daily/work/cafe-loyalty.pptx", "/tmp/vibework-daily/work/demo.pdf", "/tmp/vibework-daily/work/cafe-loyalty.slides.md", "/tmp/vibework-daily/work/coffee-order.excalidraw", "/tmp/vibework-design/fixtures/poster.design.html"].filter((f) => fs.existsSync(f));
  const icon = path.resolve(new URL("../../src-tauri/icons/128x128@2x.png", import.meta.url).pathname);
  let n = 0;
  for (let i = 0; i < 320; i++) {
    const kind = i % (seeds.length + 3);
    let name;
    if (kind < seeds.length) {
      const src = seeds[kind];
      const base = path.basename(src);
      const dot = base.indexOf(".");
      name = `${base.slice(0, dot)}-${i}${base.slice(dot)}`;
      fs.copyFileSync(src, `${MANY}/${name}`);
    } else if (kind === seeds.length) {
      name = `notes-${i}.md`;
      fs.writeFileSync(`${MANY}/${name}`, `# Notes ${i}\n\n${sentence(30)}\n\n- ${sentence()}\n- ${sentence()}\n`);
    } else if (kind === seeds.length + 1) {
      name = `table-${i}.csv`;
      fs.writeFileSync(`${MANY}/${name}`, "a,b,c\n" + Array.from({ length: 40 }, (_, r) => `${r},${words(1)},${Math.floor(rnd() * 100)}`).join("\n"));
    } else {
      name = `image-${i}.png`;
      fs.copyFileSync(icon, `${MANY}/${name}`);
    }
    n++;
  }
  console.log(`wrote ${n} gallery files to ${MANY}`);
}
console.log(fs.readdirSync(BIG).map((f) => `${f} ${(fs.statSync(`${BIG}/${f}`).size / 1048576).toFixed(1)} MB`).join("\n"));
