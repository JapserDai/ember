/**
 * 重复规则：判断一个任务在某个业务日「该不该出现」。
 *
 * 为什么单独成文件：
 * 「今天该做哪些事」是这个 App 最核心的查询。规则散落在 UI 或 SQL 里会失控，
 * 而且没法写单元测试。这里只接收纯数据，返回布尔值，不碰数据库。
 *
 * 支持的 6 种规则（与 tasks.recurrence 的 CHECK 约束一致）：
 *   daily         每天
 *   weekly_days   每周固定几天
 *   monthly_days  每月固定几号
 *   every_x_days  每 N 天（从锚点日起算）
 *   weekly_times  每周 N 次（灵活，不限具体哪天）
 *   once          一次性
 */

import { addDays, dayOfMonth, daysInMonth, diffDays, isoWeekday, startOfWeek } from './date';

/** 重复规则类型 */
export type RecurrenceKind =
  | 'daily'
  | 'weekly_days'
  | 'monthly_days'
  | 'every_x_days'
  | 'weekly_times'
  | 'once';

/** 任务类型 */
export type TaskKind = 'habit' | 'todo' | 'reward';

/** 任务状态 */
export type TaskStatus = 'active' | 'paused' | 'done' | 'archived';

/**
 * 排期判断需要的最小任务形状。
 *
 * 故意只声明「用得到的字段」，这样数据库查出来的行可以直接传进来，
 * 不需要在 repo 层再做一次映射。字段名用驼峰，由 repo 层负责从下划线转换。
 */
export interface SchedulableTask {
  type: TaskKind;
  recurrence: RecurrenceKind;
  /** 原始 JSON 字符串，或已解析的对象；两种都接受 */
  recurrenceConfig?: string | Record<string, unknown> | null;
  /** every_x_days 的锚点业务日 */
  anchorDate?: string | null;
  /** every_x_days 的间隔天数（1–365） */
  intervalN?: number | null;
  /** weekly_times 的每周目标次数（1–7） */
  weeklyTarget?: number | null;
  /** 生效业务日（含） */
  startDate: string;
  /** 结束业务日（含），null 表示不结束 */
  endDate?: string | null;
  status: TaskStatus;
  /** 软删除时间戳，非空即视为已删除 */
  deletedAt?: number | null;
}

/** 解析后的重复配置。只保留 v0.1 认识的字段，多余的忽略 */
interface ParsedConfig {
  /** weekly_days / monthly_days 用到的日期数组 */
  days: number[];
}

/**
 * 解析 recurrence_config。
 *
 * 数据库里是 JSON 文本，测试里可能直接传对象，所以两种都支持。
 * 解析失败一律当作空配置：宁可这个任务今天不显示，也不要让整个列表崩掉。
 */
function parseConfig(raw: SchedulableTask['recurrenceConfig']): ParsedConfig {
  if (!raw) return { days: [] };

  let obj: unknown = raw;
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { days: [] };
    }
  }

  if (!obj || typeof obj !== 'object') return { days: [] };
  const days = (obj as { days?: unknown }).days;
  if (!Array.isArray(days)) return { days: [] };

  // 去重 + 只保留正整数：脏数据（字符串、小数、重复）在这里统一清理
  const clean = Array.from(
    new Set(days.filter((d): d is number => Number.isInteger(d) && (d as number) > 0))
  );
  return { days: clean };
}

/**
 * 判断任务在指定业务日是否处于「可打卡」区间。
 *
 * 这一层只做通用过滤：已删除、暂停、已归档、还没开始、已经结束，都不排期。
 * 已完成（done）的习惯也排除；一次性任务由 once 分支单独处理。
 */
function isWithinWindow(task: SchedulableTask, dateKey: string): boolean {
  if (task.deletedAt) return false;
  if (task.status === 'paused' || task.status === 'archived') return false;
  if (diffDays(task.startDate, dateKey) < 0) return false; // 还没开始
  if (task.endDate && diffDays(task.endDate, dateKey) > 0) return false; // 已结束
  return true;
}

/**
 * 计算 monthly_days 在某个月真正生效的「日号集合」。
 *
 * 两个必须处理的问题：
 * 1. 31 号在小月要落到该月最后一天（2 月 31 号 → 2 月 28/29 号）。
 *    否则「每月 31 号」的习惯在 2 月、4 月、6 月、9 月、11 月会整月消失。
 * 2. 去重。若配置是 [30, 31]，在 2 月两者都会落到 28 号；
 *    若不去重，「今天」页会同时出现两条同一个任务。
 *
 * 返回的是「本月真实存在的日号」集合，直接拿来和 dayOfMonth 比较。
 */
