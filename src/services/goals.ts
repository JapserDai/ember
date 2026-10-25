/**
 * 目标服务层
 *
 * 目标页需要的东西跨三张表：目标（有哪些）、任务（挂了什么）、打卡（习惯今天做没做）。
 * 进度由 `db/repo/goals.ts` 现算，这里负责「把列表按展示规则摆好、把每个目标挂着的任务
 * 一起带出来」，以及两个跨越目标与任务的动作：挂任务、判断「关联的事是不是都做完了」。
 *
 * 为什么不塞进 repo：`goals.ts` 只做单表读写；一旦它开始拼任务与打卡，
 * 就变成了一个隐藏的查询层，改一处很难预料影响哪儿。
 */
import {
  attachTaskToGoal,
  computeGoalProgress,
  createGoal,
  deleteGoal,
  getGoalById,
  listGoals,
  listTaskIdsByGoal,
  updateGoal,
  type Goal,
  type GoalProgress,
} from '../db/repo/goals';
import { getSettings } from '../db/repo/settings';
import { getTaskById, listActiveTasks, listTasks, type Task } from '../db/repo/tasks';
import { DEFAULT_DAY_START_HOUR, effectiveToday } from '../domain/date';
import { formatDueLabel, formatGoalProgress, sortGoalsForList } from '../domain/goals';
import { isScheduledOn, weekRange } from '../domain/recurrence';
import { listActiveCheckinDates } from '../db/repo/checkins';

/** 目标页一条目标的视图模型 */
export interface GoalView {
  id: string;
  title: string;
  /** 为什么想走这一段。null 表示没写 */
  why: string | null;
  /** 截止日原文 YYYY-MM-DD。null 表示不限期。详情页编辑时要用它，不能用 dueLabel 反推 */
  dueDate: string | null;
  /** 截止日的中文说法。null 表示不限期 */
  dueLabel: string | null;
  /** 「3 / 5 件」。null 表示还没挂任务 */
  progressLabel: string | null;
  /** 关联任务总数。0 表示还没挂 */
  total: number;
  /** 已完成数 */
  done: number;
  /** 全部关联任务都做完了，且还没被标记完成 → 界面给一句询问 */
  allDone: boolean;
  status: 'active' | 'done';
}

/** 目标页全部数据 */
export interface GoalsData {
  today: string;
  /** 进行中，已按展示规则排好 */
  active: GoalView[];
  /** 已完成。默认折叠 */
  done: GoalView[];
}

/** 可以被挂到目标上的任务（标题 + 是否已挂到某个目标） */
export interface AttachableTask {
  id: string;
  title: string;
  /** 当前所属目标 id。null 表示还没挂 */
  goalId: string | null;
}

/**
 * 当前业务日。
 *
 * 读设置失败时退回默认日界：这一页的日期只用来决定截止日写不写年份，
 * 差几个小时不会改变结论，不值得为此让整页打不开。
 */
function currentToday(nowMs: number): string {
  try {
    const settings = getSettings();
    return effectiveToday(nowMs, settings.day_start_hour, settings.last_settled_date).today;
  } catch {
    return effectiveToday(nowMs, DEFAULT_DAY_START_HOUR, null).today;
  }
}

/** 把一个目标行 + 它的进度装配成界面用的视图 */
function toView(goal: Goal, today: string): GoalView {
  const progress: GoalProgress = computeGoalProgress(goal.id);
  return {
    id: goal.id,
    title: goal.title,
    why: goal.why,
    dueDate: goal.dueDate,
    dueLabel: formatDueLabel(goal.dueDate, today),
    progressLabel: formatGoalProgress(progress.done, progress.total),
    total: progress.total,
    done: progress.done,
    // 「都做完了」只在有任务、且还没标记完成时成立
    allDone: goal.status === 'active' && progress.total > 0 && progress.done >= progress.total,
    status: goal.status === 'done' ? 'done' : 'active',
  };
}

/**
 * 读目标页数据。
 *
 * 失败时抛错，由界面兜底——返回空数组会被渲染成「还没有目标」，
 * 那是在骗人。
 */
export function getGoalsData(nowMs: number = Date.now()): GoalsData {
  const today = currentToday(nowMs);
  const all = listGoals({ includeDone: true });

  const activeGoals = sortGoalsForList(all.filter((g) => g.status === 'active')).map((g) =>
    toView(g, today)
  );
  // 已完成的按完成时间倒序：最近收起来的排前面
  const doneGoals = all
    .filter((g) => g.status === 'done')
    .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt))
    .map((g) => toView(g, today));

  return { today, active: activeGoals, done: doneGoals };
}

/** 读单个目标（用于详情页）。找不到返回 null */
export function getGoalView(goalId: string, nowMs: number = Date.now()): GoalView | null {
  const goal = getGoalById(goalId);
  if (!goal) return null;
  // 只算这一个目标的进度，不走 getGoalsData()——详情页不该为别的目标付查询代价
  return toView(goal, currentToday(nowMs));
}

