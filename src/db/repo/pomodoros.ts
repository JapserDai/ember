/**
 * Ember 数据层 · pomodoros 仓库
 *
 * 番茄钟的**完成事实**：一次完成的番茄一行。进行中的番茄不在这里——
 * 它活在内存里（见 domain/pomodoro.ts），App 被杀就没了，这是有意的。
 *
 * 这一层的职责只是「写进去 / 读出来」，不含任何业务判断——
 * 「今天完成了几个」「超过上限没有」属于 domain/ 与 services/。
 */
import { getDb } from '../client';
import { newId } from '../id';
import type { PomodoroPhaseKey } from '../../domain/pomodoro';
import type { CompletedPomodoroDraft } from '../../domain/pomodoro';

/** pomodoros 表的一行，字段名与数据库列一一对应 */
export interface PomodoroRow {
  id: string;
  player_id: string;
  phase: PomodoroPhaseKey;
  /** 完成那一刻的业务日 YYYY-MM-DD */
  local_date: string;
  /** 开始的真实时间戳（毫秒） */
  start_at: number;
  /** 完成的真实时间戳（毫秒） */
  completed_at: number;
  /** 实际进行的毫秒数（扣掉全部暂停） */
  elapsed_ms: number;
  /** 暂停的总毫秒数。冗余列，存下来换可核对（见 schema.ts 迁移 18） */
  paused_ms: number;
  created_at: number;
}

/** 插入一条完成记录。校验（时长 / 时间 / 日期）发生在 services 层，这里只写 */
export function insertPomodoro(input: {
  playerId: string;
  draft: CompletedPomodoroDraft;
  pausedMs: number;
}): PomodoroRow {
  const now = Date.now();
  const row: PomodoroRow = {
    id: newId(),
    player_id: input.playerId,
    phase: input.draft.phase,
    local_date: input.draft.localDate,
    start_at: input.draft.startAt,
    completed_at: input.draft.completedAt,
    elapsed_ms: input.draft.elapsedMs,
    paused_ms: input.pausedMs,
    created_at: now,
  };

  getDb().runSync(
    `INSERT INTO pomodoros
       (id, player_id, phase, local_date, start_at, completed_at, elapsed_ms, paused_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.player_id,
      row.phase,
      row.local_date,
      row.start_at,
      row.completed_at,
      row.elapsed_ms,
      row.paused_ms,
      row.created_at,
    ]
  );

  return row;
}

/** 某个业务日完成了几个番茄、实际专注了多少毫秒 */
export function getPomodoroDailyTotals(
  playerId: string,
  localDate: string
): { count: number; totalMs: number } {
  const row = getDb().getFirstSync<{ count: number; total: number | null }>(
    `SELECT COUNT(*) AS count, SUM(elapsed_ms) AS total
       FROM pomodoros
      WHERE player_id = ? AND local_date = ?`,
    [playerId, localDate]
  );
  return { count: row?.count ?? 0, totalMs: row?.total ?? 0 };
}

/**
 * 「正在跑的番茄」有没有一条**已存在**的当日记录可参考——没有。
 * 这个函数存在的唯一目的是挡住一个错误用法：番茄不是打卡，
 * 它不参与 uq_checkin_active 那套「同日同任务唯一」的约束。
 * 当日上限（POMODORO_DAILY_CAP）在 services 层用 getPomodoroDailyTotals 判断。
 */
export function countPomodorosForPlayer(playerId: string): number {
  const row = getDb().getFirstSync<{ count: number }>(
    `SELECT COUNT(*) AS count FROM pomodoros WHERE player_id = ?`,
    [playerId]
  );
  return row?.count ?? 0;
}
