/**
 * Ember 数据层 · checkins 仓库
 *
 * checkins 是事实表：只追加，永不物理删除。
 * 撤销打卡不是删行，而是把 status 改成 'reversed' 并写 reversed_at / reverse_reason。
 * 这样历史可以完整重建，也不会让「撤销重记」产生经济收益（随机不参与数值）。
 *
 * 奖励数值（base_xp / xp_awarded / ...）在写入时固化，
 * 以后调整数值表不会改动任何一条历史记录。
 */
import type { CheckinDraft } from '../../domain/score';
import { getDb, newId } from '../client';
import type { AttributeKey, CheckinSource, CheckinStatus } from '../schema';

/** 数据库里的一行（字段名与列名一致） */
export interface CheckinRow {
  id: string;
  player_id: string;
  task_id: string;
  local_date: string;
  score_count: number;
  occurred_at: number;
  source: CheckinSource;
  status: CheckinStatus;
  base_xp: number;
  xp_awarded: number;
  base_ember: number;
  ember_awarded: number;
  attr_key: AttributeKey;
  attr_xp_awarded: number;
  multiplier: number;
  is_capped: number;
  prng_seed: string;
  flavor_key: string | null;
  reversed_at: number | null;
  reverse_reason: string | null;
  created_at: number;
  updated_at: number;
}

