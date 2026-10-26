/**
 * Ember 数据层 · tasks 仓库
 *
 * 三类任务（习惯 / 待办 / 奖励）共用一张表，用 type 区分。
 *
 * 约定：
 *   1. 删除一律是软删除（写 deleted_at），所有查询都要过滤 deleted_at IS NULL。
 *   2. 「今天该做哪些」这类日期判断不在这里做 —— 那是 domain/recurrence.ts 的事，
 *      这里只提供「按状态取全部任务」这种原始数据。
 *   3. recurrence_config 以 JSON 字符串存库，进出这一层时做序列化 / 反序列化。
 */
import { isDateKey } from '../../domain/date';
import type { ScorableTask } from '../../domain/score';
import { getDb, newId } from '../client';
import type {
  AttributeKey,
  Recurrence,
  TaskStatus,
  TaskType,
} from '../schema';

/** 重复规则的配置对象。不同规则用不同字段，用不到的就是 undefined。 */
export interface RecurrenceConfig {
  /** weekly_days / monthly_days：星期几（1 = 周一）或每月几号（1–31） */
  days?: number[];
  /** 以后可能扩展的额外键，保持宽松 */
  [key: string]: unknown;
}

/** 数据库里的一行（字段名与列名一致，recurrence_config 是原始 JSON 字符串） */
export interface TaskRow {
  id: string;
  player_id: string;
  title: string;
  notes: string | null;
  type: TaskType;
  recurrence: Recurrence;
  recurrence_config: string;
  anchor_date: string | null;
  interval_n: number | null;
  weekly_target: number | null;
  start_date: string;
  end_date: string | null;
  due_date: string | null;
  status: TaskStatus;
  completed_at: number | null;
  attribute: AttributeKey;
  icon: string | null;
  color: string | null;
  sort_order: number;
  max_per_day: number;
  allow_backfill: number;
  ember_cost: number;
  goal_id: string | null;
  reminder_minute: number | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/** 给界面用的任务对象：列名转驼峰，配置已解析成对象 */
export interface Task {
  id: string;
  playerId: string;
  title: string;
  notes: string | null;
  type: TaskType;
  recurrence: Recurrence;
  recurrenceConfig: RecurrenceConfig;
  anchorDate: string | null;
  intervalN: number | null;
  weeklyTarget: number | null;
  startDate: string;
  endDate: string | null;
  dueDate: string | null;
  status: TaskStatus;
  completedAt: number | null;
  attribute: AttributeKey;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  maxPerDay: number;
  allowBackfill: boolean;
  emberCost: number;
  goalId: string | null;
  /** 提醒时刻：从零点起的分钟数，0 = 00:00，1439 = 23:59。null = 不提醒 */
  reminderMinute: number | null;
  /** 软删除时间戳。本层返回的对象永远是 null（已删除的查不出来），字段保留是为了对齐 domain 的形状 */
  deletedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/** 新建任务的入参。只保留 v0.1 真正会用到的字段。 */
export interface CreateTaskInput {
  title: string;
  /** 默认 habit */
  type?: TaskType;
  notes?: string | null;
  /** 习惯默认 daily；待办 / 奖励强制 once */
  recurrence?: Recurrence;
  recurrenceConfig?: RecurrenceConfig;
  anchorDate?: string | null;
  intervalN?: number | null;
  weeklyTarget?: number | null;
  /** 生效业务日 YYYY-MM-DD，必填 */
  startDate: string;
  endDate?: string | null;
  dueDate?: string | null;
  /** 必填：五维归属 */
  attribute: AttributeKey;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
  maxPerDay?: number;
  allowBackfill?: boolean;
  emberCost?: number;
  /** 提醒时刻（从零点起的分钟数）。不传 = 不提醒 */
  reminderMinute?: number | null;
}

/** 可修改字段。全部可选，只写传进来的键。 */
export interface UpdateTaskInput {
  title?: string;
  notes?: string | null;
  recurrence?: Recurrence;
  recurrenceConfig?: RecurrenceConfig;
  anchorDate?: string | null;
  intervalN?: number | null;
  weeklyTarget?: number | null;
  startDate?: string;
  endDate?: string | null;
  dueDate?: string | null;
  attribute?: AttributeKey;
  icon?: string | null;
  color?: string | null;
  sortOrder?: number;
  maxPerDay?: number;
  allowBackfill?: boolean;
  emberCost?: number;
  reminderMinute?: number | null;
}

/** 查询任务的过滤条件 */
export interface ListTasksFilter {
  /** 不传则不过滤状态 */
  status?: TaskStatus;
  /** 不传则不过滤类型 */
  type?: TaskType;
}

/** 习惯允许的重复规则 */
const HABIT_RECURRENCES: readonly Recurrence[] = [
  'daily',
  'weekly_days',
  'monthly_days',
  'every_x_days',
  'weekly_times',
];

/** 所有 SELECT 共用的列清单，避免每处重复写 */
const TASK_COLUMNS = `
  id, player_id, title, notes, type, recurrence, recurrence_config,
  anchor_date, interval_n, weekly_target, start_date, end_date, due_date,
  status, completed_at, attribute, icon, color, sort_order,
  max_per_day, allow_backfill, ember_cost, goal_id, reminder_minute,
  created_at, updated_at, deleted_at
`;

/** 数据库行 → 界面对象 */
function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    playerId: row.player_id,
    title: row.title,
    notes: row.notes,
    type: row.type,
    recurrence: row.recurrence,
    recurrenceConfig: parseConfig(row.recurrence_config),
    anchorDate: row.anchor_date,
    intervalN: row.interval_n,
    weeklyTarget: row.weekly_target,
    startDate: row.start_date,
    endDate: row.end_date,
    dueDate: row.due_date,
    status: row.status,
    completedAt: row.completed_at,
    attribute: row.attribute,
    icon: row.icon,
    color: row.color,
    sortOrder: row.sort_order,
    maxPerDay: row.max_per_day,
    allowBackfill: row.allow_backfill === 1,
    emberCost: row.ember_cost,
    goalId: row.goal_id,
    reminderMinute: row.reminder_minute,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * 把任务对象转成 domain/score.ts 需要的 ScorableTask 形状。
 *
 * 两层的字段名一致（都是驼峰），只有布尔与 0/1 的差别：
 * score.ts 那边为了贴近数据库用 0/1，这里转一下。
 */
export function toScorable(task: Task): ScorableTask {
  return {
    id: task.id,
    type: task.type,
    recurrence: task.recurrence,
    attribute: task.attribute,
    status: task.status,
    maxPerDay: task.maxPerDay,
    allowBackfill: task.allowBackfill ? 1 : 0,
    emberCost: task.emberCost,
    deletedAt: task.deletedAt,
  };
}

/** 解析 JSON 配置。坏数据不抛错，退化成空对象，避免一条脏行让整页打不开。 */
function parseConfig(raw: string): RecurrenceConfig {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as RecurrenceConfig;
    }
    return {};
  } catch {
    return {};
  }
}

