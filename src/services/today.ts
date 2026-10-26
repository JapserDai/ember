/**
 * 今日数据装配
 *
 * 首页要的东西横跨四张表：任务（有哪些）、打卡（做没做）、玩家（等级名字）、
 * 设置（日界、周起始、难度）。它既不是单表查询，也不是纯计算，所以放在服务层。
 *
 * 一条重要约定：**只查一次打卡表**。
 * 首页每条习惯都要显示自己的连胜，如果逐条查库就是 N+1；
 * 这里一次取出全部 (任务, 日期)，在内存里分组算连胜（domain/streak.ts）。
 * 一个人一年也就几百条记录，排序一遍是毫秒级的事。
 */
import { listActiveCheckinDates, type CheckinDatePair } from '../db/repo/checkins';
import { getPlayerSnapshot } from '../db/repo/player';
import { getGoalById } from '../db/repo/goals';
import { getSettings } from '../db/repo/settings';
import { listBridgeDays } from '../db/repo/streak';
import {
  getTaskById,
  listActiveTasks,
  listTasks,
  softDeleteTask,
  type Task,
} from '../db/repo/tasks';
import { DEFAULT_DAY_START_HOUR, diffDays, effectiveToday } from '../domain/date';
import { formatDueLabel } from '../domain/goals';
import { parseHomePrefs } from '../domain/homePrefs';
import { isScheduledOn, weekRange } from '../domain/recurrence';
import { summarizeDates, summarizeStreaks, type BridgeDay, type StreakSummary } from '../domain/streak';
import { canUndoCheckin } from './checkin';

/** 首页一条习惯的视图模型 */
export interface TodayTaskView {
  id: string;
  title: string;
  /** 该习惯自己的当前连胜。0 表示还没有，界面显示「第一天」 */
  streakDays: number;
  /** 今天是否已经记过 */
  done: boolean;
  /** 今天记过、且这一天还没结算 → 长按可以撤销 */
  canUndo: boolean;
}

/** 首页一条待办的视图模型 */
export interface TodayTodoView {
  id: string;
  title: string;
  /** 截止日的中文说法（「10 月 30 日」）。null 表示不限期 */
  dueLabel: string | null;
  /** 截止日已过。卡片据此把这一行元信息染成红色 */
  overdue: boolean;
  /** 备注。null 表示没写 */
  notes: string | null;
  /** 归属目标名。null 表示没挂目标 */
  goalTitle: string | null;
}

/** 首页需要的全部数据 */
export interface TodayData {
  /** 当前业务日 YYYY-MM-DD。撤销时要把它一起传下去 */
  today: string;
  dayStartHour: number;
  level: number;
  playerName: string;
  habits: TodayTaskView[];
  /**
   * 待办，最多 3 条。
   *
   * **D55 之后待办不再有「完成」这个状态**，所以这里只有还没归档的待办，
   * 没有 `done` / `canUndo` 两个字段。它们不进火带、不进「今天 N / M 件」，
   * 也不发 XP——它们是便签，不是任务。
   */
  todos: TodayTodoView[];
}

/**
 * 读日界的容错版本，给界面首帧用。
 *
 * 首帧必须同步拿到一个数字才能渲染，读库失败就退回默认 4 点，
 * 而不是让整页白屏——差几个小时的日界，比看不到页面好得多。
 */
export function getSafeDayStartHour(): number {
  try {
    return getSettings().day_start_hour;
  } catch {
    return DEFAULT_DAY_START_HOUR;
  }
}

/**
 * 读今日数据。
 *
 * 失败时**抛错**而不是返回空数组：空数组会被渲染成「今天空着」，
 * 那是在骗用户——实际是读库出问题了。界面自己决定怎么兜底。
 */
/**
 * 把一条待办任务装配成视图。
 *
 * 截止日、备注、归属目标这三样只在待办上有意义（习惯是「每天做」，
 * 给它一个截止日反而自相矛盾），所以放在这里而不是塞进 TodayTaskView。
 *
 * 过期判断用业务日而不是当前时刻：一个「今天到期」的待办在晚上 11 点
 * 不该变红——它还没到期，今天还没过完。
 *
 * 这里不再有 `done`：待办没有完成状态（D55）。一个待办做完了，删掉它。
 */
