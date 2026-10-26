/**
 * 日历要读的事实（D57）。
 *
 * 首页的月历只回答一个问题：**「我哪天动过」**。
 * 它不写库、不标待办的截止日、也不允许在日历上新建东西——
 * 一旦能在日历上选日期来回填，等于把新建表单搬进了日历，
 * 而这一轮刚把待办削成「只添加、删除」两件事。
 *
 * ---- 为什么放在 services 而不是 domain ----
 *
 * `domain/calendar.ts` 只算「这个月长什么样」，不知道有没有记录。
 * 这里要把三张表（checkins / journal_entries / tasks）拼成一天的读数，
 * 跨表编排放 services（HANDOFF §2.3）。
 */
import { listCheckinsByDate, summarizeByDate } from '../db/repo/checkins';
import { getJournalEntry, listJournalDatesInRange } from '../db/repo/journal';
import { getTaskById } from '../db/repo/tasks';
import { daysInMonth, diffDays, formatDateLabel } from '../domain/date';

/** 月历上一格要画的东西。只保留「有没有」，不存明细 */
export interface MonthMarks {
  /** 月份键 YYYY-MM */
  month: string;
  /** 有记录的业务日集合。有打卡或有日记都算「动过」 */
  marked: Set<string>;
  /** 有记录的天数。折叠成一行时显示「有记录 12 天」 */
  activeDays: number;
}

/** 某一天的读数：点开一格之后显示的内容 */
export interface DayFacts {
  /** 业务日 YYYY-MM-DD */
  date: string;
  /** 这一天记了几笔 */
  checkinCount: number;
  /** 记的是哪几件事（去重后的任务名，最多 5 条） */
  taskTitles: string[];
  /** 这一天写过日记 */
  hasJournal: boolean;
  /** 日记的第一行（最多 40 字）。null 表示没写 */
  journalExcerpt: string | null;
}

/** 一天最多列几条任务名。再多用户也不会在日历里读，去日记页看更合适 */
const MAX_TASK_TITLES = 5;
/** 日记摘要的长度上限。日历那一块不是阅读区，是「有没有」的指示 */
const JOURNAL_EXCERPT_MAX = 40;

/** 月份键 → 这个月第一天与最后一天的日期键。闰年交给 Date 自己算 */
function monthBounds(month: string): { start: string; end: string } {
  const anchor = `${month}-01`;
  // 「下个月的第 0 天」就是本月最后一天，不用判断闰年
  const total = daysInMonth(anchor);
  return { start: anchor, end: `${month}-${String(total).padStart(2, '0')}` };
}

/**
 * 读一个月的记录摘要。
 *
 * 两次查询：打卡按日期聚合（一次 GROUP BY）+ 日记只取这个月的。
 * 不逐天查——一个月 31 天就是 31 次查询，而这张表在首页每次聚焦都会读一次。
 *
 * 读失败时**抛错**：日历显示成「这个月一天都没动过」是在骗用户，
 * 而实际状态可能完全相反。界面自己决定怎么兜底（只显示「暂时读不出来」）。
 */
export function getMonthMarks(month: string): MonthMarks {
  const { start, end } = monthBounds(month);

  const checkinDays = summarizeByDate(start, end);
  const journalDays = listJournalDatesInRange(start, end);

  const marked = new Set<string>();
  for (const day of checkinDays) marked.add(day.localDate);
  for (const day of journalDays) marked.add(day);

  return { month, marked, activeDays: marked.size };
}

/**
 * 读某一天发生了什么。
 *
 * 只在用户点开一格时调用，所以可以逐表查——这里不是渲染路径。
 *
 * 任务名取「当前」的标题，不是「当时」的标题：任务没有改名功能，
 * 而软删除的任务仍在表里（`getTaskById` 读得到），所以拿得到名字。
 * 读不到就跳过那一条，不留一个「（已删除）」的空壳。
 */
export function getDayFacts(date: string): DayFacts {
  const checkins = listCheckinsByDate(date);
  const journal = getJournalEntry(date);

  const seen = new Set<string>();
  const taskTitles: string[] = [];
  for (const checkin of checkins) {
    if (seen.has(checkin.taskId)) continue;
    seen.add(checkin.taskId);
    const task = getTaskById(checkin.taskId);
    if (!task) continue;
    taskTitles.push(task.title);
    if (taskTitles.length >= MAX_TASK_TITLES) break;
  }

  const body = journal?.body.trim() ?? '';
  const firstLine = body.split('\n')[0] ?? '';

  return {
    date,
    checkinCount: checkins.length,
    taskTitles,
    hasJournal: body.length > 0,
    journalExcerpt:
      firstLine.length === 0
        ? null
        : firstLine.length > JOURNAL_EXCERPT_MAX
          ? `${firstLine.slice(0, JOURNAL_EXCERPT_MAX)}…`
          : firstLine,
  };
}

/**
 * 「那天」的相对说法。日历点开一格时，标题上写「今天 / 昨天 / 10 月 12 日」。
 *
 * 只处理近三天：更远的日子说「上周二」需要用户自己换算，而具体的日期不会换算错。
 * 业务日口径：日历里点的永远是业务日，所以只跟业务日的今天比，不跟设备时钟比。
 */
export function relativeDayLabel(date: string, today: string): string {
  const delta = diffDays(today, date);
  if (delta === 0) return '今天';
  if (delta === 1) return '明天';
  if (delta === -1) return '昨天';
  return '';
}

/**
 * 日历上点开那一天的标题。
 *
 * 近三天说「今天 / 昨天」，其余用 `formatDateLabel`（「10 月 12 日 周一」）——
 * 同一句话在 App 里只有一个出处，日期格式不会两处不一样。
 */
export function dayTitle(date: string, today: string): string {
  const relative = relativeDayLabel(date, today);
  return relative.length > 0 ? relative : formatDateLabel(date);
}
