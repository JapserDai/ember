/**
 * 从 Lucide 拉图标并转换成项目规矩的坐标（D52）。
 *
 * 用法：
 *   npx tsx scripts/fetch-lucide-marks.ts            # 打印转换结果
 *   npx tsx scripts/fetch-lucide-marks.ts beaker moon  # 只拉某几个
 *
 * ---- 为什么要有这个脚本 ----
 *
 * `src/domain/titleMarks.ts` 里的坐标**不是手绘的**，是 Lucide 的图标转换来的
 * （ISC 许可，可商用）。但转换不能靠手工抄——Lucide 的 path 用相对命令与圆弧，
 * 手抄一遍必然错，而且改一个图标就得重抄。
 *
 * 所以：坐标抄进源码（App 不申请网络权限，不能运行时拉），
 * 但**抄的过程**是可重跑的。要换一个图标时：
 *   1. 改下面 ICONS 里的名字；
 *   2. 跑这个脚本；
 *   3. 把输出粘进 `titleMarks.ts`。
 *
 * ---- 转换做了什么 ----
 *
 * Lucide 用 `h`/`v`/`a`/`c`（相对）与圆弧，而项目规矩是
 * **只用绝对命令 M/L/C/Q/Z**（`scripts/svg-raster.ts` 只认这几条）：
 *
 *   - `svgpath(...).unarc()`：圆弧 → 三次贝塞尔（`C`），形状不变；
 *   - `.unshort()`：`S`/`T` 展开成完整曲线；
 *   - `.abs()`：相对命令 → 绝对坐标；
 *   - 数字四舍五入到两位小数。
 *
 * `svgpath` 是**开发期依赖**，不进 App（与 `make-logo.ts` 用无头浏览器同一个立场：
 * 开发期工具可以重一点，运行时不行）。
 *
 * 注意：这个脚本**不写文件**，只打印。抄进源码是有意的——
 * 源码里那串坐标就是「现在长什么样」的唯一真相，不引一个构建期生成步骤（D3 的少配置立场）。
 */
import { execFileSync } from 'child_process';

import svgpath from 'svgpath';

/** 要拉的图标。名字就是 lucide-static 的文件名（不带 .svg） */
const ICONS = [
  // 称号图形（titleMarks.ts，D52）
  'beaker', 'book-open', 'archive', 'moon', 'users',
  // 商店图形（shopMarks.ts，D53）
  'package', 'package-open', 'shield-check', 'ticket', 'rotate-ccw', 'gift',
  // 自然图案（natureMarks.ts，D59）
  'sprout', 'flower', 'globe', 'sun', 'cloud-rain', 'leaf',
];

/** Lucide 的 raw 文件地址。用 unpkg 的固定版本，避免上游改形状导致「重新拉取」不可复现 */
const CDN = 'https://unpkg.com/lucide-static@1.61.0/icons';

function fetchSvg(name: string): string {
  // curl 比 fetch 稳：这个脚本只在开发机上跑，不涉及运行时网络权限
  return execFileSync('curl', ['-sL', '--max-time', '15', `${CDN}/${name}.svg`], {
    encoding: 'utf8',
  });
}

/** 从 SVG 里取出全部 path 的 d 属性 */
function paths(svg: string): string[] {
  return [...svg.matchAll(/<path[^>]*\bd="([^"]+)"/g)].map((m) => m[1]);
}

/** 转成项目规矩：绝对命令 + 圆弧变贝塞尔 + 两位小数 */
function convert(d: string): string {
  const abs = svgpath(d).unarc().unshort().abs().toString();
  const rounded = abs
    .replace(/-?\d+\.?\d*(?:e[-+]?\d+)?/g, (m) => {
      const v = Math.round(parseFloat(m) * 100) / 100;
      return String(Object.is(v, -0) ? 0 : v);
    })
    .replace(/([MLCQZ])\s+/g, '$1');
  return expandImplicitCommands(rounded);
}

/**
 * 把省略了命令字母的连续参数展开成显式命令。
 *
 * `svgpath.abs()` 的输出遵守 SVG 规范：**同一个命令可以省略后续的命令字母**，
 * 例如 `C3 16.97 7.03 21 12 21 16.97 21 21 16.97 21 12` 是两段三次贝塞尔。
 *
 * 但 `scripts/svg-raster.ts` 的解析器与项目「每条命令都写字母」的规矩都要求显式，
 * 而省略形式在源码里也没法一眼看出「这里其实是两段曲线」。
 *
 * 做法：按**命令 + 定长参数**解析，而不是按字符切。`svgpath.abs()` 只会输出
 * M / L / C / Q / Z 这五种，所以元数是固定的：M/L=2、C=6、Q=4、Z=0。
 */
function expandImplicitCommands(path: string): string {
  // svgpath 的 abs() 不把 H / V 转成 L（它只保证坐标是绝对的），
  // 所以这里必须认得它们——漏掉 H / V 会让参数被切错位（真实踩过：
  // shield-check 的 `V6` 被当成未知命令跳过，之后整条路径歪掉）
  const ARITY: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, Z: 0 };

  // 先切成「命令字母」与「数字」两种 token
  const tokens = path.match(/[A-Za-z]|-?[0-9]+(?:\.[0-9]+)?/g) ?? [];

  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    const arity = ARITY[token];
    if (arity === undefined) {
      // 不认识的命令（不该出现）：跳过，不要把它当数字用
      i++;
      continue;
    }
    i++; // 吃掉命令字母
    if (arity === 0) {
      out.push(token);
      continue;
    }
    // 同一个命令可以连续出现多组参数，每组都要补上命令字母
    let cmd = token;
    while (i < tokens.length && ARITY[tokens[i]] === undefined) {
      const nums = tokens.slice(i, i + arity);
      if (nums.length < arity) break;
      out.push(cmd + nums.join(' '));
      i += arity;
      // M 之后的隐式参数在 SVG 规范里是 L（moveto 后跟 lineto）
      if (cmd === 'M') cmd = 'L';
    }
  }
  return out.join('');
}

const only = process.argv.slice(2);
const wanted = only.length > 0 ? ICONS.filter((n) => only.includes(n)) : ICONS;

for (const name of wanted) {
  const svg = fetchSvg(name);
  if (!svg.includes('<svg')) {
    console.error(`拉不到 ${name}（检查网络或图标名）`);
    continue;
  }
  console.log(`
// ---- ${name} ----`);
  console.log('source: lucide/' + name);
  for (const d of paths(svg)) console.log(convert(d));
}
