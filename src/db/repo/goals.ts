/**
 * Ember 数据层 · goals 仓库
 *
 * 目标只有一句话、一个可选的为什么、一个可选截止日、一个状态。
 * 没有子目标、没有阶段、没有百分比。
 *
 * 进度不存字段，由 computeGoalProgress() 现算：
 * 「这个目标下的任务，完成了几个 / 一共几个」。
 * 存字段就得在每个可能改变的地方同步维护，一处漏改就永远对不上。
 */
import { businessDate, DEFAULT_DAY_START_HOUR } from '../../domain/date';
import { getDb } from '../client';
import { newId } from '../id';
import { getSettings } from './settings';

/** goals 表的一行，字段名与数据库列一一对应 */
export interface GoalRow {
  id: string;
  player_id: string;
  title: string;
  why: string | null;
  due_date: string | null;
  status: GoalStatus;
  completed_at: number | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/** 目标状态：进行中 / 已完成 / 已归档 */
export type GoalStatus = 'active' | 'done' | 'archived';

/** 给界面用的目标对象 */
export interface Goal {
  id: string;
  title: string;
  /** 为什么想走这一段。可空 */
  why: string | null;
  /** 截止日 YYYY-MM-DD。可空，为空表示不限期 */
  dueDate: string | null;
  status: GoalStatus;
  completedAt: number | null;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * 目标的进度。
 *
 * 关键约定：done 只数「已完成的任务」，total 只数「还挂在目标下的任务」。
 * 一个任务都没挂时 total = 0，界面显示「还没挂任务」而不是「0 / 0」。
 */
export interface GoalProgress {
  /** 已完成的任务数 */
  done: number;
  /** 关联的任务总数 */
  total: number;
}

/** 目标 + 进度。列表页直接消费这个形状 */
export interface GoalWithProgress extends Goal {
  progress: GoalProgress;
}

const GOAL_COLUMNS = `id, player_id, title, why, due_date, status, completed_at,
                      sort_order, created_at, updated_at, deleted_at`;

/** 列名转驼峰 */
function toGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    title: row.title,
    why: row.why,
    dueDate: row.due_date,
    status: row.status,
    completedAt: row.completed_at,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 新建目标的入参 */
export interface CreateGoalInput {
  title: string;
  why?: string | null;
  dueDate?: string | null;
  sortOrder?: number;
}

/** 可修改的字段 */
export interface UpdateGoalInput {
  title?: string;
  why?: string | null;
  dueDate?: string | null;
  status?: GoalStatus;
  sortOrder?: number;
}

/**
 * 新建目标。返回新目标的 id。
 *
 * title 会在数据库层被 CHECK 约束再校验一次（1–80 字，去空白后）。
 * 这里先做一次同样的检查，是为了在开发阶段给出更清楚的错误位置。
 */
export function createGoal(input: CreateGoalInput): string {
  const title = input.title.trim();
  if (title.length < 1 || title.length > 80) {
    throw new Error(`目标名请写 1–80 个字，收到 ${title.length} 个`);
  }

  const db = getDb();
  const playerId = getPlayerId();
  const id = newId();
  const now = Date.now();

  db.runSync(
    `INSERT INTO goals (
       id, player_id, title, why, due_date, status, completed_at,
       sort_order, created_at, updated_at, deleted_at
     ) VALUES (?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, NULL)`,
    [
      id,
      playerId,
      title,
      input.why ?? null,
      input.dueDate ?? null,
      input.sortOrder ?? 0,
      now,
      now,
    ]
  );

  return id;
}

/** 取唯一玩家 id。player 表只有 1 行，种子数据保证它存在 */
function getPlayerId(): string {
  const row = getDb().getFirstSync<{ id: string }>('SELECT id FROM player LIMIT 1');
  if (!row) {
    throw new Error('player 行不存在，数据库可能没有执行种子数据');
  }
  return row.id;
}

/** 按 id 取目标（已删除的返回 null） */
export function getGoalById(id: string): Goal | null {
  const row = getDb().getFirstSync<GoalRow>(
    `SELECT ${GOAL_COLUMNS} FROM goals WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  return row ? toGoal(row) : null;
}

/**
 * 列出目标，按状态分组。
 *
 * 排序规则：先按 sort_order，再按创建时间倒序（新建的排前面）。
 * 已完成的默认不返回——它们折叠在「已完成」里，需要时传 includeDone。
 */
export function listGoals(options: { includeDone?: boolean } = {}): Goal[] {
  const statuses = options.includeDone ? `('active','done')` : `('active')`;
  const rows = getDb().getAllSync<GoalRow>(
    `SELECT ${GOAL_COLUMNS} FROM goals
      WHERE status IN ${statuses} AND deleted_at IS NULL
      ORDER BY sort_order ASC, created_at DESC`
  );
  return rows.map(toGoal);
}

/**
 * 算一个目标的进度。
 *
 * 只数「软删除未删」的任务，且只数待办与习惯（奖励类不是「要做的事」，不计入）。
 * 习惯按「今天是否已记过」算完成——它没有「完成」这个终态，
 * 但用户看目标进度时想的是「这件事我今天做了没有」。
 */
export function computeGoalProgress(goalId: string): GoalProgress {
  const row = getDb().getFirstSync<{ total: number; done: number }>(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(
         CASE
           WHEN t.type = 'todo' AND t.status = 'done' THEN 1
           WHEN t.type = 'habit' AND EXISTS (
             SELECT 1 FROM checkins c
              WHERE c.task_id = t.id
                AND c.status = 'active'
                AND c.local_date = ?
           ) THEN 1
           ELSE 0
         END
       ), 0) AS done
     FROM tasks t
     WHERE t.goal_id = ?
       AND t.deleted_at IS NULL
       AND t.type IN ('habit','todo')`,
    [todayLocalDate(), goalId]
  );

  return { done: row?.done ?? 0, total: row?.total ?? 0 };
}

/**
 * 今天的业务日。
 *
 * 全项目只有 domain/date.ts 能判断「今天」（docs/03 §4）。这里走同一个入口，
 * 并读 settings 的 day_start_hour——绕开它就会出现
 * 「凌晨 2 点做完的任务算昨天，但目标进度算今天」这种自相矛盾。
 *
 * 读 settings 失败时退回默认日界，不让一行设置把目标页整个卡住。
 */
function todayLocalDate(): string {
  const now = Date.now();
  let dayStartHour = DEFAULT_DAY_START_HOUR;
  try {
    dayStartHour = getSettings().day_start_hour;
  } catch {
    // 数据库还没就绪：用默认日界，进度差几个小时不影响这一页的结论
  }
  return businessDate(now, dayStartHour);
}

/** 列出目标并附带进度。目标页直接用这个 */
export function listGoalsWithProgress(
  options: { includeDone?: boolean } = {}
): GoalWithProgress[] {
  return listGoals(options).map((goal) => ({
    ...goal,
    progress: computeGoalProgress(goal.id),
  }));
}

/** 局部更新目标。只写传进来的字段 */
export function updateGoal(id: string, patch: UpdateGoalInput): void {
  const sets: string[] = [];
  const values: Array<string | number | null> = [];

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (title.length < 1 || title.length > 80) {
      throw new Error(`目标名请写 1–80 个字，收到 ${title.length} 个`);
    }
    sets.push('title = ?');
    values.push(title);
  }
  if (patch.why !== undefined) {
    sets.push('why = ?');
    values.push(patch.why);
  }
  if (patch.dueDate !== undefined) {
    sets.push('due_date = ?');
    values.push(patch.dueDate);
  }
  if (patch.status !== undefined) {
    sets.push('status = ?');
    values.push(patch.status);
    // 标记完成时记下时间；退回进行中时清掉
    sets.push('completed_at = ?');
    values.push(patch.status === 'done' ? Date.now() : null);
  }
  if (patch.sortOrder !== undefined) {
    sets.push('sort_order = ?');
    values.push(patch.sortOrder);
  }

  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  values.push(Date.now());
  values.push(id);

