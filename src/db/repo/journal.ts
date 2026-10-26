/**
 * Ember 数据层 · journal_entries 仓库（日记）
 *
 * 单表读写，不做业务判断。「今天该不该回填」「空串算不算写过」在
 * domain/journal.ts，「今天」是哪个业务日在 services/journal.ts。
 *
 * 一天一行，主键就是那一天（业务日 YYYY-MM-DD）。
 *
 * ---- 为什么读失败要抛错 ----
 * 这一页要显示用户自己写的字。静默返回 null 会让界面显示成
 * 「你还没写」，而实际上是他写过但读不出来——那比报错更糟。
 * 与 repo/reviews.ts 的判断一致。
 */
import { getDb } from '../client';

/**
 * 某段业务日内写过的日记日期（闭区间）。
 *
 * 日历只需要「哪几天写过」，不需要正文。用一条 `SELECT local_date` +
 * `BETWEEN` 而不是先 `listJournalEntries(400)` 再在内存里筛：
 * 后者在写了两年之后会漏掉更早的那几个月，而漏掉的表现是「日历上一个点都没有」——
 * 一种看起来完全正常的错误。
 */
export function listJournalDatesInRange(startDate: string, endDate: string): string[] {
  const rows = getDb().getAllSync<{ local_date: string }>(
    `SELECT local_date
       FROM journal_entries
      WHERE local_date BETWEEN ? AND ?
      ORDER BY local_date ASC`,
    [startDate, endDate]
  );
  return rows.map((row) => row.local_date);
}

/** 表的一行，字段名与数据库列一一对应 */
export interface JournalEntryRow {
  local_date: string;
  body: string;
  created_at: number;
  updated_at: number;
}

/** 读某一天的日记。没写过时返回 null */
export function getJournalEntry(localDate: string): JournalEntryRow | null {
  const row = getDb().getFirstSync<JournalEntryRow>(
    `SELECT local_date, body, created_at, updated_at
       FROM journal_entries
      WHERE local_date = ?`,
    [localDate]
  );
  return row ?? null;
}

/**
 * 按日期倒序列出日记（最近的在前）。
 *
 * 默认取 60 条：日记页要给人「翻回去看看」的余地，又不能一次把
 * 几年的内容全铺在首页上。上层要更多时自己传 limit。
 */
export function listJournalEntries(limit: number = 60): JournalEntryRow[] {
  return getDb().getAllSync<JournalEntryRow>(
    `SELECT local_date, body, created_at, updated_at
       FROM journal_entries
      ORDER BY local_date DESC
      LIMIT ?`,
    [Math.max(1, Math.trunc(limit))]
  );
}

/**
 * 比某一天**更早**的日记（「看全部」页的翻页用）。
 *
 * 用「日期小于游标」而不是 `OFFSET`：
 *   - 主键就是日期，`WHERE local_date < ?` 直接走主键索引，不用扫前 N 行；
 *   - 翻页期间在别处改了一条日记不会让分页错位（OFFSET 会因为行数变化跳条）；
 *   - 日期是字符串且格式固定（`YYYY-MM-DD`），字典序就是时间序。
 *
 * `beforeDate` 传空串等于「从最新的一条开始」——空串的字典序小于任何日期。
 */
export function listJournalEntriesBefore(beforeDate: string, limit: number = 60): JournalEntryRow[] {
  return getDb().getAllSync<JournalEntryRow>(
    `SELECT local_date, body, created_at, updated_at
       FROM journal_entries
      WHERE local_date < ?
      ORDER BY local_date DESC
      LIMIT ?`,
    [beforeDate, Math.max(1, Math.trunc(limit))]
  );
}

/**
 * 写一天的日记（有则覆盖，无则新建）。
 *
 * 用 INSERT OR REPLACE：主键是这一天，所以「改一句」与「写一句」
 * 在数据库层面是同一件事，调用方不需要先判断有没有。
 *
 * 但 created_at 要保住——重写时不能把「第一次写这一天」的时间冲掉，
 * 所以先读一次旧的 createdAt。多一次查询换来一个不会撒谎的时间戳。
 */
export function upsertJournalEntry(
  localDate: string,
  body: string,
  nowMs: number = Date.now()
): void {
  const existing = getDb().getFirstSync<{ created_at: number }>(
    'SELECT created_at FROM journal_entries WHERE local_date = ?',
    [localDate]
  );
  const createdAt = existing?.created_at ?? nowMs;

  getDb().runSync(
    `INSERT OR REPLACE INTO journal_entries (local_date, body, created_at, updated_at)
     VALUES (?, ?, ?, ?)`,
    [localDate, body, createdAt, nowMs]
  );
}

/**
 * 删掉某一天的日记。
 *
 * 返回 void 而不是「删没删掉」：`runSync` 的返回值里虽然有 `changes`，
 * 但仓库里其余的删除（`deleteReview` / `deleteGoal`）都不依赖它，
 * 而界面上「删了一天不存在的内容」与「删了一天存在的内容」没有区别。
 * 少一个返回值，就少一处要跟着 shim / 平台差异走的东西。
 */
export function deleteJournalEntry(localDate: string): void {
  getDb().runSync('DELETE FROM journal_entries WHERE local_date = ?', [localDate]);
}

/** 写过的天数。给「到现在为止写了多少天」这类中性计数用 */
export function countJournalEntries(): number {
  const row = getDb().getFirstSync<{ n: number }>('SELECT COUNT(*) AS n FROM journal_entries');
  return row?.n ?? 0;
}