/**
 * 新建目标。
 *
 * 只转调 repo：这里多一层是为了让页面只依赖 services，
 * 不用记住「哪个动作在 goals、哪个在 tasks」。
 */
export function createNewGoal(input: {
  title: string;
  why?: string | null;
  dueDate?: string | null;
}): string {
  return createGoal({
    title: input.title,
    why: input.why?.trim() ? input.why.trim() : null,
    dueDate: input.dueDate ?? null,
  });
}

/**
 * 改目标。只写传进来的字段。
 *
 * `why` 在这里统一去空白、空串写成 null，和 `createNewGoal` 一个口径：
 * 两个入口对同一个字段用两套规则，库里就会出现「有 why 字段但内容是空白」
 * 这种既算写了又算没写的行，展示层要靠 trim 才能判断，迟早漏一处。
 *
 * `title` 不去空白交给 repo——它要校验 1–80 字，去空白必须在长度检查之前，
 * 那里已经做了。
 */
export function editGoal(
  goalId: string,
  patch: { title?: string; why?: string | null; dueDate?: string | null }
): void {
  updateGoal(goalId, {
    ...patch,
    why:
      patch.why === undefined
        ? undefined
        : patch.why && patch.why.trim().length > 0
          ? patch.why.trim()
          : null,
  });
}

/** 手动标记完成 / 退回进行中 */
export function setGoalDone(goalId: string, done: boolean): void {
  updateGoal(goalId, { status: done ? 'done' : 'active' });
}

/**
 * 删掉一个目标。
 *
 * 软删除，与任务同一套：目标从列表里消失，但它下面的任务**不会被删**，
 * 只是 `goal_id` 悬空，读取时按「没有目标」处理（repo 的注释写了这个约定）。
 *
 * 为什么不连任务一起删：目标是「方向」，任务是「具体要做的事」。
 * 方向不要了，不代表那些事也不做了——把两件事绑在一起删，
 * 是替用户做了一个他没同意的决定。
 *
 * 返回 false 表示这个目标已经不在了。
 */
export function deleteGoalById(goalId: string): boolean {
  if (!getGoalById(goalId)) return false;
  deleteGoal(goalId);
  return true;
}

/** 目标下挂着的任务（给详情页的「挂着的任务」列表） */
export function getGoalTasks(goalId: string, nowMs: number = Date.now()): Task[] {
  return listTaskIdsByGoal(goalId)
    .map((id) => getTaskById(id))
    .filter((task): task is Task => task !== null);
}

/**
 * 可以挂到这个目标上的任务。
 *
 * 规则：已经挂在这个目标上的 + 还没挂任何目标的。
 * 不把「已经属于别的目标」的列出来——一个任务最多属于一个目标（docs/02 §3.2），
 * 列出来却不能选，只会让人多点一次。
 *
 * **已经做完的待办也要列出来**，只要它已经挂在这个目标下。
 * 它们计入进度（「3 / 5 件」里的 3），如果列表里看不见，
 * 就会出现「写着 5 件、只列出 4 行」的对不上，而且摘不下来。
 * 没挂目标的已完成待办则不列：做完的事不该被重新指派。
 */
export function listAttachableTasks(goalId: string): AttachableTask[] {
  const tasks = [...listActiveTasks(), ...listTasks({ status: 'done' })];
  return tasks
    .filter((task) => task.goalId === goalId || (task.goalId === null && task.status === 'active'))
    .filter((task) => task.type === 'habit' || task.type === 'todo')
    .map((task) => ({ id: task.id, title: task.title, goalId: task.goalId }));
}

/** 把任务挂上目标 / 摘下来 */
export function linkTask(taskId: string, goalId: string | null): void {
  attachTaskToGoal(taskId, goalId);
}

/**
 * 今天还没做、但今天排期了的任务数。
 *
 * 目标页空状态用：告诉用户「先去做一件今天的事，再回来写目标」时，
 * 至少知道今天确实有可做的事。读不到就返回 0，这句提示不出现。
 */
export function countOpenTasksToday(nowMs: number = Date.now()): number {
  try {
    const settings = getSettings();
    const today = effectiveToday(nowMs, settings.day_start_hour, settings.last_settled_date).today;
    const week = weekRange(today, settings.week_starts_on);
    const pairs = listActiveCheckinDates(today);
    const doneToday = new Set(
      pairs.filter((p) => p.localDate === today).map((p) => p.taskId)
    );

    let open = 0;
    for (const task of listActiveTasks()) {
      if (task.type !== 'habit' && task.type !== 'todo') continue;
      if (doneToday.has(task.id)) continue;

      const weeklyDone =
        task.recurrence === 'weekly_times'
          ? pairs.filter(
              (p) =>
                p.taskId === task.id && p.localDate >= week.start && p.localDate <= week.end
            ).length
          : 0;

      if (isScheduledOn(task, today, settings.week_starts_on, weeklyDone)) open += 1;
    }
    return open;
  } catch {
    return 0;
  }
}
