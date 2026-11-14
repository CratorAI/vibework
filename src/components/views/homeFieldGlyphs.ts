/** Rasterize the fixed ramp once per font, colour and display scale. The padding
 * preserves the font's antialiased edges; destination pixels remain 1:1.
 */
export function homeFieldGlyphs(ctx: CanvasRenderingContext2D, ramp: string, color: string, dpr: number) {
  // Fractional display scales put different cells at different subpixel phases.
  // Keep native text rasterization there rather than reuse the wrong phase.
  if (!Number.isInteger(dpr)) return (ch: string, x: number, y: number) => ctx.fillText(ch, x, y);
  const glyphs = new Map<string, HTMLCanvasElement>();
  for (const ch of ramp) {
    if (ch === ' ') continue;
    const glyph = document.createElement('canvas');
    glyph.width = 17 * dpr; glyph.height = 24 * dpr;
    const g = glyph.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.font = ctx.font; g.textBaseline = 'top'; g.fillStyle = color;
    g.fillText(ch, 4, 4);
    glyphs.set(ch, glyph);
  }
  return (ch: string, x: number, y: number) => {
    const glyph = glyphs.get(ch)!;
    ctx.drawImage(glyph, x - 4, y - 4, glyph.width / dpr, glyph.height / dpr);
  };
}