  getDb().runSync(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`, values);
}

/** 标记目标完成 */
export function completeGoal(id: string): void {
  updateGoal(id, { status: 'done' });
}

/** 软删除目标。关联的任务不会被删，只是 goal_id 悬空——读取时按「无目标」处理 */
export function deleteGoal(id: string): void {
  getDb().runSync(`UPDATE goals SET deleted_at = ?, updated_at = ? WHERE id = ?`, [
    Date.now(),
    Date.now(),
    id,
  ]);
}

/**
 * 把任务挂到目标上（传 goalId = null 表示摘下来）。
 *
 * 只改 tasks.goal_id，不碰任务的其他字段。
 */
export function attachTaskToGoal(taskId: string, goalId: string | null): void {
  getDb().runSync(`UPDATE tasks SET goal_id = ?, updated_at = ? WHERE id = ?`, [
    goalId,
    Date.now(),
    taskId,
  ]);
}

/** 取某个目标下的全部任务 id。用于「这一章的任务」这类列表 */
export function listTaskIdsByGoal(goalId: string): string[] {
  const rows = getDb().getAllSync<{ id: string }>(
    `SELECT id FROM tasks
      WHERE goal_id = ? AND deleted_at IS NULL
      ORDER BY sort_order ASC, created_at ASC`,
    [goalId]
  );
  return rows.map((r) => r.id);
}
