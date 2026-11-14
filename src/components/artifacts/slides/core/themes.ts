/**
 * Built-in deck themes. One token set drives the HTML renderer (as CSS custom
 * properties) and the PowerPoint exporter (as hex colours and font names).
 * Every theme has a light and a dark surface; layouts pick a default surface
 * (title/section/closing often dark) and a slide can override it.
 */

export type SurfaceName = "light" | "dark";

export interface Surface {
  bg: string;
  ink: string;
  ink2: string;
  ink3: string;
  rule: string;
  accent: string;
  /** Tinted panel (table header band, contained images) */
  panel: string;
  /** Non-highlighted chart marks */
  muted: string;
  /** Categorical chart colours, in fixed order */
  series: string[];
}

export interface Theme {
  id: string;
  label: string;
  description: string;
  fonts: { head: string; body: string; num: string; mono: string };
  /** Fonts that exist on most machines, for PowerPoint */
  pptxFonts: { head: string; body: string };
  head: { weight: number; tracking: string; displayTracking: string };
  num: { weight: number };
  light: Surface;
  dark: Surface;
  /** Default surface per layout when the deck mode is light */
  surfaces: Partial<Record<string, SurfaceName>>;
  /** Default content surface */
  mode: SurfaceName;
}

const SYS_SANS = `-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
const SYS_SERIF = `Georgia, "Times New Roman", serif`;
const SYS_MONO = `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

export const THEMES: Theme[] = [
  {
    id: "ledger",
    label: "Ledger",
    description: "Editorial: serif headlines on warm paper, deep green accent. Board packs, strategy, research.",
    fonts: {
      head: `"Newsreader", ${SYS_SERIF}`,
      body: `"Inter", ${SYS_SANS}`,
      num: `"Newsreader", ${SYS_SERIF}`,
      mono: `"Geist Mono", ${SYS_MONO}`,
    },
    pptxFonts: { head: "Georgia", body: "Arial" },
    head: { weight: 400, tracking: "-0.012em", displayTracking: "-0.022em" },
    num: { weight: 400 },
    light: {
      bg: "#F6F3EC",
      ink: "#1A1A17",
      ink2: "#4B4943",
      ink3: "#86837B",
      rule: "#DCD6CA",
      accent: "#1D5C4D",
      panel: "#EDE8DD",
      muted: "#CFC8BA",
      series: ["#1D5C4D", "#C08A2E", "#5E7F9A", "#A3543D", "#8A8577"],
    },
    dark: {
      bg: "#132420",
      ink: "#F4F0E7",
      ink2: "#C6CCC4",
      ink3: "#8E9B94",
      rule: "#2C433C",
      accent: "#A6CDB8",
      panel: "#1A2E29",
      muted: "#3A524A",
      series: ["#A6CDB8", "#E0B25C", "#93AFC7", "#D88C70", "#B5B0A2"],
    },
    surfaces: { section: "dark", closing: "dark" },
    mode: "light",
  },
  {
    id: "slate",
    label: "Slate",
    description: "Swiss modern: tight sans headlines, white and near-black, cobalt accent. Product, tech, operations.",
    fonts: {
      head: `"Inter Tight", "Inter", ${SYS_SANS}`,
      body: `"Inter", ${SYS_SANS}`,
      num: `"Inter Tight", "Inter", ${SYS_SANS}`,
      mono: `"Geist Mono", ${SYS_MONO}`,
    },
    pptxFonts: { head: "Arial", body: "Arial" },
    head: { weight: 600, tracking: "-0.022em", displayTracking: "-0.035em" },
    num: { weight: 600 },
    light: {
      bg: "#FFFFFF",
      ink: "#0E1116",
      ink2: "#434B57",
      ink3: "#8A919B",
      rule: "#E2E5E9",
      accent: "#2B54D6",
      panel: "#F3F5F8",
      muted: "#CDD3DA",
      series: ["#2B54D6", "#0E9AA0", "#E39B2D", "#6B7685", "#B4508A"],
    },
    dark: {
      bg: "#0E1116",
      ink: "#F3F5F7",
      ink2: "#B4BCC7",
      ink3: "#7C8694",
      rule: "#252C36",
      accent: "#7D9BFF",
      panel: "#161B23",
      muted: "#353D49",
      series: ["#7D9BFF", "#3CC4C9", "#F0B556", "#9AA4B2", "#E07FB5"],
    },
    surfaces: { title: "dark", section: "dark", closing: "dark" },
    mode: "light",
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Dark: graphite ground, crisp grotesk type, amber accent. Keynotes, launches, investor updates.",
    fonts: {
      head: `"Geist", "Inter", ${SYS_SANS}`,
      body: `"Geist", "Inter", ${SYS_SANS}`,
      num: `"Geist", "Inter", ${SYS_SANS}`,
      mono: `"Geist Mono", ${SYS_MONO}`,
    },
    pptxFonts: { head: "Arial", body: "Arial" },
    head: { weight: 600, tracking: "-0.028em", displayTracking: "-0.045em" },
    num: { weight: 500 },
    light: {
      bg: "#EEECE7",
      ink: "#141416",
      ink2: "#4A4A4F",
      ink3: "#86858A",
      rule: "#D6D3CC",
      accent: "#B45F06",
      panel: "#E4E1DA",
      muted: "#C9C6BE",
      series: ["#B45F06", "#3E6E8E", "#3C8C78", "#A04A5A", "#76747A"],
    },
    dark: {
      bg: "#121316",
      ink: "#EEEDEA",
      ink2: "#B2B1AD",
      ink3: "#77767A",
      rule: "#2A2B30",
      accent: "#F2A93B",
      panel: "#1A1B1F",
      muted: "#3A3B41",
      series: ["#F2A93B", "#8FB4D9", "#5FC2A4", "#E2828E", "#A9A7AE"],
    },
    surfaces: { statement: "light" },
    mode: "dark",
  },
];

