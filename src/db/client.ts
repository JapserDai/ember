/**
 * Ember 数据层 · 数据库连接
 *
 * 职责：
 *   1. 打开（或复用）唯一的数据库连接，导出单例。
 *   2. 每次打开连接都重新设置 PRAGMA —— foreign_keys 是「按连接」生效的，不能只设一次。
 *   3. 提供 initDatabase()：打开 → PRAGMA → 迁移 → 首次种子，App 启动时调用一次即可。
 *
 * 注意：expo-sqlite 的同步 API 只能在 JS 线程调用，且不要在渲染期间调用，
 * 统一放在启动流程与事件回调里。
 *
 * 依赖说明：package.json 里还没有 expo-sqlite（阶段 0 只装了最小依赖）。
 * 启用这一层之前，先执行：
 *     npx expo install expo-sqlite
 * 该命令会按 SDK 58 选择匹配的版本，不需要手改 package.json。
 */
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import { newId } from './id';
import { migrate } from './migrate';
import { seedIfEmpty } from './seed';

export { newId };

/** 数据库文件名。放在 App 私有目录下，卸载即删除。 */
export const DB_NAME = 'ember.db';

/** 单例连接。null 表示还没打开。 */
let instance: SQLiteDatabase | null = null;

/** 是否已经跑过「迁移 + 种子」，避免重复执行 */
let initialized = false;

/**
 * 打开数据库连接并设置 PRAGMA。
 * 重复调用返回同一个连接，不会重复打开文件。
 */
export function openDatabase(): SQLiteDatabase {
  if (instance) return instance;

  const db = openDatabaseSync(DB_NAME);

  // WAL：读写并发更好，崩溃恢复更稳
  db.execSync('PRAGMA journal_mode = WAL;');
  // SQLite 默认关闭外键约束，每个连接都要单独打开
  db.execSync('PRAGMA foreign_keys = ON;');
  // WAL 下兼顾安全与性能
  db.execSync('PRAGMA synchronous = NORMAL;');
  // 写锁最多等 5 秒，避免直接抛 SQLITE_BUSY
  db.execSync('PRAGMA busy_timeout = 5000;');

  instance = db;
  return db;
}

/**
 * 取已打开的连接。未打开时直接报错，而不是偷偷打开 ——
 * 这样「忘记初始化数据库」会在开发阶段立刻暴露，而不是变成难查的运行时问题。
 */
export function getDb(): SQLiteDatabase {
  if (!instance) {
    throw new Error('数据库还没有打开，请先在 App 启动时调用 initDatabase()');
  }
  return instance;
}

/**
 * App 启动时调用一次：打开连接 → 迁移到最新版本 → 首次启动写种子数据。
 * 返回可用的连接。
 */
export function initDatabase(): SQLiteDatabase {
  const db = openDatabase();

  if (!initialized) {
    migrate(db);
    seedIfEmpty(db);
    initialized = true;
  }

  return db;
}

/**
 * 在事务里执行一段同步逻辑，并返回它的结果。
 *
 * 用法：把「写打卡 + 改 player 快照」这类要同生共死的操作包在一起。
 * 回调里抛错时 expo-sqlite 会自动回滚。
 *
 * 注意：expo-sqlite 的 withTransactionSync 本身不返回回调的返回值，
 * 所以这里用一个局部变量接一下。
 */
export function runInTransaction<T>(fn: () => T): T {
  let result: T;
  getDb().withTransactionSync(() => {
    result = fn();
  });
  // 事务回调必然同步执行完毕，这里的赋值一定已发生
  return result!;
}

/**
 * 关闭连接（只在测试或极端场景使用，正常 App 生命周期不需要）。
 */
export function closeDatabase(): void {
  if (!instance) return;
  instance.closeSync();
  instance = null;
  initialized = false;
}
