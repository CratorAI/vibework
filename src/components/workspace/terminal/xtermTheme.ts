/**
 * xterm.js theme built from the app's colour tokens (index.css), for light
 * and dark. xterm needs concrete colours, so each token is resolved through a
 * canvas to sRGB hex.
 */

import type { ITheme } from "@xterm/xterm";

let ctx: CanvasRenderingContext2D | null = null;

/** Any CSS colour (hex, oklch(), color-mix…) → #rrggbb or #rrggbbaa */
function toHex(color: string, alpha?: number): string {
  ctx ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx || !color) return color;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "rgba(0,0,0,0)";
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  const outAlpha = alpha !== undefined ? Math.round(alpha * 255) : a;
  return `#${hex(r)}${hex(g)}${hex(b)}${outAlpha < 255 ? hex(outAlpha) : ""}`;
}

export function buildXtermTheme(): ITheme {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const token = (name: string, alpha?: number) => toHex(css.getPropertyValue(name).trim(), alpha);
  const dark = root.classList.contains("dark");

  return {
    background: token("--background"),
    foreground: token("--foreground"),
    cursor: token("--foreground"),
    cursorAccent: token("--background"),
    selectionBackground: token("--selected", dark ? 0.4 : 0.25),
    selectionInactiveBackground: token("--muted-foreground", 0.25),
    scrollbarSliderBackground: token("--border"),
    scrollbarSliderHoverBackground: token("--muted-foreground", 0.5),
    scrollbarSliderActiveBackground: token("--muted-foreground", 0.6),
    black: dark ? token("--muted") : token("--foreground"),
    brightBlack: token("--muted-foreground"),
    red: token("--destructive"),
    brightRed: token("--destructive"),
    green: token("--success"),
    brightGreen: token("--success"),
    yellow: token("--warning"),
    brightYellow: token("--warning"),
    blue: token("--info"),
    brightBlue: token("--info"),
    magenta: token("--file-code"),
    brightMagenta: token("--file-code"),
    cyan: token("--chart-2"),
    brightCyan: token("--chart-2"),
    white: dark ? token("--secondary-foreground") : token("--muted-foreground"),
    brightWhite: dark ? token("--foreground") : token("--foreground-secondary"),
  };
}

/** The app's monospace stack (from the `font-mono` utility) */
export function monoFontFamily(): string {
  const probe = document.createElement("span");
  probe.className = "font-mono";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  document.body.appendChild(probe);
  const family = getComputedStyle(probe).fontFamily;
  probe.remove();
  return family || "ui-monospace, Menlo, monospace";
}