/**
 * 校验「类型 × 重复规则」的自洽性。
 * 数据库里也有同样的 CHECK 约束，这里提前拦是为了给出看得懂的中文报错。
 */
function assertTypeRecurrence(type: TaskType, recurrence: Recurrence): void {
  if (type === 'habit') {
    if (!HABIT_RECURRENCES.includes(recurrence)) {
      throw new Error(`习惯不能使用「${recurrence}」这条重复规则`);
    }
    return;
  }
  // 待办与奖励都是一次性的
  if (recurrence !== 'once') {
    throw new Error('待办和奖励只能使用一次性规则（once）');
  }
}

/** 取当前玩家 id（单机 App，只有一行 player） */
function currentPlayerId(): string {
  const row = getDb().getFirstSync<{ id: string }>('SELECT id FROM player LIMIT 1');
  if (!row) {
    throw new Error('player 行不存在，数据库可能没有执行种子数据');
  }
  return row.id;
}

/**
 * 新建任务，返回新任务对象。
 *
 * 待办 / 奖励的 recurrence 会被强制为 once；习惯不给则默认 daily。
 */
export function createTask(input: CreateTaskInput): Task {
  const type: TaskType = input.type ?? 'habit';
  const recurrence: Recurrence =
    type === 'habit' ? (input.recurrence ?? 'daily') : 'once';

  assertTypeRecurrence(type, recurrence);

  const title = input.title.trim();
  if (title.length === 0) {
    throw new Error('任务标题还是空的');
  }
  if (title.length > 80) {
    throw new Error('任务标题最多 80 个字');
  }

  // 截止日必须是 YYYY-MM-DD。不校验的话，一个写错的日期会静默进库，
  // 然后 formatDueLabel 解析失败、卡片上那一行元信息永远不出现——
  // 用户会以为自己没填上，再填一次还是一样。
  if (input.dueDate != null && !isDateKey(input.dueDate)) {
    throw new Error('截止日要写成 2027-03-01 这样的格式');
  }

  const now = Date.now();
  const id = newId();
  const playerId = currentPlayerId();
  const config: RecurrenceConfig = input.recurrenceConfig ?? {};

  getDb().runSync(
    `INSERT INTO tasks (
       id, player_id, title, notes, type, recurrence, recurrence_config,
       anchor_date, interval_n, weekly_target, start_date, end_date, due_date,
       status, completed_at, attribute, icon, color, sort_order,
       max_per_day, allow_backfill, ember_cost, goal_id, reminder_minute,
       created_at, updated_at, deleted_at
     ) VALUES (
       ?, ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?, ?,
       'active', NULL, ?, ?, ?, ?,
       ?, ?, ?, NULL, ?,
       ?, ?, NULL
     )`,
    [
      id,
      playerId,
      title,
      input.notes ?? null,
      type,
      recurrence,
      JSON.stringify(config),
      input.anchorDate ?? null,
      input.intervalN ?? null,
      input.weeklyTarget ?? null,
      input.startDate,
      input.endDate ?? null,
      input.dueDate ?? null,
      input.attribute,
      input.icon ?? null,
      input.color ?? null,
      input.sortOrder ?? 0,
      input.maxPerDay ?? 1,
      input.allowBackfill === false ? 0 : 1,
      input.emberCost ?? 0,
      input.reminderMinute ?? null,
      now,
      now,
    ]
  );

  return getTaskById(id)!;
}

