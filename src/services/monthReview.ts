/**
 * 月复盘（阶段 3 第 3 条）。
 *
 * 规则在 `domain/monthReview.ts`（纯函数：该写哪个月、月末最后一个周末、
 * 摘要怎么算）。这里只做编排与取数。
 *
 * ---- 与周复盘的分工 ----
 *
 *   周复盘：写。三个问题，一张空白的纸。
 *   月复盘：看。数字、五维变化、目标进展，加一句可选的总结。
 *
 * 两者共用 `reviews` / `month_reviews` 两张表，也共用「跳过不惩罚」这条规矩：
 * 这个文件里没有「连续 N 个月」「还有 X 个月没写」这类计数。
 */
import { runInTransaction } from '../db/client';
import { listCheckinsByTaskRange } from '../db/repo/checkins';
import { listGoals } from '../db/repo/goals';
import { getSettings } from '../db/repo/settings';
import { listActiveTasks, listTasks } from '../db/repo/tasks';
import {
  deleteMonthReview,
  getMonthReview,
  listMonthReviewKeys,
  listMonthReviews,
  upsertMonthReview,
} from '../db/repo/reviews';
import { ATTRIBUTE_LABEL } from '../domain/balance';
import { effectiveToday } from '../domain/date';
import {
  describeMonth,
  formatMonthLabel,
  isMonthComplete,
  monthBounds,
  monthKeyOfDate,
  normalizeMonthNote,
  pickDefaultMonth,
  shouldOfferMonthReview,
  summarizeMonth,
  type MonthStats,
} from '../domain/monthReview';

/** 月复盘页需要的一整份数据 */
export interface MonthReviewView {
  /** 要写的那个月（YYYY-MM）。null 表示最近两个月都写过了 */
  monthKey: string | null;
  /** 展示标签，例如「2026 年 9 月」 */
  label: string;
  /** 已经写过的正文。没写过是空串 */
  note: string;
  /** 这个月是否已经写过 */
  written: boolean;
  /** 这个月是否已经过完（决定措辞） */
  complete: boolean;
  stats: MonthStats;
  summary: string | null;
  updatedAt: number | null;
}

/** 回忆页要的一条月复盘 */
export interface MonthHistoryItem {
  monthKey: string;
  label: string;
  note: string;
  /** 一行摘要（有记录时才有） */
  summary: string | null;
  updatedAt: number;
}

/**
 * 取一个月的打卡事实，算成统计。
 *
 * 与周复盘同一个口径：活跃任务 + 已完成的待办一起查，
 * 否则这月做完的待办会从这个月的回顾里消失。
 */
function collectMonthStats(monthKey: string, today: string): MonthStats {
  const { start, end } = monthBounds(monthKey);

  const tasks = [...listActiveTasks(), ...listTasks({ status: 'done' })];

  const facts: Array<{
    date: string;
    title: string;
    attributeLabel: string;
    attrXpAwarded: number;
  }> = [];

  for (const task of tasks) {
    const checkins = listCheckinsByTaskRange(task.id, start, end);
    for (const checkin of checkins) {
      if (checkin.localDate > today) continue;
      facts.push({
        date: checkin.localDate,
        title: task.title,
        attributeLabel: ATTRIBUTE_LABEL[checkin.attrKey] ?? '',
        attrXpAwarded: checkin.attrXpAwarded,
      });
    }
  }

  // 目标的进展。只用两个数：现在还有几个进行中、这个月完成了几个。
  // 不报「这个月新增了几个目标」——那不是回顾，是 KPI。
  let active = 0;
  let doneThisMonth = 0;
  try {
    const goals = listGoals();
    for (const goal of goals) {
      if (goal.status === 'active') active += 1;
      if (goal.status === 'done' && goal.completedAt !== null) {
        if (monthKeyOfDate(localDateOf(goal.completedAt)) === monthKey) doneThisMonth += 1;
      }
    }
  } catch (err) {
    // 目标读不出来不该让整页崩：月复盘的主体是打卡数字
    console.warn('[Ember] 读取目标失败，月复盘里不显示目标进展', err);
  }

  return summarizeMonth(monthKey, facts, { active, doneThisMonth });
}