function effectiveMonthlyDays(days: number[], dateKey: string): Set<number> {
  const last = daysInMonth(dateKey);
  const result = new Set<number>();
  for (const d of days) {
    // 超过本月天数的日号，钳制到月末
    result.add(Math.min(d, last));
  }
  return result;
}

/**
 * 判断任务在指定业务日是否排期。
 *
 * 参数：
 * - task：任务（只要带排期相关字段即可）
 * - dateKey：业务日 "YYYY-MM-DD"
 * - weekStartsOn：1 = 周一（默认），0 = 周日
 * - weeklyDone：可选。该业务周内已完成的次数，用于 weekly_times 判断本周额度是否已满。
 *   不传则视为 0（额度未满），即「今天可以再记一次」。
 *
 * 返回 true 表示「今天这一项应该出现在待办列表里」。
 * 注意：这里只判断排期，不判断 max_per_day 之类的次数限制——那是 score.ts 的事。
 */
export function isScheduledOn(
  task: SchedulableTask,
  dateKey: string,
  weekStartsOn: number = 1,
  weeklyDone: number = 0
): boolean {
  if (!isWithinWindow(task, dateKey)) return false;

  switch (task.recurrence) {
    case 'daily':
      return true;

    case 'weekly_days': {
      // 配置里的 1–7 就是 ISO 星期：1 = 周一 ... 7 = 周日
      const { days } = parseConfig(task.recurrenceConfig);
      return days.includes(isoWeekday(dateKey));
    }

    case 'monthly_days': {
      const { days } = parseConfig(task.recurrenceConfig);
      if (days.length === 0) return false;
      return effectiveMonthlyDays(days, dateKey).has(dayOfMonth(dateKey));
    }

    case 'every_x_days': {
      const interval = Math.floor(task.intervalN ?? 0);
      if (interval <= 0 || !task.anchorDate) return false;

      const offset = diffDays(task.anchorDate, dateKey);
      // 锚点之前不排期；之后每 interval 天排一次（锚点当天算第 0 天）
      if (offset < 0) return false;
      return offset % interval === 0;
    }

    case 'weekly_times': {
      // 灵活任务：本周额度没满就每天都可做。
      // 不建周进度表，进度由 checkins 按业务周聚合后作为 weeklyDone 传进来。
      const target = Math.floor(task.weeklyTarget ?? 0);
      if (target <= 0) return false;
      return weeklyDone < target;
    }

    case 'once': {
      // 一次性任务（待办 / 奖励）：完成前一直留在列表里，
      // 所以只要在生效区间内就算排期；完成与否由 status === 'done' 排除。
      if (task.status === 'done') return false;
      return true;
    }

    default:
      return false;
  }
}

/**
 * 本周还剩几天（含今天）。
 *
 * 用来给「每周 N 次」的任务提示节奏：
 * 还剩 1 天时不必催，还剩 4 天时可以提醒「这周还有 3 次」。
 *
 * weekStartsOn = 1（周一）时，周日返回 1；周一返回 7。
 * 返回值范围恒为 1–7，不会出现 0（否则 UI 会出现「还剩 0 天」的羞辱式文案）。
 */
export function daysLeftInWeek(todayKey: string, weekStartsOn: number = 1): number {
  const weekStart = startOfWeek(todayKey, weekStartsOn);
  const weekEnd = addDays(weekStart, 6);
  return Math.max(1, diffDays(todayKey, weekEnd) + 1);
}

/**
 * 本周还剩几次「每周 N 次」的额度。
 *
 * 这只是个便利函数，不参与奖励计算。返回 0 表示本周已达标，
 * UI 应该显示「本周已完成」而不是催促。
 */
export function weeklyQuotaLeft(
  task: SchedulableTask,
  todayKey: string,
  weeklyDone: number
): number {
  const target = Math.floor(task.weeklyTarget ?? 0);
  return Math.max(0, target - Math.max(0, weeklyDone));
}

/**
 * 一次性任务的「是否已过期」判断。
 *
 * 待办没有 end_date 时不算过期——它们会一直留在列表里。
 * 只有显式设置了 end_date 且今天已过，才算过期（UI 用中性词「已收起」）。
 */
export function isExpiredOnce(task: SchedulableTask, todayKey: string): boolean {
  if (task.recurrence !== 'once') return false;
  if (!task.endDate) return false;
  return diffDays(task.endDate, todayKey) > 0;
}
