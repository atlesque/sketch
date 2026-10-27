// Paints drawing ops onto a canvas. Every client (and the admin's replay) runs the same ops through this,
// so a late joiner, a reconnect or an undo just repaints the whole list.

import { undoOps } from '#shared/game';
import { BOARD_H, BOARD_W, PALETTE, SIZES, type Op } from '#shared/protocol';

/** How far a pixel may differ from the clicked one and still be filled (soaks up anti-aliased edges). */
const FILL_TOLERANCE = 48;

export class Board {
  ops: Op[] = [];
  private ctx: CanvasRenderingContext2D;
  private pen: { color: string; size: number; x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = BOARD_W;
    canvas.height = BOARD_H;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.redraw();
  }

  reset(ops: Op[]) {
    this.ops = [...ops];
    this.redraw();
  }

  apply(ops: Op[]) {
    for (const op of ops) {
      this.ops.push(op);
      this.paint(op);
    }
  }

  undo() {
    this.ops = undoOps(this.ops);
    this.redraw();
  }

  clear() {
    this.ops = [];
    this.redraw();
  }

  redraw() {
    this.ctx.fillStyle = PALETTE[0];
    this.ctx.fillRect(0, 0, BOARD_W, BOARD_H);
    this.pen = null;
    for (const op of this.ops) this.paint(op);
  }

  private paint(op: Op) {
    const ctx = this.ctx;
    if (op[0] === 'b') {
      this.pen = { color: PALETTE[op[1]] ?? '#000', size: SIZES[op[2]] ?? 7, x: op[3], y: op[4] };
      ctx.fillStyle = this.pen.color;
      ctx.beginPath();
      ctx.arc(op[3], op[4], this.pen.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else if (op[0] === 'l') {
      const pen = this.pen;
      if (!pen) return;
      ctx.strokeStyle = pen.color;
      ctx.lineWidth = pen.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pen.x, pen.y);
      ctx.lineTo(op[1], op[2]);
      ctx.stroke();
      pen.x = op[1];
      pen.y = op[2];
    } else {
      this.pen = null;
      floodFill(ctx, op[2], op[3], PALETTE[op[1]] ?? '#000');
    }
  }
}

function rgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Scanline flood fill from (x, y) with `hex`, over pixels close to the clicked pixel's color. */
export function floodFill(ctx: CanvasRenderingContext2D, x0: number, y0: number, hex: string) {
  const W = BOARD_W;
  const H = BOARD_H;
  const sx = Math.round(x0);
  const sy = Math.round(y0);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return;
  const image = ctx.getImageData(0, 0, W, H);
  const d = image.data;
  const start = (sy * W + sx) * 4;
  const tr = d[start]!;
  const tg = d[start + 1]!;
  const tb = d[start + 2]!;
  const [fr, fg, fb] = rgb(hex);
  if (Math.abs(tr - fr) < 3 && Math.abs(tg - fg) < 3 && Math.abs(tb - fb) < 3) return;
  const T = FILL_TOLERANCE;
  const seen = new Uint8Array(W * H);
  const match = (p: number) => {
    if (seen[p]) return false;
    const k = p * 4;
    return Math.abs(d[k]! - tr) <= T && Math.abs(d[k + 1]! - tg) <= T && Math.abs(d[k + 2]! - tb) <= T;
  };
  const stack: number[] = [sy * W + sx];
  while (stack.length) {
    const p = stack.pop()!;
    if (!match(p)) continue;
    const y = Math.floor(p / W);
    let left = p;
    while (left % W > 0 && match(left - 1)) left--;
    let right = p;
    while (right % W < W - 1 && match(right + 1)) right++;
    for (let q = left; q <= right; q++) {
      seen[q] = 1;
      const k = q * 4;
      d[k] = fr;
      d[k + 1] = fg;
      d[k + 2] = fb;
      d[k + 3] = 255;
      if (y > 0 && match(q - W)) stack.push(q - W);
      if (y < H - 1 && match(q + W)) stack.push(q + W);
    }
  }
  ctx.putImageData(image, 0, 0);
}
