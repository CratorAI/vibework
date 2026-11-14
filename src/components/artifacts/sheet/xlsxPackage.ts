/**
 * Looks inside an .xlsx package (a zip of XML parts) without the engine:
 *
 * - `findUnsupportedContent` lists what the editor would drop if it saved
 *   the workbook, so it can be opened read-only instead.
 * - `repairForImport` works around package quirks the engine rejects.
 * - `finishExport` fixes up the engine's output before it is written.
 *
 * Only the parts of each worksheet outside <sheetData> are decoded, so large
 * sheets stay cheap to inspect.
 */

import { strFromU8, strToU8, unzipSync, zipSync, type Unzipped } from "fflate";

const decoder = new TextDecoder();

/** Byte offset of `needle` (ASCII) in `hay`, searching forward from `from` or backward when `reverse`. */
function indexOfAscii(hay: Uint8Array, needle: string, from = 0, reverse = false): number {
  const n = needle.length;
  const first = needle.charCodeAt(0);
  const match = (i: number) => {
    for (let k = 1; k < n; k++) if (hay[i + k] !== needle.charCodeAt(k)) return false;
    return true;
  };
  if (reverse) {
    for (let i = Math.min(from, hay.length - n); i >= 0; i--) if (hay[i] === first && match(i)) return i;
  } else {
    for (let i = from; i <= hay.length - n; i++) if (hay[i] === first && match(i)) return i;
  }
  return -1;
}

/** The worksheet XML with the contents of <sheetData> left out. */
function worksheetOutline(xml: Uint8Array): string {
  const start = indexOfAscii(xml, "<sheetData");
  if (start === -1) return decoder.decode(xml);
  const end = indexOfAscii(xml, "</sheetData>", xml.length, true);
  if (end === -1) return decoder.decode(xml.subarray(0, start));
  return decoder.decode(xml.subarray(0, start)) + "<sheetData/>" + decoder.decode(xml.subarray(end + "</sheetData>".length));
}

