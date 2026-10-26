/**
 * Ember 数据层 · reviews 仓库（周复盘）
 *
 * 单表读写，不做业务判断。「哪一周该写」「空着算不算写过」在 domain/review.ts，
 * 「什么时候提醒」在 services/review.ts。
 *
 * 一周一行，主键是那一周的周一。
 */
import { getDb } from '../client';

/** 表的一行，字段名与数据库列一一对应 */
export interface ReviewRow {
  week_key: string;
  answer_keep: string;
  answer_stuck: string;
  answer_next: string;
  answer_free: string;
  created_at: number;
  updated_at: number;
}

/** 写入一周的复盘。四个答案都已经是规范化过的 */
export interface ReviewWrite {
  weekKey: string;
  keep: string;
  stuck: string;
  next: string;
  free: string;
}

/**
 * 读某一周的复盘。没写过时返回 null。
 *
 * 读失败**抛错**：这一页要显示用户自己写过的话，静默返回 null
 * 会让界面显示成「你还没写」，而实际上是他写过但读不出来——那是更糟的谎。
 */
export function getReview(weekKey: string): ReviewRow | null {
  const row = getDb().getFirstSync<ReviewRow>(
    `SELECT week_key, answer_keep, answer_stuck, answer_next, answer_free,
            created_at, updated_at
       FROM reviews
      WHERE week_key = ?`,
    [weekKey]
  );
  return row ?? null;
}

/**
 * 按周倒序列出全部复盘（最近的在前）。
 *
 * 不带分页：一周一条，一年也就 52 条。日记页要一次列出全部，
 * 而分页会给「翻看自己写过的东西」这件事加一层不必要的门。
 */
export function listReviews(limit: number = 200): ReviewRow[] {
  return getDb().getAllSync<ReviewRow>(
    `SELECT week_key, answer_keep, answer_stuck, answer_next, answer_free,
            created_at, updated_at
       FROM reviews
      ORDER BY week_key DESC
      LIMIT ?`,
    [Math.max(1, Math.trunc(limit))]
  );
}

/** 只取「写过哪几周」这一个列表。给「默认该写哪一周」用，不读答案 */
export function listReviewWeeks(): string[] {
  return getDb()
    .getAllSync<{ week_key: string }>('SELECT week_key FROM reviews ORDER BY week_key DESC')
    .map((row) => row.week_key);
}

/**
 * 写入或覆盖某一周的复盘。
 *
 * 用 `INSERT ... ON CONFLICT DO UPDATE` 而不是先查再写：
 * 后者在「两次点击之间」有一个空隙，而复盘页的「存下来」是可能被连点的。
 * 保留 `created_at`（第一次写这一周的时间），只更新 `updated_at`。
 */
export function upsertReview(write: ReviewWrite): void {
  const now = Date.now();
  getDb().runSync(
    `INSERT INTO reviews
       (week_key, answer_keep, answer_stuck, answer_next, answer_free, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(week_key) DO UPDATE SET
       answer_keep = excluded.answer_keep,
       answer_stuck = excluded.answer_stuck,
       answer_next = excluded.answer_next,
       answer_free = excluded.answer_free,
       updated_at = excluded.updated_at`,
    [write.weekKey, write.keep, write.stuck, write.next, write.free, now, now]
  );
}

/**
 * 删掉某一周的复盘。
 *
 * 界面上暂时没有入口（这一版只做「写」与「改」）。
 * 留着是因为「写错了想清掉」是必然会有的诉求，而删一行是最小实现。
 */
export function deleteReview(weekKey: string): void {
  getDb().runSync('DELETE FROM reviews WHERE week_key = ?', [weekKey]);
}

/* ------------------------------------------------------------------ *
 * 月复盘（阶段 3 第 3 条）
 *
 * 与周复盘同一张文件的理由：它们是同一类东西（一份回顾），
 * 只差在粒度。分两个 repo 文件会让调用方为了「读所有复盘」而 import 两处。
 * ------------------------------------------------------------------ */

/** 月复盘的一行 */
export interface MonthReviewRow {
  month_key: string;
  note: string;
  created_at: number;
  updated_at: number;
}

/** 读某个月的月复盘。没写过时返回 null */
export function getMonthReview(monthKey: string): MonthReviewRow | null {
  const row = getDb().getFirstSync<MonthReviewRow>(
    `SELECT month_key, note, created_at, updated_at
       FROM month_reviews
      WHERE month_key = ?`,
    [monthKey]
  );
  return row ?? null;
}

/** 按月份倒序列出全部月复盘 */
export function listMonthReviews(limit: number = 120): MonthReviewRow[] {
  return getDb().getAllSync<MonthReviewRow>(
    `SELECT month_key, note, created_at, updated_at
       FROM month_reviews
      ORDER BY month_key DESC
      LIMIT ?`,
    [Math.max(1, Math.trunc(limit))]
  );
}

/** 只取「写过哪几个月」。给「默认该写哪个月」用，不读正文 */
export function listMonthReviewKeys(): string[] {
  return getDb()
    .getAllSync<{ month_key: string }>(
      'SELECT month_key FROM month_reviews ORDER BY month_key DESC'
    )
    .map((row) => row.month_key);
}

/** 写入或覆盖某个月的月复盘。保留 created_at，只更新 updated_at */
export function upsertMonthReview(monthKey: string, note: string): void {
  const now = Date.now();
  getDb().runSync(
    `INSERT INTO month_reviews (month_key, note, created_at, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(month_key) DO UPDATE SET
       note = excluded.note,
       updated_at = excluded.updated_at`,
    [monthKey, note, now, now]
  );
}

/** 删掉某个月的月复盘 */
export function deleteMonthReview(monthKey: string): void {
  getDb().runSync('DELETE FROM month_reviews WHERE month_key = ?', [monthKey]);
}
