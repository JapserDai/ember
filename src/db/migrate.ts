/**
 * Ember 数据层 · 手写迁移器
 *
 * 用 SQLite 内置的 PRAGMA user_version 记录 schema 版本，不额外建版本表。
 *
 * 三条规则（写新迁移前先读一遍）：
 *   1. 只做加法：新增列一律给默认值。不要在同一迁移里删列或改类型。
 *   2. 已经发布过的迁移函数永远不修改，只能在数组末尾追加。
 *   3. 数组下标就是「从第几版升到第几版」：MIGRATIONS[0] 是 0 → 1。
 *
 * 第 2 条还有一条容易漏的推论：**被迁移函数引用的建表常量也不能改**。
 *   `SCHEMA_SQL_V1` 被 0→1 那一步引用，改它就等于改了已经发布过的迁移——
 *   只是编译器不会报，git diff 也看着像「补个注释」。
 *   v4→v5 那一步就是这个坑的实际代价：goal_id 后来被加进了 V1 的建表语句，
 *   于是在那之前建过库的安装永远缺这一列（`CREATE TABLE IF NOT EXISTS`
 *   不给已存在的表补列），首页与新建任务全部读写失败。
 *   要给老库补列，**只能新加一条迁移**，不要回头改建表常量。
 *   （改常量对全新安装有效，所以测试时很容易看不出来。）
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  GOALS_TABLE_SQL,
  MIGRATE_V1_TO_V2_SQL,
  MIGRATE_V2_TO_V3_SQL,
  MIGRATE_V3_TO_V4_SQL,
  MIGRATE_V4_TO_V5_SQL,
  MIGRATE_V5_TO_V6_SQL,
  MIGRATE_V6_TO_V7_SQL,
  MIGRATE_V7_TO_V8_SQL,
  MIGRATE_V8_TO_V9_SQL,
  MIGRATE_V9_TO_V10_SQL,
  MIGRATE_V10_TO_V11_SQL,
  MIGRATE_V11_TO_V12_SQL,
  MIGRATE_V12_TO_V13_SQL,
  MIGRATE_V13_TO_V14_SQL,
  MIGRATE_V14_TO_V15_SQL,
  MIGRATE_V15_TO_V16_SQL,
  MIGRATE_V16_TO_V17_SQL,
  SCHEMA_SQL_V1,
} from './schema';

/** 代码期望的 schema 版本。每次新增迁移，这里要同步 +1。 */
export const CURRENT_SCHEMA_VERSION = 17;

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

  // 2 → 3：player 加 avatar_data / avatar_updated_at，允许上传自定义头像。
  // 两列都是加法，旧行按 NULL / 0 补齐，所以老用户的头像不变（仍然是生成的那张）。
  (db) => {
    db.execSync(MIGRATE_V2_TO_V3_SQL);
  },

  // 3 → 4：player 加 bio，人物资料可以写一句自我介绍。
  // 加法，旧行按 NULL 补齐——NULL 表示「从来没写过」。
  (db) => {
    db.execSync(MIGRATE_V3_TO_V4_SQL);
  },

  // 4 → 5：补上 tasks.goal_id。
  //
  // 这一列**本该在 v1 建表时就存在**：`SCHEMA_SQL_V1` 里写了它，
  // 所以早期建的库都有；但在它被加进建表语句之前就已经装过 App 的库没有。
  // 而 `CREATE TABLE IF NOT EXISTS` 对已存在的表不做任何补充——
  // 于是那些库永远缺这一列，之后每一次读写 tasks 都报
  // 「no such column: goal_id」/「table tasks has no column named goal_id」，
  // 表现为：首页读不出数据、新建任务点了保存没反应。
  //
  // 为什么先查 PRAGMA 而不是直接 ALTER：
  //   SQLite 的 ADD COLUMN 没有 IF NOT EXISTS，列已存在时抛 duplicate column，
  //   而迁移链在一个事务里——一抛就整条回滚，用户永远卡在 v4 打不开。
  //   用 try/catch 也能达到目的，但那是拿异常当分支用；
  //   PRAGMA table_info 是「这一列在不在」的正规问法，两种情况都读得懂。
  (db) => {
    // 第二件事：如果这台设备上的库建得更早，`goals` 表可能整张都不存在
    // （早期的建表数组里还没有它）。GOALS_TABLE_SQL 带 IF NOT EXISTS，
    // 已经有表的库重复执行是空操作，所以这里不需要先查。
    db.execSync(GOALS_TABLE_SQL);

    const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(tasks)`);
    const hasGoalId = columns.some((column) => column.name === 'goal_id');
    if (!hasGoalId) {
      db.execSync(MIGRATE_V4_TO_V5_SQL);
    }

    // 索引同理：idx_tasks_goal 建在 goal_id 上，上面补完列才建得成。
    // 单独重建这两条而不是整段 INDEXES_SQL，是为了不碰其它索引——
    // 它们与这一步无关，重建一次只是多花时间。
    db.execSync(`
      CREATE INDEX IF NOT EXISTS idx_goals_player_status
        ON goals (player_id, status, sort_order) WHERE deleted_at IS NULL;
      CREATE INDEX IF NOT EXISTS idx_tasks_goal
        ON tasks (goal_id) WHERE goal_id IS NOT NULL AND deleted_at IS NULL;
    `);
  },

  // 5 → 6：tasks 加 reminder_minute，每个任务可以有自己的提醒时刻。
  //
  // 加列是纯加法：旧行按 NULL 补齐，而 NULL 正是「不提醒」——
  // 也就是说，**升级不会替用户偷偷打开任何提醒**。
  // 这一条很重要：通知是这个 App 里唯一会主动打扰人的东西，
  // 它必须由用户自己按下来，不能是某次升级的副作用。
  //
  // 这一列带 CHECK（0–1439 或 NULL）。SQLite 允许 ADD COLUMN 带 CHECK，
  // 约束会对**之后**的写入生效，已有行按 NULL 补齐也不会违反它。
  (db) => {
    db.execSync(MIGRATE_V5_TO_V6_SQL);
  },

  // 6 → 7：头像从「生成的人像 / 上传的照片」换成「七个像素动物挑一个」。
  //
  // 两件事：给 player 加 avatar_id（默认 'fox'），并把上一版上传的照片清掉。
  // 第二件是**删用户数据**，与迁移器「只做加法」的默认规矩相反，
  // 所以这里要写清为什么：上传照片这个能力已经整体移除（用户明确要求
  // 换成像素动物头像），那张 base64 永远不会再被画出来；留着它只会让
  // 数据库与每一份备份多背一张 8–20 KB 的死图片。
  //
  // 与 v4→v5 同一个坑：先查 PRAGMA 再加列。avatar_id 理论上不会已存在，
  // 但这条判断的成本是一次 PRAGMA，而漏掉它的成本是整条迁移链回滚。
  // 注意：列已存在时也要清照片——清照片是这次迁移的另一个目的。
  (db) => {
    const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(player)`);
    const hasAvatarId = columns.some((column) => column.name === 'avatar_id');
    if (!hasAvatarId) {
      db.execSync(MIGRATE_V6_TO_V7_SQL);
      return;
    }
    // 列已存在（理论上不会，但手改过库或重跑迁移的开发机可能）：
    // 只做清照片那一半。这一步要写成单独一句，而不是重新跑整个常量——
    // 重跑会在 ALTER 上抛 duplicate column，把整条迁移链回滚。
    db.execSync('UPDATE player SET avatar_data = NULL, avatar_updated_at = 0;');
  },

  // 7 → 8：加 streak_bridges 表（连胜的宽限券与修复，D38）。
  //
  // 这一步是纯加法：建一张新表，**不改任何已有的表与列**。
  // 老库升级上来表是空的，于是宽限券从「本月一张都没用」开始算，
  // 连胜的现算结果与升级前完全一致——升级本身不会让任何人的连胜变长或变短。
  //
  // 建表用 IF NOT EXISTS（在常量里），所以重复执行是空操作。
  // 不需要像 v4→v5 那样先查 PRAGMA：这里加的是表，不是列，
  // 而 CREATE TABLE IF NOT EXISTS 对已存在的表本来就是幂等的。
  (db) => {
    db.execSync(MIGRATE_V7_TO_V8_SQL);
  },

  // 8 → 9：加 reviews 表（周复盘）。
  //
  // 纯加法：建一张新表，不碰任何已有的表与列。
  // 老库升级上来表是空的——「一周都没写过」，而这正是真实情况：
  // 升级不会凭空替任何人补出几份复盘。
  (db) => {
    db.execSync(MIGRATE_V8_TO_V9_SQL);
  },

  // 9 → 10：加 month_reviews 表（月复盘）。
  //
  // 纯加法，与上一步同一个形态。老库升级上来是空的——
  // 「一个月都没写过」，这是真实情况，升级不该凭空补出几份。
  (db) => {
    db.execSync(MIGRATE_V9_TO_V10_SQL);
  },

  // 10 → 11：player 加 refined_material（材料合成的产出）。
  //
  // 这一条与 v4→v5 / v6→v7 同一个坑：ALTER TABLE ADD COLUMN 没有 IF NOT EXISTS，
  // 列已存在时抛 duplicate column，而迁移链在一个事务里——一抛就整条回滚，
  // 用户永远卡在旧版本打不开。
  // 所以先查 PRAGMA table_info，两种情况都读得懂。
  (db) => {
    const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(player)`);
    const hasRefined = columns.some((column) => column.name === 'refined_material');
    if (!hasRefined) {
      db.execSync(MIGRATE_V10_TO_V11_SQL);
    }
  },

  // 11 → 12：player 加 last_event_reward_month（月度奖励发到哪个月了）。
  //
  // 同一个坑（v4→v5 / v6→v7 / v10→v11）：先查 PRAGMA 再加列。
  (db) => {
    const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(player)`);
    const hasMonth = columns.some((column) => column.name === 'last_event_reward_month');
    if (!hasMonth) {
      db.execSync(MIGRATE_V11_TO_V12_SQL);
    }
  },

  // 12 → 13：player 加 guide_start_date（D1–D7 引导的起算日）。
  //
  // 同一个坑（v4→v5 / v6→v7 / v10→v11 / v11→v12）：先查 PRAGMA 再加列。
  // 老库升级上来是 NULL，不是「今天」——补锚点这件事属于业务判断，
  // 放在 services/guide.ts 里做（迁移只改结构，不替用户决定日期）。
  (db) => {
    const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(player)`);
    const hasGuide = columns.some((column) => column.name === 'guide_start_date');
    if (!hasGuide) {
      db.execSync(MIGRATE_V12_TO_V13_SQL);
    }
  },

  // 13 → 14：加 journal_entries 表（每天写一句，D49）。
  //
  // 纯加法，与 v7→v8 / v8→v9 / v9→v10 同一个形态：
  // 建一张新表，不碰任何已有的表与列。
  // 老库升级上来是空的——「一天都没写过」，这是真实情况，
  // 升级不该凭空替任何人补出几篇日记。
  //
  // 不需要查 PRAGMA：这里加的是**表**不是列，
  // 而常量里用的是 CREATE TABLE IF NOT EXISTS，重复执行是空操作。
  (db) => {
    db.execSync(MIGRATE_V13_TO_V14_SQL);
  },

  // 14 → 15：player 加三个持有物列（商店扩成三类，D53）。
  //
  // 同一个坑（v4→v5 / v6→v7 / v10→v11 / v11→v12 / v12→v13）：**先查 PRAGMA 再加列**。
  // 这里一次加三列，所以逐条查；任何一列已存在就跳过它。
  // 老库升级上来是 0 —— 「一个都没有」，这是真实情况，不替任何人补。
  (db) => {
    const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(player)`);
    const has = (name: string) => columns.some((column) => column.name === name);
    for (const sql of MIGRATE_V14_TO_V15_SQL.split(';').map((x) => x.trim()).filter(Boolean)) {
      const name = sql.match(/ADD COLUMN \w+/)?.[1];
      if (name && has(name)) continue;
      db.execSync(sql + ';');
    }
  },

  // 15 → 16：settings 加一列 home_prefs（首页偏好，D62）。
  //
  // 同一个坑（v4→v5 起每一次加列都踩过）：**先查 PRAGMA 再加列**。
  // 这一列是 TEXT NOT NULL DEFAULT '{}'，老库升级上来是 '{}'，
  // 也就是「全用代码里的默认」——升级不替任何人改变首页的长相。
  (db) => {
    const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(settings)`);
    if (columns.some((column) => column.name === 'home_prefs')) return;
    db.execSync(MIGRATE_V15_TO_V16_SQL);
  },

  // 16 → 17：settings 加 journal_prefs（日记偏好，D65）。
  //
  // 独立一条而不是并进 v16——原因见 schema.ts 里那段长注释：
  // v16 已经在真实数据库上执行过，改它就等于改已发布的迁移。
  (db) => {
    const columns = db.getAllSync<{ name: string }>(`PRAGMA table_info(settings)`);
    if (columns.some((column) => column.name === 'journal_prefs')) return;
    db.execSync(MIGRATE_V16_TO_V17_SQL);
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