/** Names of the direct children of the root element. */
function topLevelTags(xml: string): Set<string> {
  const out = new Set<string>();
  let depth = 0;
  for (const m of xml.matchAll(/<(\/?)([A-Za-z_][\w.:-]*)[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    if (closing) {
      depth--;
      continue;
    }
    if (depth === 1) out.add(name);
    if (!selfClosing) depth++;
  }
  return out;
}

/** Children of <worksheet> the editor keeps or can drop harmlessly. */
const WORKSHEET_KNOWN = new Set([
  "sheetPr", "dimension", "sheetViews", "sheetFormatPr", "cols", "sheetData", "sheetCalcPr", "mergeCells",
  "phoneticPr", "conditionalFormatting", "hyperlinks", "printOptions", "pageMargins", "pageSetup",
  "ignoredErrors", "extLst", "headerFooter", "smartTags", "cellWatches", "webPublishItems",
]);

/** Elements whose presence means the editor would lose something the person made. */
const WORKSHEET_LOSSY: Record<string, string> = {
  dataValidations: "data validation (drop-down lists)",
  autoFilter: "filters",
  sortState: "filters",
  sheetProtection: "sheet protection",
  protectedRanges: "sheet protection",
  scenarios: "what-if scenarios",
  dataConsolidate: "data consolidation",
  customSheetViews: "custom views",
  rowBreaks: "page breaks",
  colBreaks: "page breaks",
  drawing: "shapes or drawings",
  legacyDrawing: "comments or notes",
  legacyDrawingHF: "header and footer pictures",
  picture: "a background picture",
  oleObjects: "embedded objects",
  controls: "form controls",
  tableParts: "tables",
};

/** Excel 2010+ extensions stored in <extLst> that the editor does not keep. */
const EXTENSION_LOSSY: Array<[RegExp, string]> = [
  [/<x14:dataValidations\b/, "data validation (drop-down lists)"],
  [/<x14:conditionalFormattings\b/, "conditional formatting that uses Excel 2010 features"],
  [/<x14:sparklineGroups\b/, "sparklines"],
  [/<x14:slicerList\b/, "slicers"],
  [/<x15:timelineRefs\b/, "timelines"],
  [/<x14:protectedRanges\b/, "sheet protection"],
];

const PART_LOSSY: Array<[RegExp, string]> = [
  [/^xl\/charts\//, "charts"],
  [/^xl\/chartsheets\//, "chart sheets"],
  [/^xl\/media\//, "images"],
  [/^xl\/pivotTables\//, "pivot tables"],
  [/^xl\/pivotCache\//, "pivot tables"],
  [/^xl\/tables\//, "tables"],
  [/^xl\/comments[^/]*\.xml$|^xl\/comments\//, "comments or notes"],
  [/^xl\/threadedComments\//, "comments or notes"],
  [/vbaProject\.bin$/, "macros"],
  [/^xl\/externalLinks\//, "links to other workbooks"],
  [/^xl\/slicers\/|^xl\/slicerCaches\//, "slicers"],
  [/^xl\/timelines\/|^xl\/timelineCaches\//, "timelines"],
  [/^xl\/queryTables\/|^xl\/connections\.xml$/, "data connections"],
  [/^xl\/embeddings\/|^xl\/activeX\/|^xl\/ctrlProps\//, "embedded objects or form controls"],
  [/^xl\/macrosheets\/|^xl\/dialogsheets\//, "macro sheets"],
  [/^xl\/model\//, "a data model"],
  [/^xl\/richData\//, "pictures in cells or linked data types"],
];

/** Mixed formatting inside one text cell (rich-text runs with different properties). */
function hasMixedRichText(sharedStrings: string): boolean {
  if (!sharedStrings.includes("<r>") && !sharedStrings.includes("<r ")) return false;
  for (const si of sharedStrings.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const body = si[1];
    if (!body.includes("<r>") && !body.includes("<r ")) continue;
    const props = new Set<string>();
    for (const run of body.matchAll(/<r>([\s\S]*?)<\/r>/g)) {
      const rPr = /<rPr>([\s\S]*?)<\/rPr>/.exec(run[1]);
      props.add(rPr ? rPr[1] : "");
    }
    if (props.size > 1) return true;
  }
  return false;
}

/**
 * Human-readable list of features in the workbook that saving through the
 * editor would lose. Empty when it is safe to edit in place.
 */
export function findUnsupportedContent(bytes: Uint8Array): string[] {
  const reasons = new Set<string>();
  let files: Unzipped;
  // every part's name; only the parts read below are inflated
  const names: string[] = [];
  try {
    files = unzipSync(bytes, {
      filter: (f) => {
        names.push(f.name);
        return (
          f.name === "xl/workbook.xml" ||
          f.name === "xl/sharedStrings.xml" ||
          /^xl\/worksheets\/[^/]+\.xml$/.test(f.name)
        );
      },
    });
  } catch {
    return ["content this editor cannot read"];
  }

  for (const name of names) {
    for (const [re, label] of PART_LOSSY) if (re.test(name)) reasons.add(label);
  }

  const workbook = files["xl/workbook.xml"] ? strFromU8(files["xl/workbook.xml"]) : "";
  if (/<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(workbook)) reasons.add("the 1904 date system");
  if (/<workbookProtection\b[^>]*\b(lockStructure|lockWindows|workbookPassword|workbookHashValue)="/.test(workbook))
    reasons.add("workbook protection");
  if (/<externalReferences\b/.test(workbook)) reasons.add("links to other workbooks");
  if (/<pivotCaches\b/.test(workbook)) reasons.add("pivot tables");
  if (/<customWorkbookViews\b/.test(workbook)) reasons.add("custom views");
  if (/<calcPr\b[^>]*\b(iterate="(1|true)"|calcMode="manual")/.test(workbook)) reasons.add("iterative or manual calculation settings");
  if (/<fileSharing\b[^>]*\b(reservationPassword|hashValue)="/.test(workbook)) reasons.add("a password to modify");

  for (const [name, data] of Object.entries(files)) {
    if (!name.startsWith("xl/worksheets/")) continue;
    const outline = worksheetOutline(data);
    for (const tag of topLevelTags(outline)) {
      const lossy = WORKSHEET_LOSSY[tag];
      if (lossy) reasons.add(lossy);
      else if (!tag.includes(":") && !WORKSHEET_KNOWN.has(tag)) reasons.add(`unsupported content (${tag})`);
    }
    for (const [re, label] of EXTENSION_LOSSY) if (re.test(outline)) reasons.add(label);
    const hf = /<headerFooter\b[^>]*>([\s\S]*?)<\/headerFooter>/.exec(outline);
    if (hf && /<(odd|even|first)(Header|Footer)>[^<]+</.test(hf[1])) reasons.add("page headers and footers");
    // what-if data tables are formulas the editor cannot represent
    if (indexOfAscii(data, 't="dataTable"') !== -1) reasons.add("what-if data tables");
  }

  const shared = files["xl/sharedStrings.xml"];
  if (shared && hasMixedRichText(strFromU8(shared))) reasons.add("text with mixed formatting inside a cell");

  if (reasons.has("charts") || reasons.has("images") || reasons.has("chart sheets")) reasons.delete("shapes or drawings");
  return [...reasons];
}

function relsDir(relsPath: string): string {
  // "xl/worksheets/_rels/sheet1.xml.rels" -> "xl/worksheets/"
  return relsPath.replace(/_rels\/[^/]+\.rels$/, "");
}

function relativeTo(fromDir: string, target: string): string {
  const from = fromDir.split("/").filter(Boolean);
  const to = target.replace(/^\//, "").split("/");
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  return [...from.slice(i).map(() => ".."), ...to.slice(i)].join("/");
}

/**
 * Rewrite the package so the engine can import it. `level` 1 turns absolute
 * relationship targets (written by some generators, e.g. openpyxl's comments)
 * into relative ones; level 2 also drops relationships to parts the editor
 * does not use (comments, drawings, printer settings ...). Only used to show a
 * workbook that is already read-only or failed to open as is.
 */
export function repairForImport(bytes: Uint8Array, level: 1 | 2): Uint8Array {
  const files = unzipSync(bytes);
  const keepTypes = /\/(worksheet|styles|sharedStrings|theme|hyperlink|officeDocument|core-properties|extended-properties|table)$/;
  for (const name of Object.keys(files)) {
    if (!name.endsWith(".rels")) continue;
    let xml = strFromU8(files[name]);
    const dir = relsDir(name);
    xml = xml.replace(/<Relationship\b[^>]*\/>/g, (rel) => {
      const type = /Type="([^"]+)"/.exec(rel)?.[1] ?? "";
      const mode = /TargetMode="External"/.test(rel);
      if (level === 2 && !mode && !keepTypes.test(type)) return "";
      return rel.replace(/Target="(\/[^"]+)"/, (_m, t: string) => (mode ? _m : `Target="${relativeTo(dir, t)}"`));
    });
    files[name] = strToU8(xml);
  }
  if (level === 2) {
    for (const name of Object.keys(files)) {
      if (!/^xl\/worksheets\/[^/]+\.xml$/.test(name)) continue;
      const xml = strFromU8(files[name]);
      files[name] = strToU8(xml.replace(/<(legacyDrawing|drawing|legacyDrawingHF|picture|tableParts)\b[^>]*\/>/g, ""));
    }
  }
  return zipSync(files);
}

/**
 * The engine writes `#N/IMPL` as the cached result of formulas it cannot
 * calculate; that is not an Excel error value. Drop those cached results and
 * ask spreadsheet apps to recalculate on open. Returns the input untouched
 * when there is nothing to fix (the common case).
 */
export function finishExport(bytes: Uint8Array): Uint8Array {
  const marker = "#N/IMPL";
  let any = false;
  const files = unzipSync(bytes);
  for (const [name, data] of Object.entries(files)) {
    if (!/^xl\/worksheets\/[^/]+\.xml$/.test(name)) continue;
    if (indexOfAscii(data, marker) === -1) continue;
    any = true;
    const xml = strFromU8(data).replace(
      /<c\b([^>]*?)\s+t="e"([^>]*)>(<f\b[^>]*>[\s\S]*?<\/f>|<f\b[^>]*\/>)<v>#N\/IMPL!?<\/v><\/c>/g,
      "<c$1$2>$3</c>",
    );
    files[name] = strToU8(xml);
  }
  if (!any) return bytes;
  const wb = files["xl/workbook.xml"];
  if (wb) {
    let xml = strFromU8(wb);
    xml = /<calcPr\b/.test(xml)
      ? xml.replace(/<calcPr\b(?![^>]*fullCalcOnLoad)/, '<calcPr fullCalcOnLoad="1"')
      : xml.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
    files["xl/workbook.xml"] = strToU8(xml);
  }
  return zipSync(files);
}
