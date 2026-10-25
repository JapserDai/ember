/**
 * Ember 数据层 · 手写迁移器
 *
 * 用 SQLite 内置的 PRAGMA user_version 记录 schema 版本，不额外建版本表。
 *
 * 三条规则（写新迁移前先读一遍）：
 *   1. 只做加法：新增列一律给默认值。不要在同一迁移里删列或改类型。
 *   2. 已经发布过的迁移函数永远不修改，只能在数组末尾追加。
 *   3. 数组下标就是「从第几版升到第几版」：MIGRATIONS[0] 是 0 → 1。
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { MIGRATE_V1_TO_V2_SQL, SCHEMA_SQL_V1 } from './schema';

/** 代码期望的 schema 版本。每次新增迁移，这里要同步 +1。 */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * 迁移函数数组。
 * 每一项负责把数据库从「下标版本」升到「下标 + 1 版本」。
 */
const MIGRATIONS: ReadonlyArray<(db: SQLiteDatabase) => void> = [
  // 0 → 1：建立 v0.1 的 4 张表与索引
  (db) => {
    db.execSync(SCHEMA_SQL_V1);
  },

  // 1 → 2：settings.theme_id 的 CHECK 加上 'daybreak'（第四套主题「晨光」）
  // CHECK 改不了，只能重建表。settings 永远只有 1 行，重建的成本可以忽略。
  (db) => {
    db.execSync(MIGRATE_V1_TO_V2_SQL);
  },
];

/** 读取当前数据库的 schema 版本 */
export function readSchemaVersion(db: SQLiteDatabase): number {
  const row = db.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * 把数据库迁移到最新版本。
 *
 * 降级保护：数据库版本比代码新时直接抛错。
 * 这种情况只会发生在「装了旧版 App 打开新版数据库」，继续跑会读到不认识的列、
 * 甚至写坏数据，所以宁可拒绝启动。
 */
export function migrate(db: SQLiteDatabase): void {
  const current = readSchemaVersion(db);

  if (current > CURRENT_SCHEMA_VERSION) {
    throw new Error(
      `这个数据库来自更新版本的 Ember（数据库 v${current}，当前 App 只支持 v${CURRENT_SCHEMA_VERSION}）。请升级 App 后再打开。`
    );
  }

  if (current === CURRENT_SCHEMA_VERSION) return;

  // 整个迁移链放在一个事务里：要么全部成功，要么全部回滚，不会留下半套表
  db.withTransactionSync(() => {
    for (let version = current; version < CURRENT_SCHEMA_VERSION; version++) {
      const step = MIGRATIONS[version];
      if (!step) {
        // 代码里 CURRENT_SCHEMA_VERSION 加了但没写迁移函数，属于开发期错误
        throw new Error(`缺少迁移函数：v${version} → v${version + 1}`);
      }
      step(db);
    }
    // user_version 不支持参数占位符，只能拼字符串；这里拼的是代码常量，不是用户输入
    db.execSync(`PRAGMA user_version = ${CURRENT_SCHEMA_VERSION};`);
  });
}