/**
 * 毫秒时间戳 → 本地日期 YYYY-MM-DD。
 *
 * 为什么不用 `toISOString().slice(0,10)`：那个算的是 **UTC** 日期。
 * 东八区晚上 10 点完成的目标，ISO 会算成前一天（甚至上个月末）。
 * 目标完成的「哪个月」应该按用户看到的日期算，所以用本地年月日。
 */
function localDateOf(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 读月复盘页的数据。
 *
 * 失败时抛错（与其它取数函数一致）：返回空视图会被渲染成
 * 「这个月你什么都没做」，而实际是读库出问题了。
 */
export function getMonthReviewView(nowMs: number = Date.now()): MonthReviewView {
  const settings = getSettings();
  const { today } = effectiveToday(nowMs, settings.day_start_hour, settings.last_settled_date);

  const writtenMonths = listMonthReviewKeys();
  const monthKey = pickDefaultMonth(today, writtenMonths);

  if (!monthKey) {
    return {
      monthKey: null,
      label: '',
      note: '',
      written: false,
      complete: false,
      stats: summarizeMonth('', []),
      summary: null,
      updatedAt: null,
    };
  }

  const row = getMonthReview(monthKey);
  const stats = collectMonthStats(monthKey, today);

  return {
    monthKey,
    label: formatMonthLabel(monthKey),
    note: row?.note ?? '',
    written: row !== null,
    complete: isMonthComplete(monthKey, today),
    stats,
    summary: describeMonth(stats),
    updatedAt: row?.updated_at ?? null,
  };
}

/** 保存结果 */
export type SaveMonthResult =
  | { ok: true; monthKey: string; cleared: boolean }
  | { ok: false; message: string };

/**
 * 保存月复盘。
 *
 * 与周复盘同一条规矩：**正文全空 = 清掉这一行**。
 * 留一行空正文在库里没有意义（界面上它与「没写过」一模一样）。
 */
export function saveMonthReview(monthKey: string, note: unknown): SaveMonthResult {
  return runInTransaction(() => {
    const text = normalizeMonthNote(note);

    if (text.length === 0) {
      deleteMonthReview(monthKey);
      return { ok: true as const, monthKey, cleared: true };
    }

    upsertMonthReview(monthKey, text);
    return { ok: true as const, monthKey, cleared: false };
  });
}

/**
 * 回忆页要的月复盘历史（按月份倒序）。
 *
 * 只列真的写过正文的月份。空行在保存时就被删了，这里再过滤一遍是保险。
 */
export function listMonthReviewHistory(): MonthHistoryItem[] {
  const items: MonthHistoryItem[] = [];

  for (const row of listMonthReviews()) {
    const note = row.note ?? '';
    if (note.length === 0) continue;

    items.push({
      monthKey: row.month_key,
      label: formatMonthLabel(row.month_key),
      note,
      summary: null,
      updatedAt: row.updated_at,
    });
  }

  return items;
}

/**
 * 这个月现在该不该出现月复盘入口。
 *
 * 返回月份键或 null。界面用它决定要不要在回忆页给一个入口。
 * **不催**：即使返回了，也只是多一行安静的入口，不弹窗、不加红点。
 */
export function offeredMonthReview(nowMs: number = Date.now()): string | null {
  try {
    const settings = getSettings();
    const { today } = effectiveToday(nowMs, settings.day_start_hour, settings.last_settled_date);
    return shouldOfferMonthReview(today, listMonthReviewKeys());
  } catch (err) {
    console.warn('[Ember] 读取月复盘状态失败', err);
    return null;
  }
}
