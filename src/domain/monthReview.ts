/**
 * 月复盘（阶段 3 第 3 条）——纯规则。
 *
 * ---- 它和周复盘是什么关系 ----
 *
 * 周复盘是「这一周有什么想留着的」，一张空白的纸，三个问题。
 * 月复盘不一样：它主要是**看**，不是写。月末最后一个周末出现，
 * 把这一整个月的数字摆出来：有几天动过、五维变化、目标进展。
 *
 * 所以它的形态是「一份回顾 + 一句可选的总结」，而不是四个输入框。
 *
 * ---- 为什么展示这些、不展示那些 ----
 *
 * 展示：有几天动过、记了多少次、五维的变化、目标的进展、最稳的那件事。
 * 不展示：完成率、环比涨跌、排名、与上个月的对比结论。
 *
 * 「这个月比上个月少了 12 次」是一句评判——它把两个月的记录变成一条趋势线，
 * 而趋势线的另一端永远指向「你在退步」。所以这里**不做跨月对比**，
 * 每个月单独看。用户自己会想起来上个月怎么样，不需要 App 提醒他。
 *
 * ---- 为什么月复盘只允许写一段话 ----
 *
 * 周复盘已经问过三个具体问题了。月末再来三个问题，一个月就要写八个。
 * 所以月复盘只留一个「这个月想说的一句话」——可写可不写。
 *
 * 本文件是纯函数：不碰数据库、不读系统时间、不 import React。
 */
import { addDays, addMonths, daysInMonth, isDateKey } from './date';

/** 月复盘正文的上限 */
export const MONTH_NOTE_MAX = 200;

/** 一个月的键，YYYY-MM */
export function monthKeyOfDate(dateKey: string): string {
  return dateKey.slice(0, 7);
}

/** 月份的中文说法，例如「2026 年 10 月」 */
export function formatMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month)) return monthKey;
  return `${year} 年 ${month} 月`;
}

/** 这个月有几天 */
export function monthLength(monthKey: string): number {
  return daysInMonth(`${monthKey}-01`);
}

/** 这个月第一天 / 最后一天 */
export function monthBounds(monthKey: string): { start: string; end: string } {
  const start = `${monthKey}-01`;
  const end = `${monthKey}-${String(monthLength(monthKey)).padStart(2, '0')}`;
  return { start, end };
}

/** 上个月的键 */
export function previousMonthKey(monthKey: string): string {
  return monthKeyOfDate(addMonths(`${monthKey}-01`, -1));
}

/**
 * 这个月是不是已经过完了。
 *
 * 「过完」= 今天在这个月之后。与周复盘同一个口径：回顾只对结束的时间做。
 */
export function isMonthComplete(monthKey: string, today: string): boolean {
  if (!isDateKey(today)) return false;
  return today > monthBounds(monthKey).end;
}

/**
 * 这个月能不能写。
 *
 * 与周复盘同一条规矩：**不能写未来的月**，当月的可以写（用户可能想在
 * 月末最后一个周末就写，那时这个月还没结束）。
 */
export function canWriteMonthReview(monthKey: string, today: string): boolean {
  if (!isDateKey(today)) return false;
  return monthBounds(monthKey).start <= today;
}

/**
 * 默认要写哪个月。
 *
 * 优先「上个月」：月末最后一个周末，用户回顾的是刚过去的那个月。
 * 上个月写过了就退回「本月」；两个都写过就返回 null，界面不催。
 */
export function pickDefaultMonth(
  today: string,
  writtenMonths: readonly string[]
): string | null {
  const thisMonth = monthKeyOfDate(today);
  const lastMonth = previousMonthKey(thisMonth);

  const written = new Set(writtenMonths);
  if (!written.has(lastMonth)) return lastMonth;
  if (!written.has(thisMonth)) return thisMonth;
  return null;
}

/**
 * 月末最后一个周末是哪一天。
 *
 * 用来决定「这个月什么时候可以开始写月复盘」。
 * 规则：这个月最后一个周六。如果今天是那一天或之后，月复盘就该出现。
 *
 * 为什么是周六而不是周日：周日已经被周复盘占了（D38 之后的周提醒在周日 20 点），
 * 两个复盘挤在同一天晚上会互相抢。周六晚上写月复盘、周日晚上写周复盘，
 * 中间隔一天，而这两天本来都是一周里最松的时候。
 *
 * 边界：如果月末正好是周六，那就是它；如果是周日，取前一天（周六）。
 */
export function lastWeekendOfMonth(monthKey: string): string {
  const { end } = monthBounds(monthKey);
  const [y, m, d] = end.split('-').map(Number);
  // getUTCDay: 0=周日, 6=周六。用 UTC 构造避免本地时区把日期推错一天。
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  // 从月末往回退到最近的周六（weekday 6）
  const back = (weekday + 1) % 7; // 周日(0)→1, 周一(1)→2, …, 周六(6)→0
  return addDays(end, -back);
}

/**
 * 这个月现在该不该出现月复盘。
 *
 * 两条同时满足：
 *   1. 已经到（或过了）月末最后一个周六；
 *   2. 这个月还没写过。
 */
