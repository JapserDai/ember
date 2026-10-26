/**
 * 日记的纯规则（domain 层：不碰 React、不碰数据库、不读系统时间）
 *
 * 「日记」与「复盘」的区别，决定了这里的每一条规则：
 *   - 复盘是一周 / 一个月的总结，有固定问题、有统计；
 *   - 日记是一天一段自己写的字，想写什么写什么，也可以什么都不写。
 *
 * 所以这里只有两件事：把一段话收拾干净、把日期拼成给人看的样子。
 */

/**
 * 一天的日记最多写多少字。
 *
 * 与 `REVIEW_FREE_MAX`（200）不同：那是一个问题和自由输入的上限，
 * 这里是「一整天想说的话」，给得宽一些。但也不能无限——
 * 它是存进 SQLite 的一列，且要为「日记页的历史列表只显示首行」留出余地。
 *
 * ---- D65 起它不再是一个常数，而是三档可选的默认值 ----
 *
 * 用户在「设置 → 日记」里可以选 500 / 2000 / 5000。这个常量仍然是
 * **默认值**与**兜底值**：`normalizeJournalBody` 收一个可选的上限参数，
 * 不传时就用它。这样：
 *   1. 纯函数仍然可测（不依赖库）；
 *   2. 任何忘了传上限的调用点，行为与 D65 之前完全一致。
 *
 * 为什么不把上限做成一个全局可变变量：`domain` 层不许有状态（HANDOFF §2.3），
 * 而一个「读一次就变」的模块级变量会让同一次运行里的不同调用点
 * 用不同的上限——那种 bug 只会在用户改完设置之后才出现。
 */
export const JOURNAL_MAX = 2000;

/**
 * 允许用户把上限调到多高。
 *
 * 5000 而不是无限：一天的日记写 5000 字已经远超「一句话就够」的定位，
 * 而再往上会让备份文件与历史列表的摘要计算都变得没必要地重。
 * 这也是 `domain/journalPrefs.ts` 里那三档选项的上界。
 */
export const JOURNAL_MAX_HARD = 5000;

/**
 * 规范化一段日记。
 *
 * - 去首尾空白；
 * - 行尾空白去掉（全角空格也去，用户从别处粘贴时常见）；
 * - 连续空行压成一个（保留分段，这本来就是一小段话）；
 * - 按 `JOURNAL_MAX` 截断。
 *
 * 为什么只在**行尾**去空白、不动行首：
 * 用户可能故意用缩进分段。行首一去掉，整段话的呼吸感就没了。
 *
 * 为什么不过滤禁用词：
 * 这是用户自己写的字。与 `domain/review.ts` 的立场一致——
 * 禁用词表管的是 **App 说的话**，不管用户说的话。
 */
export function normalizeJournalBody(input: unknown, maxLength: number = JOURNAL_MAX): string {
  if (typeof input !== 'string') return '';

  const cleaned = input
    .replace(/[ \t　]+$/gm, '') // 行尾空白（含全角空格）
    .replace(/\n{3,}/g, '\n\n') // 三个以上换行 → 一个空行
    .trim();

  /*
   * 按**码点**截断，不按 `slice` 的码元。
   *
   * emoji 在 JS 里占两个码元，`slice(0, 2000)` 正好切在中间时会留下一个
   * 孤立代理字符——它存进 SQLite、再读出来显示成一个 `�`，而用户看到的是
   * 「我写的东西坏了」。`domain/profile.ts` 的名字长度也是按码点数，
   * 这里跟着它走，两处口径一致。
   *
   * 代价：`TextInput` 的 `maxLength` 按码元算，所以理论上可以多打半个 emoji，
   * 保存时被这里截掉。那是「截断」而不是「产生坏字符」，可以接受。
   */
  const codePoints = Array.from(cleaned);
  // 上限先钳到 [1, JOURNAL_MAX_HARD]：传 0 或负数会让「一天的日记」变成空串，
  // 传一个天文数字会让 SQLite 里塞进一段不该塞的东西
  const limit = Number.isFinite(maxLength)
    ? Math.min(JOURNAL_MAX_HARD, Math.max(1, Math.trunc(maxLength)))
    : JOURNAL_MAX;
  return codePoints.length > limit
    ? codePoints.slice(0, limit).join('')
    : cleaned;
}

/**
 * 这一天的日记算不算「写过了」。
 *
 * 空串（或全是空白）等于没写。界面据此决定：
 * 显示「写一句」还是「改一句」、历史列表里要不要列出这一天。
 */
export function hasJournalContent(body: string | null | undefined): boolean {
  return typeof body === 'string' && body.trim().length > 0;
}

/**
 * 历史列表里一行摘要：取第一行非空文字。
 *
 * 为什么不截断到固定字数：截断该由**界面**按宽度做（`numberOfLines`），
 * 而不是在这里按字数猜。中英文混排时「多少个字能放下」不是一个定值。
 */
export function journalSummary(body: string): string {
  const firstLine = body
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ?? '';
}
