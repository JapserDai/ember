/**
 * Ember 数据层 · 首次启动种子数据
 *
 * 只写两行：1 个 player + 1 条 settings。
 * 不预写任何示例任务 —— 示例任务会污染统计与连胜，还得让用户先删，
 * 「今天」页只展示用户自己选择的事。
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_DAY_START_HOUR, businessDate } from '../domain/date';
import { newId } from './id';

/** 默认难度：轻松。与引导语「先选温和的，之后随时能改」一致。 */
const DEFAULT_DIFFICULTY = 'easy';
/** 默认主题 */
const DEFAULT_THEME_ID = 'furnace';
/** 默认明暗模式 */
const DEFAULT_THEME_MODE = 'system';

/** 启程礼：新玩家的初始余烬 */
const STARTER_EMBER = 30;
/** 启程礼：新玩家的初始材料 */
const STARTER_MATERIAL = 1;

/**
 * 数据库为空时写入种子数据；已有 player 行时直接返回，不会重复写入。
 *
 * 调用方：initDatabase()，在迁移完成之后。
 */
export function seedIfEmpty(db: SQLiteDatabase): void {
  const exists = db.getFirstSync<{ id: string }>('SELECT id FROM player LIMIT 1');
  if (exists) return;

  const now = Date.now();
  const playerId = newId();
  // last_settled_date 设为当天：首次启动不触发「补算历史」，用户看到的就是干净的第一天
  const today = businessDate(now, DEFAULT_DAY_START_HOUR);

  db.withTransactionSync(() => {
    // 玩家：1 级，XP 0，五维全 0，名字「旅人」
    db.runSync(
      `INSERT INTO player (
         id, display_name, level, xp_total, xp_in_level, highest_level,
         ember, material, onboarding_done, created_at, updated_at
       ) VALUES (?, ?, 1, 0, 0, 1, ?, ?, 0, ?, ?)`,
      [playerId, '旅人', STARTER_EMBER, STARTER_MATERIAL, now, now]
    );

    // 设置：单行，id 固定 'singleton'
    db.runSync(
      `INSERT INTO settings (
         id, player_id, day_start_hour, last_settled_date, week_starts_on,
         difficulty, theme_id, theme_mode, reduce_motion, haptics_enabled,
         max_seen_utc, last_time_zone, created_at, updated_at
       ) VALUES ('singleton', ?, ?, ?, 1, ?, ?, ?, 0, 1, ?, NULL, ?, ?)`,
      [
        playerId,
        DEFAULT_DAY_START_HOUR,
        today,
        DEFAULT_DIFFICULTY,
        DEFAULT_THEME_ID,
        DEFAULT_THEME_MODE,
        now,
        now,
        now,
      ]
    );
  });
}
