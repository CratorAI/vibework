import { renderChart, type ChartSpec } from "../slides/core/charts";
import { format, number, type Dashboard, type Block } from "./core";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function content(b: Block): string {
  if (b.error) throw Error(b.error);
  const rows = b.rows.slice(1),
    o = b.options;
  if (b.kind === "note")
    return `<p contenteditable="true" data-note="${b.line}">${esc(o.text || "")}</p>`;
  if (!rows.length) throw Error("No data. Add a header and data rows.");
  if (b.kind === "metric")
    return rows
      .map((r) => {
        const n = number(r[1] || "");
        if (n === null) throw Error(`“${r[1] || ""}” is not numeric.`);
        const change = number(r[2] || "");
        const good =
          change !== null && (o.good === "down" ? change < 0 : change > 0);
        return `<div class="metric"><div class="label">${esc(r[0])}</div><strong>${esc(format(n, o.format))}<small>${esc(o.unit || "")}</small></strong>${change === null ? "" : `<div class="change ${change === 0 ? "" : good ? "good" : "bad"}">${change > 0 ? "↑" : change < 0 ? "↓" : "—"} ${esc(format(Math.abs(change), "percent"))} <span>${esc(o.comparison || "vs prior period")}</span></div>`}</div>`;
      })
      .join("");
  if (b.kind === "status")
    return `<ul>${rows
      .map((r) => {
        if (!["on track", "at risk", "off track"].includes(r[1]))
          throw Error("Status must be on track, at risk or off track.");
        return `<li><span>${esc(r[0])}</span><span class="state ${r[1] === "on track" ? "good" : r[1] === "off track" ? "bad" : "attention"}">${esc(r[1])}</span></li>`;
      })
      .join("")}</ul>`;
  if (b.kind === "table")
    return `<div class="table"><table><thead><tr>${b.rows[0].map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows
      .map(
        (r) =>
          `<tr>${r
            .map((v, i) => {
              const n = number(v);
              const f = (o.formats || "").split(",")[i]?.trim();
              return `<td class="${n === null ? "" : "numeric"} ${o.emphasis === "negative" && n !== null && n < 0 ? "bad" : ""}">${esc(n !== null && f ? format(n, f) : v)}</td>`;
            })
            .join("")}</tr>`,
      )
      .join("")}</tbody></table></div>`;
  const series = b.rows[0].slice(1).map((name, i) => ({
    name,
    values: rows.map((r) => {
      const n = number(r[i + 1] || "");
      if (n === null)
        throw Error(
          `Row “${r[0]}”, ${name}: “${r[i + 1] || ""}” is not numeric.`,
        );
      return n;
    }),
  }));
  if (!series.length)
    throw Error("Charts need a label column and a numeric series.");
  if (rows.length > 24 || series.length > 5)
    throw Error(
      "Use at most 24 categories and 5 series; aggregate the source first.",
    );
  if (
    ["pie", "donut"].includes(b.kind) &&
    (series.length !== 1 ||
      series[0].values.some((v) => v < 0) ||
      series[0].values.reduce((a, v) => a + v, 0) <= 0)
  )
    throw Error("Shares need one non-negative series with a positive total.");
  const spec: ChartSpec = {
    type: b.kind === "sparkline" ? "line" : (b.kind as ChartSpec["type"]),
    categories: rows.map((r) => r[0]),
    series,
    unit: o.unit || "",
    prefix: o.prefix || "",
    suffix: o.suffix || "",
    highlight: o.highlight || null,
    zero: true,
    decimals: Math.max(0, Math.min(2, Number(o.decimals) || 0)),
    warnings: [],
  };
  return `<div class="chart ${b.kind === "sparkline" ? "spark" : ""}">${renderChart(spec, 880, b.kind === "sparkline" ? 220 : 420)}</div><details><summary>Values · scale starts at zero</summary><table>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</table></details>`;
}
export function page(d: Dashboard, dark = false, editable = true): string {
  let section = "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(d.title)}</title><style>
:root{color-scheme:${dark ? "dark" : "light"};--bg:${dark ? "#161c1b" : "#fafbf9"};--fg:${dark ? "#edf1ed" : "#1d2925"};--muted:${dark ? "#a0ada6" : "#65736c"};--line:${dark ? "#33403a" : "#dbe2dc"};--accent:${dark ? "#a9c8b5" : "#315b47"};--s1:var(--accent);--s2:#899c91;--s3:#b1bdb6;--s4:#697b70;--s5:#d0d8d1}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-variant-numeric:tabular-nums}main{max-width:1200px;margin:auto;padding:36px 28px 60px}header{border-bottom:1px solid var(--line);padding-bottom:24px;margin-bottom:28px}.period{font-size:13px;color:var(--muted)}h1{font-size:32px;line-height:1.15;font-weight:550;letter-spacing:-1.1px;margin:12px 0}header p{color:var(--muted);margin:12px 0 0}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px 24px}h2{grid-column:1/-1;font-size:13px;font-weight:500;margin:12px 0 -12px;color:var(--muted)}article{min-width:0;border-bottom:1px solid var(--line);padding-bottom:20px}article:not(.metric-block){grid-column:1/-1}h3{font-size:16px;font-weight:550;line-height:1.35;margin:0 0 16px}.metric-block h3{font-size:12px;color:var(--muted);font-weight:400;margin-bottom:12px}.metric strong{font-size:36px;font-weight:500;letter-spacing:-1.3px;line-height:1.2}.metric small{font-size:13px;font-weight:400;letter-spacing:0;margin-left:5px}.label{font-size:13px;margin:8px 0;color:var(--muted)}.change{font-size:12px;margin-top:12px}.change span{color:var(--muted)}.good{color:${dark ? "#a9c8b5" : "#315b47"}}.bad{color:${dark ? "#efa597" : "#a33728"}}.attention{border-bottom:2px solid #bb9144}.source{font-size:10px;color:var(--muted);margin-top:16px;overflow-wrap:anywhere}p{margin:0;white-space:pre-wrap}.error{color:var(--muted);border-left:2px solid #bb9144;padding:12px}svg.ch{width:100%;height:auto;overflow:visible}svg text{fill:var(--fg);font-family:inherit}.tick,.unit,.cat,.lg{font-size:22px;fill:var(--muted)}.val{font-size:24px}.total{font-size:42px}.totl{font-size:22px}.grid line,.grid path{stroke:var(--line)}svg .grid,svg .base,svg .lead{stroke:var(--line);stroke-width:1;fill:none}.spark .tick,.spark .cat,.spark .unit,.spark .lg{display:none}details{font-size:11px;color:var(--muted);margin-top:8px}table{border-collapse:collapse;width:100%;font-size:12px}th{font-weight:500;color:var(--muted);text-align:left}td,th{padding:10px 8px;border-bottom:1px solid var(--line);white-space:nowrap}.numeric{text-align:right}.table{overflow:auto}ul{padding:0;margin:0;list-style:none}li{display:flex;justify-content:space-between;gap:16px;padding:12px 0;border-bottom:1px solid var(--line)}.state{font-size:12px}[contenteditable]:focus{outline:1px solid var(--accent);outline-offset:4px}@media(min-width:800px){main{padding:44px}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}article:not(.metric-block){grid-column:span 1}article:has(.table){grid-column:1/-1}h1{font-size:40px}}@media(max-width:400px){main{padding:24px 16px}.metric strong{font-size:28px}}
</style></head><body><main><header><div class="period">${esc(d.period)}</div><h1 ${editable ? 'contenteditable="true" data-title' : ""}>${esc(d.title)}</h1><p>${esc(d.subtitle)}</p></header>${d.errors.length ? `<p class="error">${d.errors.map(esc).join("<br>")}</p>` : ""}<div class="grid">${d.blocks
    .map((b) => {
      const heading = b.section !== section ? `<h2>${esc(b.section)}</h2>` : "";
      section = b.section;
      let body;
      try {
        body = content(b);
      } catch (e) {
        body = `<p class="error">${esc((e as Error).message)}</p>`;
      }
      return `${heading}<article class="${b.kind === "metric" ? "metric-block" : ""}"><h3>${esc(b.title)}</h3>${body}<div class="source">Source: ${esc(b.options.source || b.options.data || "Not supplied")}</div></article>`;
    })
    .join("")}</div></main><script>
${editable ? `document.addEventListener('focusin',e=>{if(e.target.isContentEditable)parent.postMessage({type:'data-focus'},'*')});document.addEventListener('focusout',e=>{const t=e.target;if(t.isContentEditable)parent.postMessage({type:'data-edit',title:t.hasAttribute('data-title'),line:Number(t.dataset.note),text:t.innerText},'*')});` : "document.querySelectorAll('[contenteditable]').forEach(e=>e.removeAttribute('contenteditable'));"}
document.querySelectorAll('.chart').forEach(el=>{const title=document.createElementNS('http://www.w3.org/2000/svg','title');title.textContent=Array.from(el.nextElementSibling.querySelectorAll('tr')).map(r=>Array.from(r.children).map(c=>c.textContent).join(' · ')).join('\\n');el.querySelector('svg').prepend(title)});
</script></body></html>`;
}