/** 按 id 取任务（已软删除的返回 null） */
export function getTaskById(id: string): Task | null {
  const row = getDb().getFirstSync<TaskRow>(
    `SELECT ${TASK_COLUMNS} FROM tasks WHERE id = ? AND deleted_at IS NULL`,
    [id]
  );
  return row ? toTask(row) : null;
}

/**
 * 列任务。默认按 sort_order、创建时间排序。
 * 所有查询都过滤 deleted_at IS NULL。
 */
export function listTasks(filter: ListTasksFilter = {}): Task[] {
  const where: string[] = ['deleted_at IS NULL'];
  const params: Array<string> = [];

  if (filter.status) {
    where.push('status = ?');
    params.push(filter.status);
  }
  if (filter.type) {
    where.push('type = ?');
    params.push(filter.type);
  }

  const rows = getDb().getAllSync<TaskRow>(
    `SELECT ${TASK_COLUMNS}
       FROM tasks
      WHERE ${where.join(' AND ')}
      ORDER BY sort_order ASC, created_at ASC`,
    params
  );

  return rows.map(toTask);
}

/** 取所有未归档的活跃任务（「今天」页的候选集） */
export function listActiveTasks(): Task[] {
  return listTasks({ status: 'active' });
}

/** 取某个类型的任务 */
export function listTasksByType(type: TaskType): Task[] {
  return listTasks({ type });
}

/** 取待办列表（未完成、未归档的） */
export function listOpenTodos(): Task[] {
  return listTasks({ type: 'todo', status: 'active' });
}

/** 取奖励列表（用余烬兑换的项目） */
export function listRewards(): Task[] {
  return listTasks({ type: 'reward', status: 'active' });
}

/**
 * 更新任务字段。只写传进来的键。
 *
 * 改重复规则时会重新校验「类型 × 规则」是否自洽：
 * 需要先读出原任务，因为类型本身通常不变。
 */