export function shouldOfferMonthReview(
  today: string,
  writtenMonths: readonly string[]
): string | null {
  const thisMonth = monthKeyOfDate(today);
  if (today < lastWeekendOfMonth(thisMonth)) {
    // 还没到月末那个周末。看看上个月是不是漏了——上个月漏了的话，
    // 补写入口仍然在，但不主动提示（那会变成一句欠账）。
    return null;
  }
  if (writtenMonths.includes(thisMonth)) return null;
  return thisMonth;
}

/**
 * 月复盘的统计摘要。
 *
 * ---- 为什么这里可以做「变化」而周复盘不做 ----
 *
 * 五维的**变化**是一个月里唯一有意义的量：它回答「这一个月我把时间
 * 花在哪几维了」。而它不构成评价——「心智涨了 12 点」没有好坏，
 * 它只是说你这个月的注意力在哪儿。
 *
 * 而「记录次数比上个月少」那种对比一律不做：那个数字没有独立意义，
 * 它的唯一用途就是变成一句「你在退步」。
 */
export interface MonthStats {
  monthKey: string;
  /** 这个月有几天有记录 */
  activeDays: number;
  /** 记录总条数 */
  checkins: number;
  /** 记录次数最多的那件事 */
  steadiest: string | null;
  /** 五维：这个月每一维涨了多少点（属性点，不是 XP） */
  attributeGains: Array<{ label: string; gained: number }>;
  /** 关联目标：进行中几个、这个月完成几个 */
  goalsActive: number;
  goalsDoneThisMonth: number;
}

/** 一条用于统计的打卡事实（services 层从库里取出来） */
export interface MonthFact {
  date: string;
  title: string;
  /** 这一条记录给哪个属性加的 XP（用于算点数变化） */
  attributeLabel: string;
  attrXpAwarded: number;
}

/** 属性 XP → 属性点：200 换 1 */
const XP_PER_POINT = 200;

/**
 * 把一个月的打卡事实算成摘要。
 *
 * 五维的「涨了多少点」直接由**这个月的打卡**累加算出，而不是读 player 表：
 * player 是历史累计，拿不到「这个月涨的」。用打卡算还有一个好处——
 * 它与统计页的口径天然一致（同一份事实）。
 */
export function summarizeMonth(
  monthKey: string,
  facts: readonly MonthFact[],
  goals: { active: number; doneThisMonth: number } = { active: 0, doneThisMonth: 0 }
): MonthStats {
  const { start, end } = monthBounds(monthKey);

  const days = new Set<string>();
  const byTitle = new Map<string, number>();
  const attrXp = new Map<string, number>();
  let checkins = 0;

  for (const fact of facts) {
    if (!fact || !isDateKey(fact.date)) continue;
    if (fact.date < start || fact.date > end) continue;

    checkins += 1;
    days.add(fact.date);
    if (fact.title) byTitle.set(fact.title, (byTitle.get(fact.title) ?? 0) + 1);
    if (fact.attributeLabel) {
      attrXp.set(
        fact.attributeLabel,
        (attrXp.get(fact.attributeLabel) ?? 0) + Math.max(0, fact.attrXpAwarded || 0)
      );
    }
  }

  let steadiest: string | null = null;
  let bestCount = 0;
  for (const [title, count] of byTitle) {
    if (count > bestCount || (count === bestCount && steadiest !== null && title < steadiest)) {
      steadiest = title;
      bestCount = count;
    }
  }

  // 五维按「涨的点数」降序；点数为 0 的不列（列出来是一排零，与统计页同一个理由）
  const attributeGains = [...attrXp.entries()]
    .map(([label, xp]) => ({ label, gained: Math.floor(xp / XP_PER_POINT) }))
    .filter((item) => item.gained > 0)
    .sort((a, b) => (b.gained !== a.gained ? b.gained - a.gained : a.label < b.label ? -1 : 1));

  return {
    monthKey,
    activeDays: days.size,
    checkins,
    steadiest,
    attributeGains,
    goalsActive: Math.max(0, goals.active),
    goalsDoneThisMonth: Math.max(0, goals.doneThisMonth),
  };
}

/**
 * 月摘要 → 一句人话。
 *
 * 与周复盘同一条立场：只描述事实，不评价、不做跨月对比。
 * 返回 null 表示不需要说什么（这个月一条记录都没有时也不说，
 * 因为「这个月你什么都没做」是一句指责）。
 */
export function describeMonth(stats: MonthStats): string | null {
  if (stats.checkins === 0) {
    return '这个月没有记录。空着的月份也是月份，下个月想动的时候再开始就行。';
  }

  const head = `这个月有 ${stats.activeDays} 天动过，记了 ${stats.checkins} 次。`;
  const steady = stats.steadiest ? `最常记的是「${stats.steadiest}」。` : '';
  return head + steady;
}

/**
 * 规范化月复盘的正文。
 *
 * 与周复盘的 `normalizeAnswers` 同一套处理（去行尾空白、压空行、按码点截断），
 * 只是只有一个字段。
 */
export function normalizeMonthNote(input: unknown): string {
  if (typeof input !== 'string') return '';
  const collapsed = input
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t\u3000]+$/u, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return Array.from(collapsed).slice(0, MONTH_NOTE_MAX).join('');
}