export const DEFAULT_THEME = "ledger";

export function getTheme(id: string | undefined): Theme {
  const k = (id || "").trim().toLowerCase();
  return THEMES.find((t) => t.id === k) ?? THEMES.find((t) => t.id === DEFAULT_THEME)!;
}

const HEX = /^#(?:[0-9a-fA-F]{3}){1,2}$/;

export function validHex(v: string | undefined): string | null {
  if (!v) return null;
  const t = v.trim();
  if (!HEX.test(t)) return null;
  if (t.length === 4) return "#" + t.slice(1).split("").map((c) => c + c).join("").toUpperCase();
  return t.toUpperCase();
}

function mix(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((k) => parseInt(a.slice(k, k + 2), 16));
  const pb = [1, 3, 5].map((k) => parseInt(b.slice(k, k + 2), 16));
  return "#" + pa.map((x, k) => Math.round(x + (pb[k] - x) * t).toString(16).padStart(2, "0")).join("").toUpperCase();
}

/** Surfaces for a theme, with an optional brand accent from the front matter. */
export function resolveSurfaces(theme: Theme, accent?: string | null): Record<SurfaceName, Surface> {
  const a = validHex(accent ?? undefined);
  if (!a) return { light: theme.light, dark: theme.dark };
  const darkAccent = mix(a, "#FFFFFF", 0.42);
  return {
    light: { ...theme.light, accent: a, series: [a, ...theme.light.series.slice(1)] },
    dark: { ...theme.dark, accent: darkAccent, series: [darkAccent, ...theme.dark.series.slice(1)] },
  };
}

export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400;500&family=Geist:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700&family=Inter:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;1,6..72,400&display=swap";

function surfaceVars(s: Surface): string {
  return [
    `--bg:${s.bg}`,
    `--ink:${s.ink}`,
    `--ink-2:${s.ink2}`,
    `--ink-3:${s.ink3}`,
    `--rule:${s.rule}`,
    `--accent:${s.accent}`,
    `--panel:${s.panel}`,
    `--muted:${s.muted}`,
    ...s.series.map((c, k) => `--s${k + 1}:${c}`),
  ].join(";");
}

