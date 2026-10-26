/**
 * Ember 数据层 · settings 仓库
 *
 * settings 永远只有 1 行（id = 'singleton'）。
 * 这一层的职责只是「读出来 / 改掉」，不包含任何业务判断 ——
 * 「难度决定倍率」「dayStart 决定业务日边界」这类规则属于 domain/。
 */
import { getDb } from '../client';
import type { Difficulty, ThemeId, ThemeMode } from '../schema';

/** settings 表的一行，字段名与数据库列一一对应 */
export interface SettingsRow {
  id: string;
  player_id: string;
  /** 日界小时，0–23，默认 4 */
  day_start_hour: number;
  /** 上次结算的业务日 YYYY-MM-DD，可能为 null */
  last_settled_date: string | null;
  /** 一周从哪天开始：1 = 周一，0 = 周日 */
  week_starts_on: number;
  difficulty: Difficulty;
  theme_id: ThemeId;
  theme_mode: ThemeMode;
  /** 0 / 1 */
  reduce_motion: number;
  /** 0 / 1 */
  haptics_enabled: number;
  /** 首页偏好（JSON 字符串，D62）。'{}' = 全用代码默认 */
  home_prefs: string;
  /** 日记偏好（JSON 字符串，D65）。'{}' = 全用代码默认 */
  journal_prefs: string;
  /** 见过的最大时间戳，用于检测系统时间回拨 */
  max_seen_utc: number;
  last_time_zone: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * 可修改字段（驼峰命名，给调用方用）。
 * 不包含 id / player_id / created_at —— 这几列创建后就不该改。
 */
export interface SettingsPatch {
  dayStartHour?: number;
  lastSettledDate?: string | null;
  weekStartsOn?: number;
  difficulty?: Difficulty;
  themeId?: ThemeId;
  themeMode?: ThemeMode;
  reduceMotion?: boolean;
  hapticsEnabled?: boolean;
  /** 首页偏好 JSON。写进来的必须是已经 stringify 过的串 */
  homePrefs?: string;
  /** 日记偏好 JSON。同上 */
  journalPrefs?: string;
  maxSeenUtc?: number;
  lastTimeZone?: string | null;
}

/**
 * 白名单映射：驼峰字段 → 数据库列。
 *
 * 更新时只允许这些键进入 SET 子句，键来自代码常量而不是用户输入，
 * 值一律走 ? 占位符，不存在拼接注入的问题。
 */
const COLUMN_MAP: Record<keyof SettingsPatch, string> = {
  dayStartHour: 'day_start_hour',
  lastSettledDate: 'last_settled_date',
  weekStartsOn: 'week_starts_on',
  difficulty: 'difficulty',
  themeId: 'theme_id',
  themeMode: 'theme_mode',
  reduceMotion: 'reduce_motion',
  hapticsEnabled: 'haptics_enabled',
  homePrefs: 'home_prefs',
  journalPrefs: 'journal_prefs',
  maxSeenUtc: 'max_seen_utc',
  lastTimeZone: 'last_time_zone',
};

/** 读取设置。种子数据保证这一行一定存在；不存在说明数据库没初始化好。 */
export function getSettings(): SettingsRow {
  const row = getDb().getFirstSync<SettingsRow>(
    `SELECT id, player_id, day_start_hour, last_settled_date, week_starts_on,
            difficulty, theme_id, theme_mode, reduce_motion, haptics_enabled,
            home_prefs, journal_prefs, max_seen_utc, last_time_zone, created_at, updated_at
       FROM settings
      WHERE id = 'singleton'`
  );

  if (!row) {
    throw new Error('settings 行不存在，数据库可能没有执行种子数据');
  }
  return row;
}

/** 设置行是否已存在（启动流程里判断用） */
export function settingsExist(): boolean {
  const row = getDb().getFirstSync<{ id: string }>(
    `SELECT id FROM settings WHERE id = 'singleton'`
  );
  return row !== null;
}

/**
 * 局部更新设置。只写传进来的字段，其余保持不变。
 * 传空对象时什么也不做，也不会碰 updated_at。
 */
export function updateSettings(patch: SettingsPatch): void {
  const keys = Object.keys(patch) as Array<keyof SettingsPatch>;
  if (keys.length === 0) return;

  const sets: string[] = [];
  const values: Array<string | number | null> = [];

  for (const key of keys) {
    const column = COLUMN_MAP[key];
    // 未知键直接跳过，避免拼出非法 SQL
    if (!column) continue;
    const value = patch[key];
    if (value === undefined) continue;

    sets.push(`${column} = ?`);
    // 布尔值在 SQLite 里存 0 / 1
    if (typeof value === 'boolean') {
      values.push(value ? 1 : 0);
    } else {
      values.push(value);
    }
  }

  if (sets.length === 0) return;

  const now = Date.now();
  sets.push('updated_at = ?');
  values.push(now);

  getDb().runSync(`UPDATE settings SET ${sets.join(', ')} WHERE id = 'singleton'`, values);
}

/** 更新「上次结算的业务日」 */
export function updateLastSettledDate(localDate: string): void {
  updateSettings({ lastSettledDate: localDate });
}

/** 更新日界小时（0–23） */
export function updateDayStartHour(hour: number): void {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`日界小时请选在 0–23 之间，收到 ${hour}`);
  }
  updateSettings({ dayStartHour: hour });
}

/** 更新难度 */
export function updateDifficulty(difficulty: Difficulty): void {
  updateSettings({ difficulty });
}

/*
 * 这里原来有一个 updateTheme(themeId, themeMode)。
 * 界面只剩一套主题之后它没有调用方了，删掉——留着一个没人调的写库函数，
 * 会让人以为某处还在改主题。
 * 两列本身（theme_id / theme_mode）和 SettingsPatch 里的对应字段都保留：
 * 表结构已发布，且将来主题回来时这两个字段直接就能用。
 */

/**
 * 记录「见过的最大时间戳」。
 *
 * 只在传入值更大时更新，用于发现系统时间被回拨。
 * 返回更新后的 max_seen_utc，调用方可以据此判断时钟是否异常。
 */
export function bumpMaxSeenUtc(nowMs: number): number {
  const row = getDb().getFirstSync<{ max_seen_utc: number }>(
    `SELECT max_seen_utc FROM settings WHERE id = 'singleton'`
  );
  const current = row?.max_seen_utc ?? 0;

  if (nowMs > current) {
    getDb().runSync(
      `UPDATE settings SET max_seen_utc = ?, updated_at = ? WHERE id = 'singleton'`,
      [nowMs, Date.now()]
    );
    return nowMs;
  }
  return current;
}

/** 更新记录的时区（启动与回前台时比较，变化则重排通知） */
export function updateLastTimeZone(timeZone: string): void {
  updateSettings({ lastTimeZone: timeZone });
}
