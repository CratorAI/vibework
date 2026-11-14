/** CSS elliptical corner radii, including CSS's overlap reduction, as SVG. */
export function roundedRectPath(
  width: number,
  height: number,
  corners: string[],
  inset = 0,
): string {
  const radii = corners.map((value) => {
    const parts = value.split(/\s+/);
    const px = (v: string, size: number) =>
      v.endsWith("%") ? (parseFloat(v) * size) / 100 : parseFloat(v) || 0;
    return [px(parts[0], width), px(parts[1] ?? parts[0], height)];
  });
  const factor = Math.min(
    1,
    width / (radii[0][0] + radii[1][0] || 1),
    width / (radii[3][0] + radii[2][0] || 1),
    height / (radii[0][1] + radii[3][1] || 1),
    height / (radii[1][1] + radii[2][1] || 1),
  );
  const [a, b, c, d] = radii.map((r) =>
    r.map((n) => Math.max(0, n * factor - inset)),
  );
  const x = inset,
    y = inset,
    w = width - inset,
    h = height - inset;
  const arc = (r: number[], ex: number, ey: number) =>
    r[0] && r[1] ? `A${r[0]} ${r[1]} 0 0 1 ${ex} ${ey}` : `L${ex} ${ey}`;
  return `M${x + a[0]} ${y}H${w - b[0]}${arc(b, w, y + b[1])}V${h - c[1]}${arc(c, w - c[0], h)}H${x + d[0]}${arc(d, x, h - d[1])}V${y + a[1]}${arc(a, x + a[0], y)}Z`;
}
