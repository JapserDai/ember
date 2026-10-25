/**
 * 目标的展示规则（纯函数）
 *
 * 目标本身在 `db/repo/goals.ts`。这里只放两条「怎么摆、怎么写」的规则：
 * 排序与截止日的说法。它们不碰数据库，可以脱离设备单独验证。
 *
 * 为什么排序要单独拎出来：它是一条产品判断，不是查询细节。
 * 「有截止日的在前、近的在上」讲的是「哪件事更靠近眼前」，
 * 而不是「按哪个字段 ORDER BY」。写在 SQL 里，以后想改就得改查询；
 * 写在这里，改的是一行 sort 比较。
 */

import { parseLocalDate } from './date';

/** 排序需要的最小形状 */
export interface SortableGoal {
  /** 截止日 YYYY-MM-DD，null 表示不限期 */
  dueDate: string | null;
  /** 创建时间戳，用于没有截止日时的先后 */
  createdAt: number;
}

/**
 * 进行中目标的顺序。
 *
 * 规则（docs/02 §3.2）：
 *   1. 有截止日的排在前面；
 *   2. 有截止日的按日期升序，近的在上；
 *   3. 没有截止日的排在后面，按创建时间倒序（新写的在上）。
 *
 * 不做「逾期」判断、不做倒计时——过期这件事不在这一页被提及。
 *
 * 返回新数组，不改入参：调用方常常直接把它交给渲染。
 */
export function sortGoalsForList<T extends SortableGoal>(goals: readonly T[]): T[] {
  return [...goals].sort((a, b) => {
    const aHas = a.dueDate != null;
    const bHas = b.dueDate != null;

    if (aHas && bHas) {
      // YYYY-MM-DD 的字典序就是日期序
      if (a.dueDate! !== b.dueDate!) return a.dueDate! < b.dueDate! ? -1 : 1;
      return b.createdAt - a.createdAt;
    }
    if (aHas !== bHas) return aHas ? -1 : 1;
    return b.createdAt - a.createdAt;
  });
}

/**
 * 截止日的中文说法。
 *
 * 同年只写月日（「12 月 31 日」），跨年补上年份（「2027 年 3 月 1 日」）——
 * 一句「1 月 5 日」在十二月读到会以为是五天后。
 *
 * 非法日期或空值返回 null，界面据此整行不显示，而不是显示一个空标签。
 */
export function formatDueLabel(dueDate: string | null, todayKey: string): string | null {
  if (!dueDate) return null;
  const parsed = parseLocalDate(dueDate);
  if (!parsed) return null;

  const today = parseLocalDate(todayKey);
  const sameYear = today ? today.year === parsed.year : false;

  return sameYear
    ? `${parsed.month} 月 ${parsed.day} 日`
    : `${parsed.year} 年 ${parsed.month} 月 ${parsed.day} 日`;
}

/**
 * 进度的一句话。
 *
 * total = 0 时返回 null：一个目标可以不挂任何任务，
 * 那时界面上根本不该出现「0 / 0」这种像在扣分的数字（docs/02 §3.2）。
 */
export function formatGoalProgress(done: number, total: number): string | null {
  if (total <= 0) return null;
  return `${Math.min(done, total)} / ${total} 件`;
}
