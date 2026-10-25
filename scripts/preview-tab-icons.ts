/**
 * 把底部导航的四个图标打成 ASCII 点阵，肉眼验证形状。
 *
 * 用法：npx tsx scripts/preview-tab-icons.ts [cols]
 *   例：npx tsx scripts/preview-tab-icons.ts 48
 *
 * 为什么需要它：src/components/TabBarIcon.tsx 里是四段手写的 path。
 * 路径写错一位，模拟器上看到的是「一个歪掉的东西」，很难判断是坐标错了
 * 还是本来就长这样——尤其在 23px 的尺寸下。这个脚本把它们放大画出来，
 * 并且并排对比「未选中 1.45」与「选中 1.95」两档线宽，
 * 顺便检查四个图标的视觉重量是否接近（否则底栏会一高一低像没对齐）。
 *
 * path 只用绝对命令，所以这里能直接用 svg-raster.ts 的解析器。
 * 不参与打包。
 */
import { TAB_ICON_BOX } from '../src/components/TabBarIcon';
import { Canvas, pathToPolylines } from './svg-raster';

/** 与 TabBarIcon.tsx 一致的线宽。改那边要同步改这里 */
const STROKE_IDLE = 1.45;
const STROKE_ACTIVE = 1.95;

/**
 * 四个图标的 path 数据。
 *
 * **必须与 TabBarIcon.tsx 里的 renderShape 逐字一致**——这个脚本的价值
 * 全在「它画的就是组件会画的东西」，一旦不同步，看出来的结果没有意义。
 * 之所以不直接从组件 import 那些 path：组件的 renderShape 返回的是
 * JSX 元素，把它拆回字符串反而更容易出错。
 */
const ICONS: Record<string, { stroke: number; paths: string[]; circles?: Array<[number, number, number]>; rects?: Array<[number, number, number, number]> }> = {
  today: {
    stroke: STROKE_IDLE,
    paths: [
      'M12 3.5C9.1 7.4 7 10 7 13.1C7 16.4 9.2 18.5 12 18.5C14.8 18.5 17 16.4 17 13.1C17 10 14.9 7.4 12 3.5Z',
      'M12 9.6C12.8 11 13.7 11.9 13.7 13.6C13.7 15 13 15.9 12.1 16',
    ],
  },
  goals: {
    stroke: STROKE_IDLE,
    paths: [
      'M7.3 4.2L7.3 19.5',
      'M7.3 4.6C9.3 3.3 11.1 5.6 13.5 4.6C14.6 4.15 15.5 4.05 16.3 4.35L16.3 11.1C15.5 10.8 14.6 10.9 13.5 11.35C11.1 12.35 9.3 10.05 7.3 11.35Z',
      'M4.9 19.5L9.7 19.5',
    ],
  },
  memories: {
    stroke: STROKE_IDLE,
    paths: [],
    rects: [
      [4.7, 4.5, 10.1, 12.4],
      [9.2, 7.1, 10.1, 12.4],
    ],
  },
  me: {
    stroke: STROKE_IDLE,
    paths: ['M4.9 20.2C4.9 16.3 8.1 14.4 12 14.4C15.9 14.4 19.1 16.3 19.1 20.2'],
    circles: [[12, 8.3, 3.5]],
  },
};

function draw(name: string, strokeWidth: number, cols: number): Canvas {
  const spec = ICONS[name];
  const canvas = new Canvas(TAB_ICON_BOX, Math.round(TAB_ICON_BOX * 8));
  // 深色底：底栏在暗色主题下就是深色，图标是亮线。
  // 用 0.85 的纸底模拟「还没画」的区域，画上就是 0（最亮）
  canvas.clear(0.9);
  for (const d of spec.paths) canvas.stroke(pathToPolylines(d), strokeWidth, 1);
  for (const [cx, cy, r] of spec.circles ?? []) {
    canvas.ellipseStroke(cx, cy, r, r, strokeWidth, 1);
  }
  for (const [x, y, w, h] of spec.rects ?? []) {
    canvas.rectStroke(x, y, w, h, strokeWidth, 1);
  }
  return canvas;
}

/**
 * 把一张画布反相打出来。
 *
 * svg-raster 的 toAscii 是「越深越密」（给亮色主题的头像用），
 * 而图标是深底亮线，所以要反一次：把每个字符按反序取。
 */
function asciiInverted(canvas: Canvas, cols: number): string {
  const ramp = ' .:-=+*#%@';
  return canvas
    .toAscii(cols)
    .split('')
    .map((ch) => {
      const idx = ramp.indexOf(ch);
      return idx < 0 ? ch : ramp[ramp.length - 1 - idx];
    })
    .join('');
}

const cols = Number.parseInt(
  (globalThis as unknown as { process?: { argv?: string[] } }).process?.argv?.[2] ?? '48',
  10,
);

for (const name of Object.keys(ICONS)) {
  console.log(`\n### ${name} · 未选中 (${STROKE_IDLE})`);
  console.log(asciiInverted(draw(name, STROKE_IDLE, cols), cols));
  console.log(`\n### ${name} · 选中 (${STROKE_ACTIVE})`);
  console.log(asciiInverted(draw(name, STROKE_ACTIVE, cols), cols));
}