function toTodoView(task: Task, today: string): TodayTodoView {
  const overdue = task.dueDate !== null && diffDays(task.dueDate, today) > 0;

  return {
    id: task.id,
    title: task.title,
    dueLabel: formatDueLabel(task.dueDate, today),
    overdue,
    notes: task.notes && task.notes.trim().length > 0 ? task.notes.trim() : null,
    goalTitle: task.goalId ? (getGoalById(task.goalId)?.title ?? null) : null,
  };
}

export function getTodayData(nowMs: number = Date.now()): TodayData {
  const settings = getSettings();
  const dayStartHour = settings.day_start_hour;
  const weekStartsOn = settings.week_starts_on;
  // 首页偏好只影响「显示几条」，不影响任何数值。解析失败时它自己退回默认值
  const { todoLimit } = parseHomePrefs(settings.home_prefs);

  // 读与写用同一个业务日口径：effectiveToday 会挡住「系统时间被调回过去」
  const { today } = effectiveToday(nowMs, dayStartHour, settings.last_settled_date);

  /*
   * 候选任务：活跃的 + 今天已经完成过的习惯。
   *
   * 为什么要加上 `status = 'done'` 那一批：**习惯**本身不改任务状态，
   * 所以这一批在 D55 之前只有「今天勾掉的待办」。待办不再有完成态之后，
   * 这一批理论上永远是空的——但留着它比删掉安全：目标页的手动完成
   * （`completeGoal` 那条路）会 write task.status = 'done'，
   * 那些任务的历史打卡仍然要在首页被看见，否则他们的连胜会「凭空消失」。
   */
  const tasks = [...listActiveTasks(), ...listTasks({ status: 'done' })];

  // 一次取全，后面全部在内存里算
  const pairs = listActiveCheckinDates(today);
  const facts = pairs.map((pair) => ({ key: pair.taskId, date: pair.localDate }));
  /*
   * 桥接日（宽限券 / 修复）。
   *
   * 读失败时**退回空数组**而不是让首页崩掉：桥接日只影响「连胜数字大一点还是小一点」，
   * 不影响用户能不能打卡。而如果这里抛错，整页会变成「今天的数据读不出来」——
   * 一个装饰性的表不该有这种权力。
   * 代价是：库真的坏掉时，连胜会暂时显示得短一些（少了宽恕的那几天）。
   */
  let bridges: BridgeDay[] = [];
  try {
    bridges = listBridgeDays();
  } catch (err) {
    console.warn('[Ember] 读取连胜桥接日失败，本次按没有桥接计算', err);
  }
  const { byKey } = summarizeStreaks(facts, today, bridges);

  // 今天有记录的 taskId 集合
  const doneToday = new Set<string>();
  for (const pair of pairs) {
    if (pair.localDate === today) doneToday.add(pair.taskId);
  }

  const undoAllowed = canUndoCheckin(today, settings.last_settled_date);
  const week = weekRange(today, weekStartsOn);

  const habits: TodayTaskView[] = [];
  const openTodos: TodayTodoView[] = [];

  for (const task of tasks) {
    const isDone = doneToday.has(task.id);

    if (task.type === 'habit') {
      const weeklyDone =
        task.recurrence === 'weekly_times'
          ? countInWeek(pairs, task.id, week.start, week.end)
          : 0;

      // 已经做过的习惯即使今天不在排期里也要显示（撤销后要能看见它）
      if (!isDone && !isScheduledOn(task, today, weekStartsOn, weeklyDone)) continue;

      habits.push({
        id: task.id,
        title: task.title,
        streakDays: byKey.get(task.id)?.current ?? 0,
        done: isDone,
        canUndo: isDone && undoAllowed,
      });
      continue;
    }

    if (task.type === 'todo') {
      /*
       * 待办只在「还没归档」时出现（D55）。
       *
       * 早先这里还会把 `status === 'done'` 的待办（今天刚勾掉的）也读出来，
       * 为的是留一个长按撤销的入口。现在待办没有完成态了，
       * 所以那一路连同 `listTasks({ status: 'done' })` 在下面的候选集里也一起去掉。
       */
      if (task.status === 'active' && isScheduledOn(task, today, weekStartsOn, 0)) {
        openTodos.push(toTodoView(task, today));
      }
    }

    // reward 任务（用余烬兑换）在 v0.1 没有界面入口，首页不展示
  }

  const player = getPlayerSnapshot();

  return {
    today,
    dayStartHour,
    level: player.level,
    playerName: player.displayName,
    habits,
    /*
     * 待办条数由首页偏好决定（D62，默认 3）。
     *
     * `todoLimit === null` 表示「全部」——不 slice 就是全部，
     * 不要写成 `slice(0, Number.MAX_SAFE_INTEGER)`：那个数不是长度上限的语义，
     * 而且读代码的人要停下来想一下。
     *
     * 未完成排在前面这件事现在不存在了——它们全都是未完成的。
     */
    todos: todoLimit === null ? openTodos : openTodos.slice(0, todoLimit),
  };
}

