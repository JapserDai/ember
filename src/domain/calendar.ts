/**
 * 月历的纯计算（D57）。
 *
 * 只回答「这个月长什么样」：几行几列、每格是哪一天、上一格是几号。
 * **不知道**那天有没有记录——那是 services 的事。这样这个文件不需要库、
 * 不需要 React，改一下「周一还是一条日开头」也不用碰任何界面。
 *
 * ---- 为什么格子按周对齐，而不是 7 列硬塞 ----
 *
 * 月历的每一列必须永远是同一个星期几，否则「每周三写日记」的人没法竖着看。
 * 所以前面要留空（上月的位置），后面补齐到整周。
 */

import { addMonths, daysInMonth, isDateKey, isoWeekday } from './date';

/** 月历里的一格。`date` 为 null 表示这是个占位空格 */
export interface CalendarCell {
  /** 业务日 YYYY-MM-DD。null = 这一格不属于本月 */
  date: string | null;
  /** 是不是「本月」的那 28–31 天之一。非本月的格子淡着画 */
  inMonth: boolean;
}

/** 一个月的标题与格子 */
export interface CalendarMonth {
  /** 月份键 YYYY-MM。用它翻页，不用年月两个数字 */
  month: string;
  /** 中文标题，例如「2026 年 10 月」 */
  title: string;
  /** 表头七个字，按 weekStartsOn 排好 */
  weekdays: string[];
  /** 按行优先摊平的格子，长度是 7 的整数倍 */
  cells: CalendarCell[];
}

const WEEKDAY_NAMES = ['日', '一', '二', '三', '四', '五', '六'];

/** 由业务日取月份键：'2026-10-26' → '2026-10' */
export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/**
 * 月份键加减月份。
 *
 * 用「当月 1 号 + n 个月」再截回 YYYY-MM，而不是对年月做除法：
 * 12 月加一个月要进位到次年 1 月，手写取模一定有人写错一次（12 % 12 = 0 月）。
 */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const anchor = `${y}-${String(m || 1).padStart(2, '0')}-01`;
  return addMonths(anchor, n).slice(0, 7);
}

/** '2026-10' → '2026 年 10 月' */
export function monthTitle(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${y} 年 ${m} 月`;
}

/**
 * 生成一个月的格子。
 *
 * @param month       YYYY-MM
 * @param weekStartsOn 0 = 周日，1 = 周一。来自 settings.week_starts_on
 */
export function buildMonth(month: string, weekStartsOn: number = 1): CalendarMonth {
  const [y, m] = month.split('-').map(Number);
  const first = `${y}-${String(m || 1).padStart(2, '0')}-01`;
  // 非法月份键（手改过库里设置）退回本月：画错一个月比整页崩掉好
  const safeFirst = isDateKey(first) ? first : `${y}-01-01`;

  const total = daysInMonth(safeFirst);
  const ws = weekStartsOn === 0 ? 0 : 1;

  // 1 号是星期几 → 前面要垫几格
  const isoWd = isoWeekday(safeFirst); // 1..7
  const leading = ws === 1 ? isoWd - 1 : isoWd % 7;

  const cells: CalendarCell[] = [];

  // 本月之前：填上个月的最后几天。这几个格子要的是「位置对」，不要「能点」，
  // 所以 date 给 null——点它们没有任何意义，也不该有 hover 感
  for (let i = 0; i < leading; i += 1) {
    cells.push({ date: null, inMonth: false });
  }

  for (let day = 1; day <= total; day += 1) {
    cells.push({
      date: `${safeFirst.slice(0, 8)}${String(day).padStart(2, '0')}`,
      inMonth: true,
    });
  }

  // 补到整周。空位同样给 null，不填下个月的日子：
  // 填了就会有人点「下个月 3 号」发现它跳到了另一个月，那是一次没必要的困惑
  while (cells.length % 7 !== 0) {
    cells.push({ date: null, inMonth: false });
  }

  const weekdays = ws === 1
    ? ['一', '二', '三', '四', '五', '六', '日']
    : WEEKDAY_NAMES.slice();

  return { month: safeFirst.slice(0, 7), title: monthTitle(safeFirst.slice(0, 7)), weekdays, cells };
}
