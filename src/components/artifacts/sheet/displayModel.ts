/**
 * What the grid widget sees of the engine model. In dark mode it reads cell
 * styles through `readableInDark`, so black-on-transparent text stays
 * legible; the workbook itself is never changed. Styles the widget pastes
 * back (format painter) get their original colours restored first.
 */

import type { CellStyle, Model } from "@ironcalc/wasm-xlsx";
import { parseColor, readableInDark, toCss, type ReplacedColors, type Rgba } from "./theme";

export function displayModel(model: Model, dark: boolean, tokens: { background: string; foreground: string }): Model {
  if (!dark) return model;
  const background: Rgba = { ...(parseColor(tokens.background) ?? { r: 0, g: 0, b: 0, a: 1 }), a: 1 };
  const foreground = toCss(parseColor(tokens.foreground) ?? { r: 255, g: 255, b: 255, a: 1 });
  const replaced = new WeakMap<object, ReplacedColors>();
  const resolve = (color: unknown) => model.resolveColor(color as Parameters<Model["resolveColor"]>[0]);
  const bound = new Map<PropertyKey, unknown>();

  const overrides: Partial<Record<keyof Model, unknown>> = {
    getCellStyle: (sheet: number, row: number, column: number) => {
      const ext = model.getCellStyle(sheet, row, column);
      const original = readableInDark(ext.style, resolve, background, foreground);
      if (original) replaced.set(ext.style, original);
      return ext;
    },
    onPasteStyles: (styles: CellStyle[][]) => {
      const restored = styles.map((row) =>
        row.map((style) => {
          const original = replaced.get(style);
          if (!original) return style;
          const copy: CellStyle = structuredClone(style);
          if ("font" in original) copy.font.color = original.font as CellStyle["font"]["color"];
          for (const [side, color] of Object.entries(original.borders)) {
            const item = (copy.border as Record<string, { color?: unknown } | undefined>)[side];
            if (item) item.color = color;
          }
          return copy;
        }),
      );
      model.onPasteStyles(restored);
    },
  };

  return new Proxy(model, {
    get(target, prop) {
      if (prop in overrides) return overrides[prop as keyof Model];
      const value = Reflect.get(target, prop, target);
      if (typeof value !== "function") return value;
      // wasm-bindgen methods read `this.__wbg_ptr`: call them on the real model
      let fn = bound.get(prop);
      if (!fn) {
        fn = (value as (...args: unknown[]) => unknown).bind(target);
        bound.set(prop, fn);
      }
      return fn;
    },
  });
}