/** Per-theme CSS: tokens for both surfaces plus the theme's own touches. */
function themeCss(t: Theme): string {
  const sel = `.deck[data-theme="${t.id}"]`;
  return `
${sel}{--f-head:${t.fonts.head};--f-body:${t.fonts.body};--f-num:${t.fonts.num};--f-mono:${t.fonts.mono};--hw:${t.head.weight};--ht:${t.head.tracking};--htd:${t.head.displayTracking};--nw:${t.num.weight}}
${sel} .s-light{${surfaceVars(t.light)}}
${sel} .s-dark{${surfaceVars(t.dark)}}`;
}

export function deckCss(): string {
  return THEMES.map(themeCss).join("\n") + BASE_CSS + THEME_TOUCHES;
}

/** Brand accent override, applied on the deck element (value already validated). */
export function accentCss(accent: string | null): string {
  const a = validHex(accent ?? undefined);
  if (!a) return "";
  return `.deck .s-light{--accent:${a};--s1:${a}} .deck .s-dark{--accent:${mix(a, "#FFFFFF", 0.42)};--s1:${mix(a, "#FFFFFF", 0.42)}}`;
}

/* Layout CSS, shared by all themes. Slides are 1920×1080 CSS pixels. */
const BASE_CSS = `
.slide{--mx:128px;--mt:100px;--mb:132px;position:relative;width:1920px;height:1080px;overflow:hidden;background:var(--bg);color:var(--ink);font-family:var(--f-body);font-size:32px;line-height:1.4;font-feature-settings:"kern","liga";-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;font-kerning:normal}
.slide *{box-sizing:border-box;margin:0;padding:0}
.slide .pad{position:absolute;top:var(--mt);bottom:var(--mb);left:var(--mx);right:var(--mx);display:flex;flex-direction:column;min-height:0}
.slide strong{font-weight:600;color:var(--ink)}
.slide em{font-style:italic}
.slide mark{background:none;color:var(--accent)}
.slide code{font-family:var(--f-mono);font-size:.86em;letter-spacing:0}
.slide .link{text-decoration:underline;text-decoration-thickness:.06em;text-underline-offset:.16em}
.slide .kicker{display:flex;align-items:center;gap:16px;font:600 19px/1 var(--f-body);letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:30px;white-space:nowrap}
.slide .kicker .kn{font-variant-numeric:tabular-nums}
.slide .kicker .ks{color:var(--ink-3)}
.slide .hl{font-family:var(--f-head);font-weight:var(--hw);letter-spacing:var(--ht);line-height:1.08;color:var(--ink);max-width:1540px;text-wrap:balance}
.slide .hl-xl{font-size:76px}.slide .hl-l{font-size:66px}.slide .hl-m{font-size:56px}.slide .hl-s{font-size:48px}
.slide .lede{font-size:30px;line-height:1.45;color:var(--ink-2);max-width:1220px;margin-top:28px;text-wrap:pretty}
.slide .src{margin-top:auto;padding-top:28px;font-size:18px;line-height:1.45;color:var(--ink-3);max-width:1500px}
.slide .src + .src{margin-top:0;padding-top:4px}
.slide .foot{position:absolute;left:var(--mx);right:var(--mx);bottom:54px;display:flex;justify-content:space-between;gap:48px;font-size:17px;line-height:1;color:var(--ink-3);letter-spacing:.02em}
.slide .foot .pg{font-variant-numeric:tabular-nums;margin-left:auto}
.slide p + p{margin-top:18px}

/* title */
.l-title .pad{justify-content:space-between}
.l-title .t-meta{display:flex;justify-content:space-between;gap:48px;padding-top:26px;border-top:2px solid var(--ink);font-size:20px;line-height:1.3;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-2)}
.l-title .t-meta span + span{text-align:right}
.l-title .t-title{font-family:var(--f-head);font-weight:var(--hw);font-size:124px;line-height:1.0;letter-spacing:var(--htd);max-width:1480px;text-wrap:balance}
.l-title .t-title.long{font-size:100px}
.l-title .t-sub{font-size:36px;line-height:1.35;color:var(--ink-2);margin-top:40px;max-width:1180px;text-wrap:pretty}
.l-title.has-media .pad{right:calc(42% + 96px)}
.l-title.has-media .t-title{font-size:96px}
.l-title .media{position:absolute;top:0;right:0;bottom:0;width:42%}

/* section */
.l-section .pad{justify-content:flex-end}
.l-section .sec-no{font-family:var(--f-num);font-weight:var(--nw);font-size:180px;line-height:.9;letter-spacing:-.04em;color:var(--accent);font-variant-numeric:lining-nums tabular-nums;margin-bottom:56px}
.l-section .hl{font-size:100px;letter-spacing:var(--htd);max-width:1420px;line-height:1.02}
.l-section .lede{font-size:32px;margin-top:36px}

/* statement / quote */
.l-statement .pad{justify-content:center}
.l-statement .hl,.l-statement .quote{font-family:var(--f-head);font-weight:var(--hw);font-size:84px;line-height:1.1;letter-spacing:var(--htd);max-width:1480px;text-wrap:balance;color:var(--ink)}
.l-statement .hl.long,.l-statement .quote.long{font-size:64px;line-height:1.14}
.l-statement .quote{position:relative;text-indent:-.42em}
.l-statement .quote .qm{color:var(--accent)}
.l-statement .attr{margin-top:56px;font-size:21px;letter-spacing:.12em;text-transform:uppercase;color:var(--ink-3)}
.l-statement .attr::before{content:"";display:inline-block;width:48px;height:2px;background:var(--accent);vertical-align:middle;margin-right:20px;position:relative;top:-2px}
.l-statement .lede{font-size:32px;margin-top:44px}

/* bullets */
.slide .list{list-style:none;display:flex;flex-direction:column;max-width:1420px}
.l-bullets .list{margin-top:60px;border-bottom:1.5px solid var(--rule)}
.slide .list li{display:grid;grid-template-columns:76px 1fr;align-items:baseline;padding:26px 0;border-top:1.5px solid var(--rule);font-size:34px;line-height:1.36;color:var(--ink-2);text-wrap:pretty}
.slide .list li .mk{font-family:var(--f-num);font-weight:var(--nw);font-size:24px;line-height:1;color:var(--accent);font-variant-numeric:tabular-nums lining-nums}
.slide .list li .mk.dot{display:block;width:12px;height:12px;background:var(--accent);border-radius:1px;transform:translateY(-7px)}
.slide .list li.sub{border-top:0;padding:0 0 22px 76px;font-size:28px;grid-template-columns:40px 1fr;margin-top:-10px}
.slide .list li.sub .mk.dot{width:8px;height:8px;background:var(--ink-3)}
.slide .list.dense li{font-size:30px;padding:20px 0}
.l-bullets .lede + .list{margin-top:48px}
.l-bullets .list.few{margin-top:72px}
.l-bullets .list.few li{font-size:40px;line-height:1.3;padding:36px 0;grid-template-columns:88px 1fr}
.l-bullets .list.few li .mk{font-size:28px}

/* split: text + image */
.l-split .pad{right:calc(50% + 72px)}
.l-split.media-left .pad{left:calc(50% + 72px);right:var(--mx)}
.l-split .media{position:absolute;top:0;bottom:0;right:0;width:50%}
.l-split.media-left .media{left:0;right:auto}
.l-split .hl{max-width:none}
.l-split .lede{max-width:none;font-size:29px}
.l-split .list{margin-top:44px}
.l-split .list li{font-size:29px;padding:20px 0;grid-template-columns:52px 1fr}
.l-split .foot{right:calc(50% + 72px)}
.l-split.media-left .foot{left:calc(50% + 72px);right:var(--mx)}
.slide .media{background:var(--panel);overflow:hidden}
.slide .media img{display:block;width:100%;height:100%;object-fit:cover}
.slide .media.contain{display:flex;align-items:center;justify-content:center;padding:72px}
.slide .media.contain img{object-fit:contain}
.slide .media .missing{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:20px;color:var(--ink-3);letter-spacing:.04em;text-align:center;padding:40px}

/* full-bleed image */
.l-image .media{position:absolute;inset:0}
.l-image .scrim{position:absolute;left:0;right:0;bottom:0;height:62%;background:linear-gradient(to top,rgba(8,8,8,.78) 0%,rgba(8,8,8,.42) 48%,rgba(8,8,8,0) 100%)}
.l-image .cap{position:absolute;left:var(--mx);right:var(--mx);bottom:104px;color:#F7F6F2}
.l-image .cap .hl{color:#FFFFFF;font-size:68px;max-width:1380px}
.l-image .cap .lede{color:rgba(255,255,255,.84);font-size:28px;margin-top:22px}
.l-image .cap .src{color:rgba(255,255,255,.62);margin-top:28px;padding-top:0}
.l-image .foot{color:rgba(255,255,255,.62)}
.l-image.contain{}
.l-image.contain .scrim{display:none}
.l-image.contain .media{inset:0 0 200px 0}
.l-image.contain .cap{color:var(--ink);bottom:64px}
.l-image.contain .cap .hl{color:var(--ink);font-size:44px}
.l-image.contain .cap .lede{color:var(--ink-2)}

/* stats */
.l-stats .stats{margin-top:auto;display:grid;grid-template-columns:repeat(var(--n),1fr);column-gap:56px}
.l-stats .stat{border-top:2px solid var(--ink);padding-top:34px;min-width:0}
.l-stats .stat .v{font-family:var(--f-num);font-weight:var(--nw);font-size:132px;line-height:.95;letter-spacing:-.035em;color:var(--ink);font-variant-numeric:lining-nums;white-space:nowrap}
.l-stats .stat .lb{margin-top:26px;font-size:27px;line-height:1.38;color:var(--ink-2);max-width:440px;text-wrap:pretty}
.l-stats.n1 .stat .v{font-size:240px}
.l-stats.n1 .stat .lb{font-size:34px;max-width:900px}
.l-stats.n4 .stat .v{font-size:104px}
.l-stats .src{margin-top:40px}

/* chart */
.l-chart .chartbox{flex:1;min-height:0;display:flex;gap:72px;margin-top:44px}
.l-chart .chart{flex:1;min-width:0;min-height:0}
.l-chart .chart svg{display:block;width:100%;height:100%;overflow:visible}
.l-chart .aside{width:440px;flex:none;border-top:2px solid var(--accent);padding-top:26px;font-size:26px;line-height:1.42;color:var(--ink-2)}
.l-chart .aside .list li{font-size:26px;padding:16px 0;grid-template-columns:36px 1fr}
.l-chart .aside .list li:first-child{border-top:0;padding-top:0}
.l-chart .aside .list{border:0}
.l-chart .src{padding-top:24px}
.ch text{font-family:var(--f-body);fill:var(--ink-2)}
.ch .tick{font-size:20px;fill:var(--ink-3);font-variant-numeric:tabular-nums}
.ch .cat{font-size:21px;fill:var(--ink-2)}
.ch .cat.hi{fill:var(--ink);font-weight:600}
.ch .val{font-size:22px;fill:var(--ink);font-weight:500;font-variant-numeric:tabular-nums}
.ch .val.lo{fill:var(--ink-3);font-weight:400}
.ch .unit{font-size:19px;fill:var(--ink-3);letter-spacing:.04em}
.ch .lg{font-size:21px;fill:var(--ink-2)}
.ch .grid{stroke:var(--rule);stroke-width:1.5}
.ch .base{stroke:var(--ink-3);stroke-width:2}
.ch .lead{stroke:var(--ink-3);stroke-width:1.5}
.ch .total{font-size:56px;fill:var(--ink);font-family:var(--f-num);font-weight:var(--nw);letter-spacing:-.02em}
.ch .totl{font-size:19px;fill:var(--ink-3);letter-spacing:.1em;text-transform:uppercase}

/* table */
.l-table .tbl{margin-top:56px;width:100%;border-collapse:collapse;font-size:28px;line-height:1.3}
.l-table .tbl th{font-weight:600;font-size:17px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-3);text-align:left;padding:0 24px 18px 24px;border-bottom:2px solid var(--ink);vertical-align:bottom}
.l-table .tbl td{padding:22px 24px;border-bottom:1.5px solid var(--rule);color:var(--ink-2);vertical-align:top}
.l-table .tbl th:first-child,.l-table .tbl td:first-child{padding-left:0}
.l-table .tbl td:first-child{color:var(--ink);font-weight:500}
.l-table .tbl .num{text-align:right;font-variant-numeric:tabular-nums lining-nums}
.l-table .tbl .ctr{text-align:center}
.l-table .tbl th:last-child,.l-table .tbl td:last-child{padding-right:0}
.l-table .tbl.dense{font-size:22px}
.l-table .tbl.dense td{padding:14px 20px}

/* closing */
.l-closing .pad{justify-content:flex-end}
.l-closing .hl{font-size:110px;line-height:1;letter-spacing:var(--htd);max-width:1400px}
.l-closing .lede{font-size:34px;margin-top:40px}
.l-closing .list{margin-top:56px;border-bottom:1.5px solid var(--rule);max-width:1240px}
.l-closing .list li{font-size:30px;padding:20px 0}
.l-closing .meta{margin-top:48px;font-size:24px;letter-spacing:.01em;color:var(--ink-3)}
.l-closing .meta + .meta{margin-top:8px}

/* editing affordances (stage only) */
.editable [data-f]{outline:2px solid transparent;outline-offset:6px;border-radius:2px;transition:outline-color .12s}
.editable [data-f]:hover{outline-color:color-mix(in srgb,var(--accent) 45%,transparent);cursor:text}
.editable [data-f]:focus{outline-color:var(--accent)}
.editable [data-f][contenteditable]:empty::before{content:"\\200B"}
`;

