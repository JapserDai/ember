/// <reference types="node" />
/**
 * 生成品牌记号的全部位图：App 图标、Android 自适应图标三件套、启动图、favicon。
 *
 * 用法：
 *   npx tsx scripts/make-logo.ts
 *   或者（不装 tsx 时）：
 *   node --experimental-transform-types scripts/make-logo.ts
 *
 * ---- 为什么要脚本，而不是手工在画图软件里导出 ----
 *
 * 这个记号要出现在六个地方，尺寸从 16px 到 1024px。手工导出的话，
 * 每次改形状都要重新导六次，而且必然有一次忘了导——于是通知栏还是旧的花，
 * 桌面图标已经是新的。脚本把「形状」和「摆位」分开：
 *   - 形状只有一处：`src/domain/spark.ts` 的 SPARK_PATH；
 *   - 摆位只有一处：下面 PLACEMENT 那张表（每个位图占画布的百分之几）。
 * 改形状只改那个常量，重跑一次这个脚本，六个文件一起变。
 *
 * ---- 为什么用无头 Chrome 光栅化 ----
 *
 * 项目里没有任何图片处理依赖（D3 / D4 / D47 的「少依赖」是同一条立场），
 * 而 SVG→PNG 需要曲线填充。这里不去装 sharp / resvg（几十 MB 的原生模块，
 * 只为几张图），改用**每台开发机都已经有的浏览器**：把 SVG 写进一个临时
 * HTML，用 `--screenshot` 截一张正好等于目标尺寸的图。
 * 代价是这个脚本只能在装了 Chrome / Edge 的机器上跑——它是开发期工具，
 * 不进打包，产物（PNG）已经提交进仓库，所以别人不需要跑它。
 *
 * ---- 颜色从哪来 ----
 *
 * 三条固定的：纸白 #FAF9F8、主色 #2564CF、暗调主色 #1B4A94，与
 * `src/theme/tokens.ts` 的「白」那一套一致（落地页也用它）。
 * 脚本不 import tokens：tokens 里的值是 buildPalette() 算出来的，
 * 而那四个色板（D40）随时可能被改，图标不该跟着某个主题走——
 * 图标的蓝是**品牌色**，不是当前主题色。
 */
import { execFileSync } from 'child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import { SPARK_BOUNDS, SPARK_BOX, SPARK_CENTER, SPARK_PATH } from '../src/domain/spark';

/** 纸白。图标里的记号用它，不用纯白——纯白在深底上会发青 */
const PAPER = '#FAF9F8';
/** 主色。与 tokens.ts 的「白」、落地页的 --primary 同一个值 */
const PRIMARY = '#2564CF';
/** 暗调主色。图标底色用它：余烬是暗的，桌面上一块亮蓝会太吵 */
const PRIMARY_DEEP = '#1B4A94';

/** 记号包围盒的宽高（画框单位）。摆位要用 */
const MARK_W = SPARK_BOUNDS.maxX - SPARK_BOUNDS.minX;
const MARK_H = SPARK_BOUNDS.maxY - SPARK_BOUNDS.minY;

/**
 * 每个位图的摆位。
 *
 *   size    画布边长（px）
 *   ink     记号的填充色
 *   field   底色。不填 = 透明
 *   markH   记号的高度占画布的比例
 *   radius  如果给数字，把底色画成圆角方块（favicon 用）；不给 = 铺满
 *
 * markH 的取值不是随手定的，每一个都有约束：
 *   - icon（1024）：0.62。商店/桌面图标里记号要能一眼认出，但四周要留呼吸，
 *     否则圆角裁切会切到上面那笔的尖。
 *   - android 前景：0.50。自适应图标会被系统裁成各种形状（圆/方/水滴），
 *     安全区只有中间 66%，记号超过 52% 就会在圆形裁切下被切到。
 *   - android 单色：0.46。通知栏那枚只有 24dp，比前景再小一点才不糊。
 *   - splash：0.34。启动图上记号不能顶满，它周围要留出「等着」的空白。
 *   - favicon：0.94。16px 的标签页里没有留白的余地，记号必须顶到边。
 */
