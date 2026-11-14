/**
 * Map the app's colour tokens (src/index.css) onto IronCalc's theme variables.
 *
 * IronCalc paints the grid on a canvas and reads its colours with
 * getComputedStyle, so every value handed to it must be a concrete colour a
 * canvas understands. Our tokens are hex and oklch (some translucent), and the
 * shades we derive are mixes, so resolve everything to sRGB here instead of
 * passing `var(--token)` or `color-mix()` strings through.
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

function parseNumber(token: string, percentScale = 1): number {
  const t = token.trim();
  if (t.endsWith("%")) return (parseFloat(t) / 100) * percentScale;
  return parseFloat(t);
}

/** oklch → linear sRGB → gamma sRGB (CSS Color 4 reference matrices). */
function oklchToRgb(l: number, c: number, hDeg: number): [number, number, number] {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const L = l_ ** 3;
  const M = m_ ** 3;
  const S = s_ ** 3;
  const lin = [
    4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S,
    -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S,
    -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S,
  ];
  const gamma = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
  return lin.map((x) => clamp01(gamma(x)) * 255) as [number, number, number];
}

/** Parse the colour syntaxes used in index.css: #hex, rgb()/rgba(), oklch(). Returns null for anything else. */
export function parseColor(input: string): Rgba | null {
  const s = input.trim().toLowerCase();
  if (s.startsWith("#")) {
    let hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((ch) => ch + ch).join("");
    if (hex.length !== 6 && hex.length !== 8) return null;
    const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^(rgba?|oklch)\((.*)\)$/.exec(s);
  if (!fn) return null;
  const [body, alphaPart] = fn[2].split("/");
  const parts = body.replace(/,/g, " ").trim().split(/\s+/);
  const alpha = alphaPart === undefined ? (parts.length === 4 ? parseNumber(parts[3]) : 1) : parseNumber(alphaPart);
  if (fn[1] === "oklch") {
    if (parts.length < 3) return null;
    const [r, g, b] = oklchToRgb(parseNumber(parts[0]), parseNumber(parts[1], 0.4), parseFloat(parts[2]) || 0);
    return { r, g, b, a: clamp01(alpha) };
  }
  if (parts.length < 3) return null;
  const ch = (t: string) => (t.endsWith("%") ? parseNumber(t, 255) : parseFloat(t));
  return { r: ch(parts[0]), g: ch(parts[1]), b: ch(parts[2]), a: clamp01(alpha) };
}

/** `top` painted over an opaque `bottom`. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}

/** `weight` of `a` mixed into `b` (sRGB, like color-mix(in srgb, a w%, b)). */
export function mix(a: Rgba, b: Rgba, weight: number): Rgba {
  const w = clamp01(weight);
  return {
    r: a.r * w + b.r * (1 - w),
    g: a.g * w + b.g * (1 - w),
    b: a.b * w + b.b * (1 - w),
    a: a.a * w + b.a * (1 - w),
  };
}

export function toCss(c: Rgba): string {
  const h = (x: number) => Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0");
  const base = `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  return c.a >= 0.999 ? base : `${base}${h(c.a * 255)}`;
}

/** Same stack as --font-sans in src/index.css (the @theme inline values are not exposed as custom properties). */
const SANS = '"Mona Sans Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

/**
 * Build IronCalc's variables from the tokens currently applied to `el`
 * (light or dark, whichever is active). `read` is injectable for tests.
 */
export function ironCalcThemeFromTokens(
  read: (token: string) => string = (token) => getComputedStyle(document.documentElement).getPropertyValue(token),
): Record<string, string> {
  const fallback: Record<string, string> = {
    "--background": "#fcfcfb",
    "--foreground": "#1a1a1a",
    "--popover": "#ffffff",
    "--muted": "#f5f5f5",
    "--muted-foreground": "#737373",
    "--border": "#e5e5e5",
    "--border-strong": "#c7c7c7",
    "--input": "#e5e5e5",
    "--primary": "#f9693c",
    "--primary-foreground": "#fafafa",
    "--info": "#2f80ed",
    "--destructive": "#e7000b",
    "--warning": "#f2c94c",
    "--success": "#27ae60",
    "--selected": "#007aff",
  };
  const token = (name: string): Rgba => parseColor(read(name)) ?? parseColor(fallback[name])!;
  const bg = { ...token("--background"), a: 1 };
  const solid = (name: string) => over(token(name), bg);
  const fg = solid("--foreground");
  const shade = (w: number) => toCss(mix(fg, bg, w));
  const primary = solid("--primary");
  const border = solid("--border");
  const surface = solid("--popover");
  const muted = solid("--muted");
  const css = (c: Rgba) => toCss(c);

  return {
    "--typography-font-family": SANS,
    "--typography-font-size": "13px",
    "--palette-common-black": css(fg),
    "--palette-common-white": css(bg),
    "--palette-primary-main": css(primary),
    "--palette-primary-light": toCss(mix(primary, bg, 0.75)),
    "--palette-primary-dark": toCss(mix(primary, fg, 0.85)),
    "--palette-primary-contrast-text": css(solid("--primary-foreground")),
    "--palette-secondary-main": css(solid("--info")),
    "--palette-secondary-light": toCss(mix(solid("--info"), bg, 0.75)),
    "--palette-secondary-dark": toCss(mix(solid("--info"), fg, 0.85)),
    "--palette-secondary-contrast-text": css(bg),
    "--palette-error-main": css(solid("--destructive")),
    "--palette-error-light": toCss(mix(solid("--destructive"), bg, 0.75)),
    "--palette-error-dark": toCss(mix(solid("--destructive"), fg, 0.85)),
    "--palette-error-contrast-text": css(bg),
    "--palette-warning-main": css(solid("--warning")),
    "--palette-warning-light": toCss(mix(solid("--warning"), bg, 0.75)),
    "--palette-warning-dark": toCss(mix(solid("--warning"), fg, 0.85)),
    "--palette-warning-contrast-text": css(fg),
    "--palette-info-main": css(solid("--muted-foreground")),
    "--palette-info-light": shade(0.25),
    "--palette-info-dark": shade(0.7),
    "--palette-info-contrast-text": css(bg),
    "--palette-success-main": css(solid("--success")),
    "--palette-success-light": toCss(mix(solid("--success"), bg, 0.75)),
    "--palette-success-dark": toCss(mix(solid("--success"), fg, 0.85)),
    "--palette-success-contrast-text": css(bg),
    "--palette-grey-50": shade(0.03),
    "--palette-grey-100": shade(0.05),
    "--palette-grey-200": shade(0.08),
    "--palette-grey-300": shade(0.13),
    "--palette-grey-400": shade(0.27),
    "--palette-grey-500": shade(0.42),
    "--palette-grey-600": shade(0.55),
    "--palette-grey-700": shade(0.65),
    "--palette-grey-800": shade(0.78),
    "--palette-grey-900": shade(0.88),
    "--palette-grey-a100": shade(0.05),
    "--palette-grey-a200": shade(0.08),
    "--palette-grey-a400": shade(0.27),
    "--palette-grey-a700": shade(0.65),
    "--palette-surface-elevated": css(surface),
    "--palette-surface-elevated-border": css(border),
    "--palette-input-background": css(bg),
    "--palette-input-border": css(solid("--input")),
    "--palette-sheet-header-corner-background": css(muted),
    "--palette-sheet-header-text-color": css(solid("--muted-foreground")),
    "--palette-sheet-header-background": css(muted),
    "--palette-sheet-header-global-selector-color": toCss(mix(primary, muted, 0.12)),
    "--palette-sheet-header-selected-background": toCss(mix(primary, muted, 0.14)),
    "--palette-sheet-header-full-selected-background": toCss(mix(primary, muted, 0.3)),
    "--palette-sheet-header-selected-color": css(fg),
    "--palette-sheet-header-border-color": css(border),
    "--palette-sheet-grid-color": css(border),
    "--palette-sheet-grid-separator-color": css(solid("--border-strong")),
    "--palette-sheet-default-text-color": css(fg),
    "--palette-sheet-outline-color": css(primary),
    "--palette-sheet-outline-editing-color": toCss(mix(primary, bg, 0.35)),
    "--palette-sheet-outline-background-color": toCss({ ...primary, a: 0.1 }),
    "--palette-sheet-default-cell-font-family": SANS,
    "--palette-sheet-header-font": `500 11px ${SANS}`,
    "--palette-sheet-cell-array-structure-color": css(solid("--info")),
    "--shadow-sm": `0 1px 3px 0 ${toCss({ ...fg, a: 0.1 })}`,
    "--shadow-md": `0 2px 6px ${toCss({ ...fg, a: 0.12 })}, 0 8px 24px ${toCss({ ...fg, a: 0.12 })}`,
    "scrollbar-color": `${shade(0.27)} ${css(bg)}`,
  };
}

function luminance(c: Rgba): number {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Below this, text on our dark background is unreadable (WCAG's minimum for large text is 3). */
const MIN_DARK_CONTRAST = 2.5;

interface StyleLike {
  fill: { color?: unknown };
  font: { color?: unknown };
  border: object;
}

/** Colours replaced by `readableInDark`, so the originals can be put back. */
export interface ReplacedColors {
  font?: unknown;
  borders: Record<string, unknown>;
}

/**
 * Workbooks are authored for a white page: nearly every file's default text
 * colour is the theme's "dark 1" (black). In dark mode, text and borders on
 * cells without a fill that would be unreadable against our background are
 * drawn in the default text colour instead. Mutates `style` (a display copy
 * the engine returned) and returns what it replaced, or null. Cells with a
 * fill keep their colours (they paint their own background).
 */
export function readableInDark(
  style: StyleLike,
  resolve: (color: unknown) => string,
  background: Rgba,
  foreground: string,
): ReplacedColors | null {
  if (style.fill?.color) return null;
  const unreadable = (color: unknown) => {
    if (color === undefined || color === null || color === "") return false;
    const rgb = parseColor(resolve(color));
    return !!rgb && contrastRatio(over(rgb, background), background) < MIN_DARK_CONTRAST;
  };
  let replaced: ReplacedColors | null = null;
  if (unreadable(style.font?.color)) {
    replaced = { font: style.font.color, borders: {} };
    style.font.color = foreground;
  }
  for (const side of ["left", "right", "top", "bottom", "diagonal"]) {
    const item = (style.border as Record<string, { color?: unknown } | undefined> | undefined)?.[side];
    if (item && unreadable(item.color)) {
      replaced ??= { borders: {} };
      replaced.borders[side] = item.color;
      item.color = foreground;
    }
  }
  return replaced;
}