/* Small per-theme touches beyond tokens */
const THEME_TOUCHES = `
.deck[data-theme="ledger"] .slide .kicker{font-family:var(--f-body);letter-spacing:.16em}
.deck[data-theme="ledger"] .l-statement .quote,.deck[data-theme="ledger"] .l-statement .hl{font-style:normal}
.deck[data-theme="ledger"] .l-stats .stat .v{letter-spacing:-.02em}
.deck[data-theme="ledger"] .l-section .sec-no{font-style:italic;letter-spacing:-.02em}
.deck[data-theme="ledger"] .l-title .t-title{font-weight:400}
.deck[data-theme="slate"] .slide .kicker::before{content:"";width:12px;height:12px;background:var(--accent);flex:none}
.deck[data-theme="slate"] .l-title .t-meta{border-top:0;padding-top:0;color:var(--ink-3)}
.deck[data-theme="slate"] .l-title .t-main::before{content:"";display:block;width:96px;height:10px;background:var(--accent);margin-bottom:56px}
.deck[data-theme="slate"] .l-stats .stat{border-top-width:3px}
.deck[data-theme="slate"] .l-stats .stat:first-child{border-top-color:var(--accent)}
.deck[data-theme="slate"] .l-table .tbl th{border-bottom-width:3px}
.deck[data-theme="graphite"] .slide .kicker{font-family:var(--f-mono);font-weight:500;letter-spacing:.06em;font-size:19px}
.deck[data-theme="graphite"] .l-title .t-meta{font-family:var(--f-mono);letter-spacing:.04em;font-size:19px;border-top-color:var(--rule);color:var(--ink-3)}
.deck[data-theme="graphite"] .l-title .t-title .dot,.deck[data-theme="graphite"] .l-closing .hl .dot{color:var(--accent)}
.deck[data-theme="graphite"] .l-section .sec-no{font-family:var(--f-mono);font-weight:400;font-size:40px;letter-spacing:.02em;margin-bottom:40px}
.deck[data-theme="graphite"] .l-stats .stat{border-top-color:var(--rule)}
.deck[data-theme="graphite"] .l-stats .stat .v{color:var(--ink)}
.deck[data-theme="graphite"] .l-stats .stat:first-child .v{color:var(--accent)}
.deck[data-theme="graphite"] .slide .list li .mk{font-family:var(--f-mono);font-size:21px}
.deck[data-theme="graphite"] .l-table .tbl th{font-family:var(--f-mono);letter-spacing:.04em;text-transform:none;font-size:18px;border-bottom-color:var(--rule)}
.deck[data-theme="graphite"] .l-statement .attr{font-family:var(--f-mono);letter-spacing:.04em;text-transform:none}
`;
