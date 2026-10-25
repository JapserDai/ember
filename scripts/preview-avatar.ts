/**
 * 把七个像素头像打成 ASCII 点阵，肉眼验证形状。
 *
 * 用法：npx tsx scripts/preview-avatar.ts [id]
 *   例：npx tsx scripts/preview-avatar.ts          # 七只全部
 *       npx tsx scripts/preview-avatar.ts fox      # 只看狐狸
 *
 * 为什么需要它：`src/domain/avatar.ts` 里的网格是 16 行字符串，写错一格
 * 不会报错，只会画出一个歪东西；而人眼在 64px 里很难判断是「设计如此」
 * 还是「手滑多打了一个字符」。这个脚本把网格直接画出来，
 * 并且顺手检查三件必须成立的事：
 *
 *   1. **16 行 × 16 列**。行数或列数错了，画出来会被拉伸；
 *   2. **左右对称**。第 n 格必须等于第 15-n 格——手画的时候只写左半边再镜像，
 *      改一处不会只改半张脸；
 *   3. **有眼睛**。ink 角色必须出现，否则在 32px 下就是一团灰。
 *
 * 三种材质用三种字符区分（不是颜色——这里没有颜色，只有「这是什么材质」）：
 *   ██ ink    ▓▓ fur    ░░ light    ◻◻ dot    ▲▲ accent    ·· 透明
 *
 * 不参与打包。上一版的 path 光栅器（scripts/svg-raster.ts）仍然留着给
 * scripts/preview-tab-icons.ts 用——底栏那四个图标还是手写 path。
 */
import {
  AVATAR_GRID,
  AVATAR_OPTIONS,
  TRANSPARENT,
  avatarRoles,
  parseAvatarRuns,
  type AvatarOption,
} from '../src/domain/avatar';

/** 角色 → 点阵字符。与 domain/avatar.ts 的 ROLE_CHARS 一一对应 */
const ROLE_SYMBOL: Record<string, string> = {
  ink: '██',
  fur: '▓▓',
  light: '░░',
  dot: '◻◻',
  accent: '▲▲',
};

/** 网格字符 → 角色（与 domain/avatar.ts 的 ROLE_CHARS 必须一致） */
const CHAR_ROLE: Record<string, string> = {
  k: 'ink',
  b: 'fur',
  l: 'light',
  w: 'dot',
  a: 'accent',
};

/** 每只动物最多允许几格 accent（见 domain/avatar.ts 的画法约定第 5 条） */
const ACCENT_LIMIT = 8;

/** 检查一只头像，返回问题列表（空数组 = 没问题） */
function checkAvatar(option: AvatarOption): string[] {
  const problems: string[] = [];
  const grid = option.grid;

  if (grid.length !== AVATAR_GRID) {
    problems.push(`行数是 ${grid.length}，应该是 ${AVATAR_GRID}`);
  }

  grid.forEach((row, y) => {
    if (row.length !== AVATAR_GRID) {
      problems.push(`第 ${y} 行有 ${row.length} 列，应该是 ${AVATAR_GRID}`);
      return;
    }
    const mirrored = [...row].reverse().join('');
    if (row !== mirrored) {
      // 指出具体哪几格不对称，比只说「不对称」好查
      const bad: number[] = [];
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== mirrored[x]) bad.push(x);
      }
      problems.push(`第 ${y} 行左右不对称（第 ${bad.join('、')} 列）`);
    }
  });

  const roles = avatarRoles(grid);
  if (!roles.includes('ink')) problems.push('没有 ink：眼睛和轮廓会消失');

  // 每只动物只留一处 accent（见 domain/avatar.ts 的画法约定第 5 条）
  let accentCount = 0;
  for (const row of grid) {
    for (const char of row) if (CHAR_ROLE[char] === 'accent') accentCount++;
  }
  if (accentCount === 0) problems.push('没有 accent：嘴或鼻子会看不见');
  if (accentCount > ACCENT_LIMIT) {
    problems.push(`accent 有 ${accentCount} 格，超过上限 ${ACCENT_LIMIT}（见画法约定第 5 条）`);
  }

  return problems;
}

/** 打印一只 */
function printAvatar(option: AvatarOption): void {
  const problems = checkAvatar(option);
  const runs = parseAvatarRuns(option.grid);

  console.log(`\n--- ${option.label} (${option.id})  ${problems.length === 0 ? '✓' : '✗'}`);
  console.log(`    ${option.description}`);
  console.log(`    色块数 ${runs.length}（逐格画会是 ${option.grid.join('').split('').filter((c) => c !== TRANSPARENT).length}）`);

  for (const row of option.grid) {
    const line = [...row]
      .map((char) => (char === TRANSPARENT ? '··' : ROLE_SYMBOL[CHAR_ROLE[char]] ?? '??'))
      .join('');
    console.log(`    ${line}`);
  }

  if (problems.length > 0) {
    console.log('    问题：');
    for (const problem of problems) console.log(`      · ${problem}`);
  }
}

function main(): void {
  const wanted = process.argv[2];
  const options = wanted
    ? AVATAR_OPTIONS.filter((option) => option.id === wanted)
    : AVATAR_OPTIONS;

  if (options.length === 0) {
    console.error(`没有这个头像：${wanted}`);
    console.error(`可选：${AVATAR_OPTIONS.map((option) => option.id).join(' / ')}`);
    process.exitCode = 1;
    return;
  }

  for (const option of options) printAvatar(option);

  const failed = options.filter((option) => checkAvatar(option).length > 0);
  if (failed.length > 0) {
    console.error(`\n${failed.length} 只没通过检查：${failed.map((o) => o.id).join('、')}`);
    process.exitCode = 1;
  } else {
    console.log(`\n${options.length} 只全部通过检查。`);
  }
}

main();
