/**
 * 极小的 SVG path 光栅器 —— 把 path 字符串打成 ASCII 点阵。
 *
 * 为什么这个文件在仓库里：avatar.ts 与 TabBarIcon.tsx 产出的都是 path 字符串。
 * 字符串写错了不会有任何报错，只会画出一个歪的东西，而人眼在 23–64px 的小图里
 * 很难判断是「设计如此」还是「算错了」。把它打一遍点阵出来看，是唯一
 * 不需要跑模拟器就能验证的办法。
 *
 * 支持的命令只有 M / L / C / Q / Z，正好是这两个文件用到的全部。
 * 不支持 A、S、T、相对命令（c / s / h / v）是故意的：用了就说明
 * 那边引入了本脚本不认识的曲线或相对坐标，那时候应该先想清楚要不要用，
 * 而不是把脚本补全成一门 path 解析器。
 *
 * 不参与打包 —— 没有从 src/ 或 app/ 里 import 它，只有 scripts/ 下的预览脚本用。
 */

/** 多段线上的一点。坐标是画布单位（不是采样点） */
export type Pt = [number, number];

/** 把 SVG path 拆成一组多段线。每个 M 开一条新的 */
export function pathToPolylines(d: string): Pt[][] {
  const toks = d.match(/[MLCQZHmlcqz]|-?\d*\.?\d+/g) ?? [];
  const out: Pt[][] = [];
  let cur: Pt[] | null = null;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let i = 0;
  let cmd: string | null = null;
  const num = () => parseFloat(toks[i++]);

  while (i < toks.length) {
    const t = toks[i];
    if (/[MLCQZHmlcqz]/.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'Z' || cmd === 'z') {
        if (cur) {
          cur.push([sx, sy]);
          out.push(cur);
          cur = null;
        }
      }
      continue;
    }
    if (cmd === 'M' || cmd === 'm') {
      const x = num();
      const y = num();
      if (cur) out.push(cur);
      cur = [[x, y]];
      cx = x;
      cy = y;
      sx = x;
      sy = y;
      cmd = cmd === 'M' ? 'L' : 'l';
    } else if (cmd === 'L' || cmd === 'l') {
      const x = num();
      const y = num();
      cur?.push([x, y]);
      cx = x;
      cy = y;
    } else if (cmd === 'C' || cmd === 'c') {
      const x1 = num();
      const y1 = num();
      const x2 = num();
      const y2 = num();
      const x3 = num();
      const y3 = num();
      for (let s = 1; s <= 12; s++) {
        const u = s / 12;
        const v = 1 - u;
        cur?.push([
          v * v * v * cx + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3,
          v * v * v * cy + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3,
        ]);
      }
      cx = x3;
      cy = y3;
    } else if (cmd === 'Q' || cmd === 'q') {
      const x1 = num();
      const y1 = num();
      const x2 = num();
      const y2 = num();
      for (let s = 1; s <= 10; s++) {
        const u = s / 10;
        const v = 1 - u;
        cur?.push([
          v * v * cx + 2 * v * u * x1 + u * u * x2,
          v * v * cy + 2 * v * u * y1 + u * u * y2,
        ]);
      }
      cx = x2;
      cy = y2;
    } else {
      i++;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** 一块画布：存的是每点的累积不透明度 */
export class Canvas {
  /** 采样分辨率（正方形边长） */
  private readonly size: number;
  /** 画布单位 → 采样点 */
  private readonly scale: number;
  private buf: Float64Array;

  /**
   * @param box  生成这些 path 时的 viewBox 边长（头像 100，tab 图标 24）
   * @param size 采样分辨率。默认 box × 2.4，够看清 0.5 单位的线
   */
  constructor(private readonly box: number, size = Math.round(box * 2.4)) {
    this.size = size;
    this.scale = size / box;
    this.buf = new Float64Array(size * size);
  }

  /** 先铺一层「纸」。亮色主题的 surface 几乎就是这个亮度，所以底下不是纯白 */
  clear(paper = 0.3) {
    this.buf.fill(paper);
  }

  /** 直接赋值（不走叠加）：用来画不透明的 surface 底。四套主题的 surface 都比 background 亮，
   * 所以下面的「不透明度」在亮度坐标上其实是一个**更浅**的值 */
  paint(polylines: Pt[][], value: number) {
    const mask = new Uint8Array(this.size * this.size);
    for (const poly of polylines) {
      const edges: Array<[number, number, number, number]> = [];
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k];
        const b = poly[(k + 1) % poly.length];
        if (a[1] === b[1]) continue;
        edges.push([a[0] * this.scale, a[1] * this.scale, b[0] * this.scale, b[1] * this.scale]);
      }
      for (let y = 0; y < this.size; y++) {
        const yc = y + 0.5;
        const hits: Array<[number, number]> = [];
        for (const [x1, y1, x2, y2] of edges) {
          if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) {
            hits.push([x1 + ((x2 - x1) * (yc - y1)) / (y2 - y1), y2 > y1 ? 1 : -1]);
          }
        }
        hits.sort((m, n) => m[0] - n[0]);
        let w = 0;
        for (let k = 0; k < hits.length - 1; k++) {
          w += hits[k][1];
          if (w === 0) continue;
          const from = Math.max(0, Math.ceil(hits[k][0] - 0.5));
          const to = Math.min(this.size - 1, Math.floor(hits[k + 1][0] - 0.5));
          for (let x = from; x <= to; x++) mask[y * this.size + x] = 1;
        }
      }
    }
    for (let i = 0; i < mask.length; i++) {
      if (mask[i]) this.buf[i] = value;
    }
  }

  /** 非零环绕规则填充 */
  fill(polylines: Pt[][], alpha: number) {
    const edges: Array<[number, number, number, number]> = [];
    for (const poly of polylines) {
      for (let k = 0; k < poly.length; k++) {
        const a = poly[k];
        const b = poly[(k + 1) % poly.length];
        if (a[1] === b[1]) continue;
        edges.push([a[0] * this.scale, a[1] * this.scale, b[0] * this.scale, b[1] * this.scale]);
      }
    }
    for (let y = 0; y < this.size; y++) {
      const yc = y + 0.5;
      const hits: Array<[number, number]> = [];
      for (const [x1, y1, x2, y2] of edges) {
        if ((y1 <= yc && y2 > yc) || (y2 <= yc && y1 > yc)) {
          hits.push([x1 + ((x2 - x1) * (yc - y1)) / (y2 - y1), y2 > y1 ? 1 : -1]);
        }
      }
      hits.sort((a, b) => a[0] - b[0]);
      let w = 0;
      for (let k = 0; k < hits.length - 1; k++) {
        w += hits[k][1];
        if (w === 0) continue;
        const from = Math.max(0, Math.ceil(hits[k][0] - 0.5));
        const to = Math.min(this.size - 1, Math.floor(hits[k + 1][0] - 0.5));
        for (let x = from; x <= to; x++) this.blend(y * this.size + x, alpha);
      }
    }
  }

  /** 按线宽描边（圆头） */
  stroke(polylines: Pt[][], width: number, alpha: number) {
    const r = (width * this.scale) / 2;
    for (const poly of polylines) {
      for (let k = 0; k < poly.length - 1; k++) {
        const ax = poly[k][0] * this.scale;
        const ay = poly[k][1] * this.scale;
        const bx = poly[k + 1][0] * this.scale;
        const by = poly[k + 1][1] * this.scale;
        const dx = bx - ax;
        const dy = by - ay;
        const l2 = dx * dx + dy * dy;
        const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r - 1));
        const x1 = Math.min(this.size - 1, Math.ceil(Math.max(ax, bx) + r + 1));
        const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r - 1));
        const y1 = Math.min(this.size - 1, Math.ceil(Math.max(ay, by) + r + 1));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const px = x + 0.5;
            const py = y + 0.5;
            let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
            t = Math.max(0, Math.min(1, t));
            const ddx = px - (ax + t * dx);
            const ddy = py - (ay + t * dy);
            if (ddx * ddx + ddy * ddy <= r * r) this.blend(y * this.size + x, alpha);
          }
        }
      }
    }
  }

  ellipseFill(cx: number, cy: number, rx: number, ry: number, alpha: number) {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const nx = ((x + 0.5) / this.scale - cx) / rx;
        const ny = ((y + 0.5) / this.scale - cy) / ry;
        if (nx * nx + ny * ny <= 1) this.blend(y * this.size + x, alpha);
      }
    }
  }

  ellipseStroke(cx: number, cy: number, rx: number, ry: number, width: number, alpha: number) {
    const poly: Pt[] = [];
    for (let k = 0; k <= 64; k++) {
      const t = (k / 64) * Math.PI * 2;
      poly.push([cx + rx * Math.cos(t), cy + ry * Math.sin(t)]);
    }
    this.stroke([poly], width, alpha);
  }

  rectStroke(x: number, y: number, w: number, h: number, width: number, alpha: number) {
    this.stroke([[[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]]], width, alpha);
  }

  private blend(idx: number, alpha: number) {
    this.buf[idx] = 1 - (1 - this.buf[idx]) * (1 - alpha);
  }

  /**
   * 按终端字符宽度抽样成 ASCII。字符集从浅到深，和亮色主题的墨色对应。
   *
   * cols 是字符列数。行数按字符的宽高比（约 2:1）折算，
   * 这样打出来的图形在终端里是**不变形**的——否则圆会被拉成竖长的椭圆，
   * 而「形状对不对」正是这个工具唯一的用途。
   */
  toAscii(cols: number): string {
    const ramp = ' .:-=+*#%@';
    const rows = Math.max(1, Math.round(cols / 2));
    const lines: string[] = [];
    for (let r = 0; r < rows; r++) {
      let line = '';
      for (let c = 0; c < cols; c++) {
        const x0 = Math.floor((c * this.size) / cols);
        const x1 = Math.floor(((c + 1) * this.size) / cols);
        const y0 = Math.floor((r * this.size) / rows);
        const y1 = Math.floor(((r + 1) * this.size) / rows);
        let sum = 0;
        let n = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            sum += this.buf[y * this.size + x];
            n++;
          }
        }
        const v = n ? sum / n : 0;
        line += ramp[Math.min(ramp.length - 1, Math.round(v * (ramp.length - 1)))];
      }
      lines.push(line);
    }
    return lines.join('\n');
  }
}

