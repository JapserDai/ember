/**
 * 把称号图形打成 ASCII 点阵，肉眼验形。
 *
 * 用法：npx tsx scripts/preview-title-marks.ts [cols]
 *   例：npx tsx scripts/preview-title-marks.ts 40
 *
 * 为什么需要它：`src/domain/titleMarks.ts` 里是五只容器的外轮廓 + 三档水位，
 * 写错一位不会报错，只会画出「一个歪掉的盆」。而 28px 的卡片里看不出
 * 是坐标错了还是本来就长这样。这个脚本把它们放大画出来，并排对比三档水位，
 * 顺便检查两件必须成立的事：
 *
 *   1. **五只容器必须一眼分得开**（否则「体魄」和「秩序」会像同一个东西）；
 *   2. **水位必须落在内腔里**（超出腔体的水位在真机上会被画到轮廓外）。
 *
 * path 只用绝对命令，所以能直接复用 `scripts/svg-raster.ts` 的解析器。
 * 不参与打包。
 */
import {
  ATTRIBUTE_MARKS,
  JOURNEY_MARK,
  TITLE_MARK_BOX,
  TITLE_MARK_STROKE,
  glyphStrength,
  journeyLit,
  vesselFill,
  type AttributeMarkKey,
} from '../src/domain/titleMarks';
import { Canvas, pathToPolylines } from './svg-raster';

/** 与组件一致的线宽。改那边要同步改这里 */
const STROKE = TITLE_MARK_STROKE;

function attributeCanvas(key: AttributeMarkKey, tier: number, unlocked = true): Canvas {
  const mark = ATTRIBUTE_MARKS[key];
  const canvas = new Canvas(TITLE_MARK_BOX, Math.round(TITLE_MARK_BOX * 8));
  canvas.clear(0.15);

  // 容器：先填水位（填充），再描轮廓（线压在填充边缘上）
  if (mark.kind === 'vessel' && unlocked) {
    const fill = vesselFill(mark.cavity, tier);
    canvas.fill(
      [
        [
          [fill.x, fill.y],
          [fill.x + fill.width, fill.y],
          [fill.x + fill.width, fill.y + fill.height],
          [fill.x, fill.y + fill.height],
        ],
      ],
      1
    );
  }

  // 符号按浓度；容器恒为 1（已解锁）/ 0.35（未解锁）
  const alpha =
    mark.kind === 'vessel' ? (unlocked ? 1 : 0.35) : unlocked ? glyphStrength(tier) : 0.35;
  canvas.stroke(pathToPolylines(mark.outline), STROKE, alpha);
  return canvas;
}

function journeyCanvas(tier: number): Canvas {
  const canvas = new Canvas(TITLE_MARK_BOX, Math.round(TITLE_MARK_BOX * 8));
  canvas.clear(0.15);
  canvas.stroke(pathToPolylines(JOURNEY_MARK.outline), STROKE, 0.45);

  const lit = journeyLit(tier);
  JOURNEY_MARK.dots.forEach(([cx, cy], i) => {
    // 点亮的点：实心；没到的点：只描一圈（空心）
    if (i < lit) canvas.ellipseFill(cx, cy, JOURNEY_MARK.dotRadius, JOURNEY_MARK.dotRadius, 1);
    else canvas.ellipseStroke(cx, cy, JOURNEY_MARK.dotRadius, JOURNEY_MARK.dotRadius, 0.7, 1);
  });
  return canvas;
}

/** 每行缩进两格，方便并排看 */
function indent(text: string): string {
  return text
    .split(String.fromCharCode(10))
    .map((line) => '  ' + line)
    .join(String.fromCharCode(10));
}

/**
 * 把画布打成「墨 = `#`、纸 = `.`」的 ASCII。
 *
 * `toAscii` 的渐变是「越深越密」（`' .:-=+*#%@'`），所以满墨落在最后一个字符、
 * 纸底落在靠前的字符。这里按渐变**下标**归类，而不是按字符本身：
 * 下标 ≥ 8 是墨，≤ 2 是纸，中间是抗锯齿边缘。
 */
function ascii(canvas: Canvas, cols: number): string {
  const ramp = ' .:-=+*#%@';
  return canvas
    .toAscii(cols)
    .split('')
    .map((ch) => {
      // 换行原样保留：`split('')` 会把它们也切出来
      if (ch === String.fromCharCode(10)) return String.fromCharCode(10);
      const idx = ramp.indexOf(ch);
      if (idx < 0) return '?';
      if (idx >= 8) return '#';
      if (idx <= 2) return '.';
      return '+';
    })
    .join('');
}

const cols = Number.parseInt(
  (globalThis as unknown as { process?: { argv?: string[] } }).process?.argv?.[2] ?? '40',
  10
);

const KEYS = Object.keys(ATTRIBUTE_MARKS) as AttributeMarkKey[];

// ---- 三档并排（容器画水位，符号按浓度）----
for (const key of KEYS) {
  const kind = ATTRIBUTE_MARKS[key].kind;
  console.log(
    String.fromCharCode(10) + `### 属性称号 · ${key}（${kind}，来源 ${ATTRIBUTE_MARKS[key].source}）`
  );
  for (const tier of [1, 2, 3]) {
    console.log(`  --- ${tier} 档 ---`);
    console.log(indent(ascii(attributeCanvas(key, tier), cols)));
  }
  console.log("  --- 未解锁 ---");
  console.log(indent(ascii(attributeCanvas(key, 1, false), cols)));
}

// ---- 旅程 ----
console.log('\n### 旅程称号');
for (const tier of [1, 2, 3, 4, 5]) {
  console.log(`  --- 第 ${tier} 档（亮 ${journeyLit(tier)} 个点）---`);
  console.log(
    ascii(journeyCanvas(tier), cols)
      .split('\n')
      .map((line) => '  ' + line)
      .join('\n')
  );
}
