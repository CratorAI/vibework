export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
}
export function snap(value: number, targets: number[], threshold = 5) {
  let best = value,
    dist = threshold;
  for (const t of targets) {
    if (Math.abs(t - value) < dist) {
      best = t;
      dist = Math.abs(t - value);
    }
  }
  return best;
}
/** Resize at the bottom-right, holding the rotated top-left fixed. */
export function resize(b: Box, dx: number, dy: number, ratio = false): Box {
  const a = (b.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  let w = Math.max(1, b.w + dx * c + dy * s),
    h = Math.max(1, b.h - dx * s + dy * c);
  if (ratio) h = (w * b.h) / b.w;
  const dw = w - b.w,
    dh = h - b.h;
  return {
    ...b,
    w,
    h,
    x: b.x + (dw * c - dh * s - dw) / 2,
    y: b.y + (dw * s + dh * c - dh) / 2,
  };
}
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(
    public current: T,
    private limit = 150,
  ) {}
  push(next: T) {
    if (next === this.current) return;
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.current = next;
    this.future = [];
  }
  undo() {
    const n = this.past.pop();
    if (n !== undefined) {
      this.future.push(this.current);
      this.current = n;
    }
    return this.current;
  }
  redo() {
    const n = this.future.pop();
    if (n !== undefined) {
      this.past.push(this.current);
      this.current = n;
    }
    return this.current;
  }
}

export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
/** Resize in local axes, preserving the opposite handle or the centre. */
export function resizeHandle(
  b: Box,
  dx: number,
  dy: number,
  handle: Handle,
  ratio = false,
  centre = false,
): Box {
  const a = (b.rotation * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a),
    lx = dx * c + dy * s,
    ly = -dx * s + dy * c;
  const sx = handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0,
    sy = handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0;
  const k = centre ? 2 : 1;
  let dw = sx ? lx * sx * k : 0,
    dh = sy ? ly * sy * k : 0;
  if (ratio) {
    if (!sx || Math.abs(dh / b.h) > Math.abs(dw / b.w)) dw = (dh * b.w) / b.h;
    else dh = (dw * b.h) / b.w;
  }
  const w = Math.max(1, b.w + dw),
    h = Math.max(1, b.h + dh);
  dw = w - b.w;
  dh = h - b.h;
  const cx = centre ? 0 : ((sx || 1) * dw) / 2,
    cy = centre ? 0 : ((sy || 1) * dh) / 2;
  return {
    ...b,
    w,
    h,
    x: b.x + cx * c - cy * s - dw / 2,
    y: b.y + cx * s + cy * c - dh / 2,
  };
}
