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
 * 它是存进 SQLite 的一列，且要为「回忆页的历史列表只显示首行」留出余地。
 */
export const JOURNAL_MAX = 2000;

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
export function normalizeJournalBody(input: unknown): string {
  if (typeof input !== 'string') return '';

  const cleaned = input
    .replace(/[ \t　]+$/gm, '') // 行尾空白（含全角空格）
    .replace(/\n{3,}/g, '\n\n') // 三个以上换行 → 一个空行
    .trim();

  // 按字符截断。JS 的字符串长度对中文是「字数」，对 emoji 是代理对，
  // 极端情况下可能切在半截——但 2000 字的上限下，这个代价可接受，
  // 而按码点切会让上限的解释变复杂（用户数的是字）。
  return cleaned.slice(0, JOURNAL_MAX);
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