const PLACEMENT = [
  {
    file: 'icon.png',
    size: 1024,
    ink: PAPER,
    field: PRIMARY_DEEP,
    radius: 0,
    markH: 0.62,
  },
  {
    file: 'android-icon-foreground.png',
    size: 512,
    ink: PAPER,
    field: null,
    radius: 0,
    markH: 0.5,
  },
  {
    file: 'android-icon-background.png',
    size: 512,
    ink: null,
    field: PRIMARY_DEEP,
    radius: 0,
    markH: 0,
  },
  {
    // 单色图标：系统会把它染成通知栏/主题色，所以这里只给白色 + 透明。
    // 给灰（上一版是 #7D7D7D）会让「系统染色」的结果偏暗一档。
    file: 'android-icon-monochrome.png',
    size: 432,
    ink: '#FFFFFF',
    field: null,
    radius: 0,
    markH: 0.46,
  },
  {
    file: 'splash-icon.png',
    size: 1024,
    ink: PRIMARY_DEEP,
    field: null,
    radius: 0,
    markH: 0.34,
  },
  {
    file: 'favicon.png',
    size: 48,
    ink: PAPER,
    field: PRIMARY_DEEP,
    radius: 0.22,
    markH: 0.94,
  },
] as const;

/**
 * 一个位图的完整 SVG。
 *
 * 记号按「光心」摆到画布中心（不是包围盒中心，理由见 domain/spark.ts）。
 * 缩放用 markH 反推：记号高 15.6 个画框单位，要占画布的 markH，
 * 所以 scale = size × markH / 15.6。
 */
function svgFor({ size, ink, field, radius, markH }: (typeof PLACEMENT)[number]) {
  const scale = (size * markH) / MARK_H;
  // 记号中心 → 画布中心
  const tx = size / 2 - SPARK_CENTER.x * scale;
  const ty = size / 2 - SPARK_CENTER.y * scale;

  const bg =
    field === null
      ? ''
      : radius > 0
        ? `<rect width="${size}" height="${size}" rx="${size * radius}" fill="${field}"/>`
        : `<rect width="${size}" height="${size}" fill="${field}"/>`;

  const mark =
    ink === null
      ? ''
      : `<g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(6)})">` +
        `<path d="${SPARK_PATH}" fill="${ink}"/></g>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" ` +
    `viewBox="0 0 ${size} ${size}">${bg}${mark}</svg>`
  );
}

/** 矢量母版：给设计稿/文档用，也让「形状长什么样」有一份人能直接打开的文件 */
function masterSvg() {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" ` +
    `viewBox="0 0 ${SPARK_BOX} ${SPARK_BOX}">` +
    `<path d="${SPARK_PATH}" fill="${PRIMARY_DEEP}"/></svg>\n`
  );
}

/**
 * 找一个可用的浏览器。找不到就报一句能照着做的错。
 *
 * Windows 上 Edge 一定在（系统自带），Chrome 常装；macOS / Linux 各试一次。
 */
function findBrowser(): string {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((p): p is string => Boolean(p));

  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      '找不到 Chrome / Edge。装一个，或者用 CHROME_PATH 指过去：\n' +
        '  CHROME_PATH=/path/to/chrome npx tsx scripts/make-logo.ts\n' +
        '（这些 PNG 已经提交在 assets/ 里，只有改形状时才需要重跑。）'
    );
  }
  return found;
}

/** 把一个 SVG 截成 PNG */
function render(browser: string, svg: string, size: number, out: string, workDir: string, i: number) {
  const html = join(workDir, `logo-${i}.html`);
  writeFileSync(
    html,
    '<!doctype html><meta charset="utf-8">' +
      '<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}</style>' +
      svg,
    'utf8'
  );

  execFileSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      // 透明底：不传这一条的话，没有底色的位图会被截成白底
      '--default-background-color=00000000',
      `--window-size=${size},${size}`,
      `--screenshot=${out}`,
      `file:///${html.replace(/\\/g, '/')}`,
    ],
    { stdio: 'ignore' }
  );
}

function main() {
  const browser = findBrowser();
  // 仓库根：本文件在 <root>/scripts/ 下
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const assets = join(root, 'assets');
  mkdirSync(assets, { recursive: true });

  const workDir = mkdtempSync(join(tmpdir(), 'ember-logo-'));
  try {
    // 矢量母版
    writeFileSync(join(assets, 'logo-spark.svg'), masterSvg(), 'utf8');

    PLACEMENT.forEach((spec, i) => {
      const out = join(assets, spec.file);
      render(browser, svgFor(spec), spec.size, out, workDir, i);
      console.log(`${spec.file.padEnd(32)} ${spec.size}×${spec.size}`);
    });
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }

  console.log('\n完成。六个位图 + assets/logo-spark.svg');
}

main();