/** 给界面 / domain 用的打卡对象（列名转驼峰） */
export interface Checkin {
  id: string;
  playerId: string;
  taskId: string;
  /** 业务日 YYYY-MM-DD */
  localDate: string;
  /** 同一任务同一业务日的第几次（0 基） */
  scoreCount: number;
  /** 真实发生时间（毫秒），只用于排序 */
  occurredAt: number;
  source: CheckinSource;
  status: CheckinStatus;
  baseXp: number;
  xpAwarded: number;
  baseEmber: number;
  emberAwarded: number;
  attrKey: AttributeKey;
  attrXpAwarded: number;
  multiplier: number;
  isCapped: boolean;
  prngSeed: string;
  flavorKey: string | null;
  reversedAt: number | null;
  reverseReason: string | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * 新建打卡的入参。
 * 所有数值由 domain/score.ts 算好后传进来，这一层不做任何奖励计算。
 *
 * 字段与 domain/score.ts 的 CheckinDraft 一致，只少了 playerId / scoreCount ——
 * 这两项由本层自己补齐，调用方不需要关心。
 */
export interface InsertCheckinInput {
  taskId: string;
  /** 业务日 YYYY-MM-DD，由 domain/date.ts 推导，不要手写 */
  localDate: string;
  /** 真实发生时间（毫秒），默认取当前时间 */
  occurredAt?: number;
  source?: CheckinSource;
  baseXp: number;
  xpAwarded: number;
  baseEmber: number;
  emberAwarded: number;
  attrKey: AttributeKey;
  attrXpAwarded: number;
  /** 难度倍率 × 补记比例 */
  multiplier: number;
  isCapped?: boolean;
  prngSeed: string;
  flavorKey?: string | null;
}

/** 聚合结果：某一天的 XP / 余烬合计 */
export interface DailyTotals {
  localDate: string;
  /** 有效打卡的 XP 合计 */
  xp: number;
  /** 有效打卡的余烬合计 */
  ember: number;
  /** 有效打卡条数 */
  count: number;
  /** 其中是否有被软上限削减过的记录 */
  cappedCount: number;
}

/** 所有 SELECT 共用的列清单 */
const CHECKIN_COLUMNS = `
  id, player_id, task_id, local_date, score_count, occurred_at,
  source, status, base_xp, xp_awarded, base_ember, ember_awarded,
  attr_key, attr_xp_awarded, multiplier, is_capped,
  prng_seed, flavor_key, reversed_at, reverse_reason,
  created_at, updated_at
`;

/** 数据库行 → 界面对象 */
function toCheckin(row: CheckinRow): Checkin {
  return {
    id: row.id,
    playerId: row.player_id,
    taskId: row.task_id,
    localDate: row.local_date,
    scoreCount: row.score_count,
    occurredAt: row.occurred_at,
    source: row.source,
    status: row.status,
    baseXp: row.base_xp,
    xpAwarded: row.xp_awarded,
    baseEmber: row.base_ember,
    emberAwarded: row.ember_awarded,
    attrKey: row.attr_key,
    attrXpAwarded: row.attr_xp_awarded,
    multiplier: row.multiplier,
    isCapped: row.is_capped === 1,
    prngSeed: row.prng_seed,
    flavorKey: row.flavor_key,
    reversedAt: row.reversed_at,
    reverseReason: row.reverse_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 取当前玩家 id */
function currentPlayerId(): string {
  const row = getDb().getFirstSync<{ id: string }>('SELECT id FROM player LIMIT 1');
  if (!row) {
    throw new Error('player 行不存在，数据库可能没有执行种子数据');
  }
  return row.id;
}

/**
 * 写入一条打卡，返回新对象。
 *
 * 两条约束在写入前先检查，给出中文报错：
 *   1. 同一任务同一业务日只允许一条 active 记录（对应 uq_checkin_active）。
 *   2. score_count 在同一任务同一天内递增，撤销后重记也不会撞 UNIQUE。
 */
export function insertCheckin(input: InsertCheckinInput): Checkin {
  const db = getDb();
  const playerId = currentPlayerId();
  const now = Date.now();
  const id = newId();

  // 同一任务同一天是否已有有效记录
  const existingActive = db.getFirstSync<{ id: string }>(
    `SELECT id FROM checkins
      WHERE task_id = ? AND local_date = ? AND status = 'active'
      LIMIT 1`,
    [input.taskId, input.localDate]
  );

  if (existingActive) {
    throw new Error('这件事今天已经记过一次了');
  }

  // score_count：取当天已有的最大序号 + 1（包含已撤销的行，避免撞 UNIQUE）
  const maxRow = db.getFirstSync<{ max_score: number | null }>(
    `SELECT MAX(score_count) AS max_score
       FROM checkins
      WHERE task_id = ? AND local_date = ?`,
    [input.taskId, input.localDate]
  );
  const scoreCount = (maxRow?.max_score ?? -1) + 1;

  db.runSync(
    `INSERT INTO checkins (
       id, player_id, task_id, local_date, score_count, occurred_at,
       source, status, base_xp, xp_awarded, base_ember, ember_awarded,
       attr_key, attr_xp_awarded, multiplier, is_capped,
       prng_seed, flavor_key, reversed_at, reverse_reason,
       created_at, updated_at
     ) VALUES (
       ?, ?, ?, ?, ?, ?,
       ?, 'active', ?, ?, ?, ?,
       ?, ?, ?, ?,
       ?, ?, NULL, NULL,
       ?, ?
     )`,
    [
      id,
      playerId,
      input.taskId,
      input.localDate,
      scoreCount,
      input.occurredAt ?? now,
      input.source ?? 'manual',
      input.baseXp,
      input.xpAwarded,
      input.baseEmber,
      input.emberAwarded,
      input.attrKey,
      input.attrXpAwarded,
      input.multiplier,
      input.isCapped ? 1 : 0,
      input.prngSeed,
      input.flavorKey ?? null,
      now,
      now,
    ]
  );

  const created = getCheckinById(id);
  if (!created) {
    throw new Error('打卡写入后读不到，数据库状态异常');
  }
  return created;
}

/**
 * 把 domain 算好的 CheckinDraft 直接落库。
 * score.ts 的输出可以原样传进来，省掉一层手工字段搬运。
 */
export function insertCheckinFromDraft(draft: CheckinDraft): Checkin {
  return insertCheckin({
    taskId: draft.taskId,
    localDate: draft.localDate,
    occurredAt: draft.occurredAt,
    source: draft.source,
    baseXp: draft.baseXp,
    xpAwarded: draft.xpAwarded,
    baseEmber: draft.baseEmber,
    emberAwarded: draft.emberAwarded,
    attrKey: draft.attrKey,
    attrXpAwarded: draft.attrXpAwarded,
    multiplier: draft.multiplier,
    isCapped: draft.isCapped === 1,
    prngSeed: draft.prngSeed,
    // 文案键由调用方在算完之后自己挑，draft 里不带
    flavorKey: null,
  });
}

/** 按 id 取打卡（包含已撤销的） */
export function getCheckinById(id: string): Checkin | null {
  const row = getDb().getFirstSync<CheckinRow>(
    `SELECT ${CHECKIN_COLUMNS} FROM checkins WHERE id = ?`,
    [id]
  );
  return row ? toCheckin(row) : null;
}

/**
 * 取某任务在某业务日的有效打卡（没有则返回 null）。
 * 「今天这个习惯做了没有」用它判断。
 */
export function getActiveCheckin(taskId: string, localDate: string): Checkin | null {
  const row = getDb().getFirstSync<CheckinRow>(
    `SELECT ${CHECKIN_COLUMNS}
       FROM checkins
      WHERE task_id = ? AND local_date = ? AND status = 'active'
      LIMIT 1`,
    [taskId, localDate]
  );
  return row ? toCheckin(row) : null;
}

/** 某任务在某个业务日是否有有效打卡 */
export function hasActiveCheckin(taskId: string, localDate: string): boolean {
  const row = getDb().getFirstSync<{ id: string }>(
    `SELECT id FROM checkins
      WHERE task_id = ? AND local_date = ? AND status = 'active'
      LIMIT 1`,
    [taskId, localDate]
  );
  return row !== null;
}

/** 取某个业务日的全部打卡（默认只取有效的） */
export function listCheckinsByDate(
  localDate: string,
  includeReversed = false
): Checkin[] {
  const rows = getDb().getAllSync<CheckinRow>(
    `SELECT ${CHECKIN_COLUMNS}
       FROM checkins
      WHERE local_date = ?
        ${includeReversed ? '' : `AND status = 'active'`}
      ORDER BY occurred_at ASC`,
    [localDate]
  );
  return rows.map(toCheckin);
}

/** 取某个任务的全部打卡（默认只取有效的），按业务日倒序 */
export function listCheckinsByTask(
  taskId: string,
  includeReversed = false
): Checkin[] {
  const rows = getDb().getAllSync<CheckinRow>(
    `SELECT ${CHECKIN_COLUMNS}
       FROM checkins
      WHERE task_id = ?
        ${includeReversed ? '' : `AND status = 'active'`}
      ORDER BY local_date DESC, score_count DESC`,
    [taskId]
  );
  return rows.map(toCheckin);
}

/** 取某个任务在业务日区间内的有效打卡（闭区间），用于「每周 N 次」进度 */
export function listCheckinsByTaskRange(
  taskId: string,
  startDate: string,
  endDate: string
): Checkin[] {
  const rows = getDb().getAllSync<CheckinRow>(
    `SELECT ${CHECKIN_COLUMNS}
       FROM checkins
      WHERE task_id = ?
        AND local_date BETWEEN ? AND ?
        AND status = 'active'
      ORDER BY local_date ASC, score_count ASC`,
    [taskId, startDate, endDate]
  );
  return rows.map(toCheckin);
}

/**
 * 撤销打卡：只标记，不删行。
 *
 * 已撤销的记录不会参与任何聚合（所有聚合都带 status = 'active'）。
 * 撤销后同一任务同一天可以重新记录 —— uq_checkin_active 是部分索引，只管 active 行。
 */
export function reverseCheckin(id: string, reason: string | null = null): void {
  const now = Date.now();
  getDb().runSync(
    `UPDATE checkins
        SET status = 'reversed',
            reversed_at = ?,
            reverse_reason = ?,
            updated_at = ?
      WHERE id = ? AND status = 'active'`,
    [now, reason, now, id]
  );
}

/** 按任务 + 业务日撤销（界面里「取消今天的记录」用它） */
export function reverseCheckinByTaskDate(
  taskId: string,
  localDate: string,
  reason: string | null = null
): boolean {
  const active = getActiveCheckin(taskId, localDate);
  if (!active) return false;
  reverseCheckin(active.id, reason);
  return true;
}

/**
 * 某业务日的合计：XP、余烬、条数、被上限削减的条数。
 * 只统计有效打卡（status = 'active'）。
 */
export function getDailyTotals(localDate: string): DailyTotals {
  const row = getDb().getFirstSync<{
    xp: number | null;
    ember: number | null;
    n: number;
    capped: number | null;
  }>(
    `SELECT SUM(xp_awarded)    AS xp,
            SUM(ember_awarded) AS ember,
            COUNT(*)           AS n,
            SUM(is_capped)     AS capped
       FROM checkins
      WHERE local_date = ? AND status = 'active'`,
    [localDate]
  );

  return {
    localDate,
    xp: row?.xp ?? 0,
    ember: row?.ember ?? 0,
    count: row?.n ?? 0,
    cappedCount: row?.capped ?? 0,
  };
}

/** 某业务日已发的 XP 总和（软上限计算要用） */
export function getDailyXpTotal(localDate: string): number {
  const row = getDb().getFirstSync<{ total: number | null }>(
    `SELECT SUM(xp_awarded) AS total
       FROM checkins
      WHERE local_date = ? AND status = 'active'`,
    [localDate]
  );
  return row?.total ?? 0;
}

/** 某业务日已发的余烬总和（软上限计算要用） */
export function getDailyEmberTotal(localDate: string): number {
  const row = getDb().getFirstSync<{ total: number | null }>(
    `SELECT SUM(ember_awarded) AS total
       FROM checkins
      WHERE local_date = ? AND status = 'active'`,
    [localDate]
  );
  return row?.total ?? 0;
}

/** 某业务日是否有任何有效打卡 */
export function hasAnyCheckinOnDate(localDate: string): boolean {
  const row = getDb().getFirstSync<{ id: string }>(
    `SELECT id FROM checkins
      WHERE local_date = ? AND status = 'active'
      LIMIT 1`,
    [localDate]
  );
  return row !== null;
}

/** 某业务日有效打卡的条数 */
export function countCheckinsOnDate(localDate: string): number {
  const row = getDb().getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM checkins WHERE local_date = ? AND status = 'active'`,
    [localDate]
  );
  return row?.n ?? 0;
}

/**
 * 业务日闭区间内的有效打卡条数。
 * 「某周记录数」= 传入该周第一天与最后一天。
 */
export function countCheckinsInRange(startDate: string, endDate: string): number {
  const row = getDb().getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n
       FROM checkins
      WHERE local_date BETWEEN ? AND ? AND status = 'active'`,
    [startDate, endDate]
  );
  return row?.n ?? 0;
}

/** 某个任务在业务日区间内的有效打卡条数（「每周 N 次」进度） */
export function countCheckinsForTaskInRange(
  taskId: string,
  startDate: string,
  endDate: string
): number {
  const row = getDb().getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n
       FROM checkins
      WHERE task_id = ?
        AND local_date BETWEEN ? AND ?
        AND status = 'active'`,
    [taskId, startDate, endDate]
  );
  return row?.n ?? 0;
}

/** 某个任务累计有效打卡次数（回忆页与统计用） */
export function countCheckinsForTask(taskId: string): number {
  const row = getDb().getFirstSync<{ n: number }>(
    `SELECT COUNT(*) AS n FROM checkins WHERE task_id = ? AND status = 'active'`,
    [taskId]
  );
  return row?.n ?? 0;
}

/** 最近一次有效打卡（用于连胜计算） */
export function getLatestCheckin(): Checkin | null {
  const row = getDb().getFirstSync<CheckinRow>(
    `SELECT ${CHECKIN_COLUMNS}
       FROM checkins
      WHERE status = 'active'
      ORDER BY local_date DESC, occurred_at DESC
      LIMIT 1`
  );
  return row ? toCheckin(row) : null;
}

/**
 * 按日期分组统计（回忆页的时间轴）。
 * 返回业务日 → 条数 / XP / 余烬。
 */
export interface DateSummary {
  localDate: string;
  count: number;
  xp: number;
  ember: number;
}

interface DateSummaryRow {
  local_date: string;
  n: number;
  xp: number | null;
  ember: number | null;
}

export function summarizeByDate(startDate: string, endDate: string): DateSummary[] {
  const rows: DateSummaryRow[] = getDb().getAllSync<DateSummaryRow>(
    `SELECT local_date,
            COUNT(*)           AS n,
            SUM(xp_awarded)    AS xp,
            SUM(ember_awarded) AS ember
       FROM checkins
      WHERE local_date BETWEEN ? AND ? AND status = 'active'
      GROUP BY local_date
      ORDER BY local_date DESC`,
    [startDate, endDate]
  );

  return rows.map((row) => ({
    localDate: row.local_date,
    count: row.n,
    xp: row.xp ?? 0,
    ember: row.ember ?? 0,
  }));
}
