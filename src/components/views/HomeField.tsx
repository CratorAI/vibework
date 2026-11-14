import React, { useEffect, useRef } from "react";
import { homeFieldGlyphs } from "./homeFieldGlyphs";
import { homeFieldScheduler } from "./homeFieldScheduler";

/**
 * Home's background: a faint field of characters that swells and thins like
 * weather, behind the heading and the composer. Drawn live on a canvas (no
 * image), in the text colour at very low strength, fading out at the edges and
 * leaving a clear area around the composer. It pauses when the window is not
 * in front; with "reduce motion" on, HomeView shows the still ruled lines
 * instead (see DESIGN.md, Home).
 */

const CELL_W = 9;
const CELL_H = 16;
const RAMP = " .·:-=+*#";
/** One frame every 70ms: slow enough to read as drift, not animation */
const FRAME_MS = 70;

/** Smooth pseudo-noise from summed sines; cheap enough for every cell, every frame */
function field(x: number, y: number, z: number): number {
  return (
    (Math.sin(x * 0.11 + z * 0.7) +
      Math.sin(y * 0.23 - z * 0.5) +
      Math.sin((x + y) * 0.07 + z * 0.3) +
      Math.sin(Math.hypot(x - 40, y - 10) * 0.15 - z)) /
    4
  );
}

export const HomeField: React.FC<{ className?: string }> = ({ className }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    let cols = 0;
    let rows = 0;
    let width = 0;
    let height = 0;
    let mask = new Float32Array(0);
    let color = "";
    let drawGlyph = (ch: string, x: number, y: number) => ctx.fillText(ch, x, y);
    let t = Math.random() * 100;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = '12px "Geist Mono", ui-monospace, Menlo, monospace';
      ctx.textBaseline = "top";
      cols = Math.ceil(width / CELL_W);
      rows = Math.ceil(height / CELL_H);

      // Text colour of the page, so the field follows the theme
      color = getComputedStyle(canvas).color;
      drawGlyph = homeFieldGlyphs(ctx, RAMP, color, dpr);

      // Per-cell strength: fades out at the edges, and clears an ellipse around
      // the heading and composer in the middle. Computed once per resize.
      mask = new Float32Array(cols * rows);
      const cx = width / 2;
      const cy = height * 0.5;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const px = c * CELL_W;
          const py = r * CELL_H;
          const edge =
            Math.min(1, Math.min(px, width - px) / 140) * Math.min(1, Math.min(py, height - py) / 110);
          const d = Math.hypot((px - cx) / 470, (py - cy) / 230);
          const hole = Math.min(1, Math.max(0, (d - 0.85) / 0.6));
          mask[r * cols + c] = edge * hole;
        }
      }
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const m = mask[r * cols + c];
          if (m <= 0.02) continue;
          let v = (field(c, r * 1.9, t * 0.35) + 1) / 2;
          v = Math.max(0, (v - 0.35) / 0.65);
          const ch = RAMP[Math.min(RAMP.length - 1, Math.floor(v * RAMP.length))];
          if (ch === " ") continue;
          ctx.fillStyle = color;
          ctx.globalAlpha = (0.05 + 0.13 * v) * m;
          drawGlyph(ch, c * CELL_W, r * CELL_H);
        }
      }
    };

    const running = () => !document.hidden && document.hasFocus() && !reduceMotion.matches;
    const scheduler = homeFieldScheduler(() => { t += 0.07; draw(); }, running, FRAME_MS);
    const sync = scheduler.sync;

    resize();
    draw();
    sync();

    const observer = new ResizeObserver(() => {
      resize();
      draw();
    });
    observer.observe(canvas);
    const themeObserver = new MutationObserver(() => { resize(); draw(); });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    reduceMotion.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    window.addEventListener("focus", sync);
    window.addEventListener("blur", sync);
    return () => {
      scheduler.stop();
      reduceMotion.removeEventListener("change", sync);
      observer.disconnect();
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", sync);
      window.removeEventListener("focus", sync);
      window.removeEventListener("blur", sync);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} data-testid="home-field" />;
};