/**
 * 我的页：整体连胜。
 *
 * 与首页的习惯连胜是同一套算法，只是不分组——「有记录的业务日」
 * 不分是哪个习惯，都算你这一天动过。
 */
export function getOverallStreak(nowMs: number = Date.now()): StreakSummary {
  const settings = getSettings();
  const { today } = effectiveToday(nowMs, settings.day_start_hour, settings.last_settled_date);
  const pairs = listActiveCheckinDates(today);

  // 桥接日算在「整体」里，不算在单条习惯里：宽限券桥接的是
  // 「你这一天有没有动」，而不是「你那个习惯做了没有」。
  let bridges: BridgeDay[] = [];
  try {
    bridges = listBridgeDays();
  } catch (err) {
    console.warn('[Ember] 读取连胜桥接日失败，本次按没有桥接计算', err);
  }

  return summarizeDates(
    pairs.map((pair) => pair.localDate),
    today,
    bridges
  );
}

/**
 * 某一条任务自己的连胜天数。
 *
 * 首页每条习惯已经显示了连胜，但那是**渲染时**算的。记完一笔之后要判断
 * 「这一次是不是刚好到了 3 / 7 / 30 / 100 天」，得在写库之后重新算一次——
 * 界面上的旧值还是记之前那个数。
 *
 * 只查一次库、只算一个任务：调用发生在用户点完之后，不是渲染期间。
 */
export function getTaskStreak(taskId: string, nowMs: number = Date.now()): number {
  const settings = getSettings();
  const { today } = effectiveToday(nowMs, settings.day_start_hour, settings.last_settled_date);
  const pairs = listActiveCheckinDates(today);
  return summarizeStreaks(
    pairs
      .filter((pair) => pair.taskId === taskId)
      .map((pair) => ({ key: pair.taskId, date: pair.localDate })),
    today
  ).byKey.get(taskId)?.current ?? 0;
}

/**
 * 删掉一件事。
 *
 * 软删除：行还在表里，只是 `deleted_at` 有值，所有查询都看不见它。
 * 为什么不做物理删除：`checkins.task_id` 是 RESTRICT 外键，真删会让历史打卡
 * 变成孤儿，而打卡记录是 XP 的唯一来源，不能丢。删掉一件事，
 * 你过去为它花的时间仍然算数。
 *
 * 已经打过卡的习惯也可以删：删的是「以后还要不要做」，不是「过去做没做过」。
 *
 * 返回 true 表示确实删掉了；false 表示这个 id 已经不在（重复点、或别的页面先删了）。
 */
export function deleteTask(taskId: string): boolean {
  const task = getTaskById(taskId);
  if (!task) return false;
  softDeleteTask(taskId);
  return true;
}

/** 数某个任务在某段业务日内有几天有记录（「每周 N 次」的额度用） */
function countInWeek(
  pairs: readonly CheckinDatePair[],
  taskId: string,
  start: string,
  end: string
): number {
  let n = 0;
  for (const pair of pairs) {
    if (pair.taskId === taskId && pair.localDate >= start && pair.localDate <= end) n += 1;
  }
  return n;
}