export function updateTask(id: string, patch: UpdateTaskInput): void {
  const existing = getTaskById(id);
  if (!existing) {
    throw new Error('任务不存在或已删除');
  }

  if (patch.title !== undefined) {
    const title = patch.title.trim();
    if (title.length === 0) throw new Error('任务标题还是空的');
    if (title.length > 80) throw new Error('任务标题最多 80 个字');
  }

  if (patch.recurrence !== undefined) {
    assertTypeRecurrence(existing.type, patch.recurrence);
  }

  const sets: string[] = [];
  const values: Array<string | number | null> = [];

  /** 写一个字段的辅助函数，统一处理 null 与布尔值 */
  const put = (column: string, value: string | number | boolean | null) => {
    sets.push(`${column} = ?`);
    if (typeof value === 'boolean') {
      values.push(value ? 1 : 0);
    } else {
      values.push(value);
    }
  };

  if (patch.title !== undefined) put('title', patch.title.trim());
  if (patch.notes !== undefined) put('notes', patch.notes);
  if (patch.recurrence !== undefined) put('recurrence', patch.recurrence);
  if (patch.recurrenceConfig !== undefined) {
    put('recurrence_config', JSON.stringify(patch.recurrenceConfig));
  }
  if (patch.anchorDate !== undefined) put('anchor_date', patch.anchorDate);
  if (patch.intervalN !== undefined) put('interval_n', patch.intervalN);
  if (patch.weeklyTarget !== undefined) put('weekly_target', patch.weeklyTarget);
  if (patch.startDate !== undefined) put('start_date', patch.startDate);
  if (patch.endDate !== undefined) put('end_date', patch.endDate);
  if (patch.dueDate !== undefined) put('due_date', patch.dueDate);
  if (patch.attribute !== undefined) put('attribute', patch.attribute);
  if (patch.icon !== undefined) put('icon', patch.icon);
  if (patch.color !== undefined) put('color', patch.color);
  if (patch.sortOrder !== undefined) put('sort_order', patch.sortOrder);
  if (patch.maxPerDay !== undefined) put('max_per_day', patch.maxPerDay);
  if (patch.allowBackfill !== undefined) put('allow_backfill', patch.allowBackfill);
  if (patch.emberCost !== undefined) put('ember_cost', patch.emberCost);
  if (patch.reminderMinute !== undefined) put('reminder_minute', patch.reminderMinute);

  if (sets.length === 0) return;

  put('updated_at', Date.now());

  getDb().runSync(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`, [
    ...values,
    id,
  ]);
}

/**
 * 更新任务状态。
 *
 * 状态含义：
 *   active   —— 正常出现
 *   paused   —— 暂停，不出现，不参与连胜
 *   done     —— 待办已完成（同时写 completed_at）
 *   archived —— 归档，只在「日记」页的历史里可见
 */
export function updateTaskStatus(id: string, status: TaskStatus): void {
  const now = Date.now();

  if (status === 'done') {
    // 完成时间只写一次：重复调用不会刷新它
    getDb().runSync(
      `UPDATE tasks
          SET status = 'done',
              completed_at = COALESCE(completed_at, ?),
              updated_at = ?
        WHERE id = ? AND deleted_at IS NULL`,
      [now, now, id]
    );
    return;
  }

  if (status === 'active') {
    // 重新激活时清掉完成时间，回到「没做过」的呈现
    getDb().runSync(
      `UPDATE tasks
          SET status = 'active',
              completed_at = NULL,
              updated_at = ?
        WHERE id = ? AND deleted_at IS NULL`,
      [now, id]
    );
    return;
  }

  getDb().runSync(
    `UPDATE tasks SET status = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
    [status, now, id]
  );
}

/** 标记待办完成（updateTaskStatus 的语义化封装） */
export function completeTodo(id: string): void {
  updateTaskStatus(id, 'done');
}

/**
 * 软删除任务：只写 deleted_at，行仍然留在表里。
 *
 * 为什么不物理删除：checkins.task_id 是 ON DELETE RESTRICT 的外键，
 * 删掉任务会让它的历史打卡变成孤儿；而历史打卡是 XP 的唯一来源，不能丢。
 */
export function softDeleteTask(id: string): void {
  const now = Date.now();
  getDb().runSync(
    `UPDATE tasks
        SET deleted_at = ?,
            updated_at = ?,
            status = 'archived'
      WHERE id = ? AND deleted_at IS NULL`,
    [now, now, id]
  );
}

/**
 * 恢复被软删除的任务（撤销删除，限时提示里用）。
 */
export function restoreTask(id: string): void {
  getDb().runSync(
    `UPDATE tasks
        SET deleted_at = NULL,
            updated_at = ?,
            status = 'active'
      WHERE id = ? AND deleted_at IS NOT NULL`,
    [Date.now(), id]
  );
}

/** 统计未删除的任务数（首次使用判断、调试用） */
export function countTasks(): number {
  const row = getDb().getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tasks WHERE deleted_at IS NULL`
  );
  return row?.n ?? 0;
}

/** 统计某类型下未删除的任务数 */
export function countTasksByType(type: TaskType): number {
  const row = getDb().getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM tasks WHERE type = ? AND deleted_at IS NULL`,
    [type]
  );
  return row?.n ?? 0;
}
