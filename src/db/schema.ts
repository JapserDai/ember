/**
 * Ember 数据层 · 建表 SQL（v0.1 只有 4 张表）
 *
 * 设计要点：
 *   1. 业务日一律用 local_date TEXT（YYYY-MM-DD），UTC 毫秒只用于审计与排序。
 *   2. checkins 是事实表（只追加），player 是快照表（可由 checkins 重建）。
 *   3. tasks 用软删除（deleted_at），checkins 不删除，只把 status 改成 reversed。
 *
 * 这些字符串由 migrate.ts 在版本 0 → 1 时整段执行一次，之后不再改动。
 * 以后要加字段，新开一条迁移，用 ALTER TABLE 追加，不改这里的旧 SQL。
 */

// ============================================================
// 枚举类型
//
// 这里不重新定义一遍，而是从 domain/ 转出：
// 数值规则与类型只允许有一个来源，否则 CHECK 约束和 TypeScript 类型迟早对不上。
// db 依赖 domain 是允许的，反过来不允许（domain 要保持纯净）。
// ============================================================

/** 五维属性键：体魄 / 心智 / 秩序 / 心力 / 联结 */
export type { AttributeKey } from '../domain/balance';
/** 属性键的固定顺序，遍历时用 */
export { ATTRIBUTE_KEYS } from '../domain/balance';

/** 任务类型：习惯 / 待办 / 奖励 */
export type { TaskKind as TaskType } from '../domain/recurrence';
/** 重复规则 */
export type { RecurrenceKind as Recurrence } from '../domain/recurrence';
/** 任务状态 */
export type { TaskStatus } from '../domain/recurrence';

/** 难度 */
export type { DifficultyKey as Difficulty } from '../domain/balance';

/**
 * 主题 id —— **界面暂时不用**。
 *
 * 界面现在只有一套白底主题（见 theme/tokens.ts），ThemeProvider 也不再读写这两个字段。
 * 但 settings 表和它的 CHECK 约束已经发布过（v1、v2 两个版本的建表 SQL 都写了
 * `theme_id IN (...)`），而「已发布的建表常量永不修改」是 D31 立的规矩，
 * 所以这两列原样留着，取值也照样声明 —— 只是暂时没有读者。
 *
 * 将来主题回来时，直接照着这里加取值 + 写一条扩 CHECK 的迁移即可。
 * 到那时要注意：**不要**忘记建表 SQL 里的 CHECK 也要同步（新增的取值只在迁移里扩）。
 */
export type ThemeId = 'furnace' | 'nightvoyage' | 'tundra' | 'daybreak';

/** 明暗模式 */
export type ThemeMode = 'system' | 'light' | 'dark';

/** 打卡来源 */
export type CheckinSource = 'manual' | 'backfill' | 'import';

/** 打卡状态（reversed = 已撤销，仍保留在表里） */
export type CheckinStatus = 'active' | 'reversed';

/** 表 1：player —— 玩家快照（永远只有 1 行） */
export const PLAYER_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS player (
  id            TEXT PRIMARY KEY NOT NULL,   -- 本地生成的 ID，同时参与随机种子
  display_name  TEXT NOT NULL DEFAULT '旅人',

  -- 等级与经验
  level         INTEGER NOT NULL DEFAULT 1
                  CHECK (level BETWEEN 1 AND 50),
  xp_total      INTEGER NOT NULL DEFAULT 0
                  CHECK (xp_total >= 0),      -- 历史累计 XP
  xp_in_level   INTEGER NOT NULL DEFAULT 0
                  CHECK (xp_in_level >= 0),   -- 当前等级内的进度
  highest_level INTEGER NOT NULL DEFAULT 1
                  CHECK (highest_level BETWEEN 1 AND 50), -- 历史最高，撤销记录时也不回退

  -- 五维属性：每列存「属性 XP」，满 200 转 1 点，余数保留
  attr_body_xp    INTEGER NOT NULL DEFAULT 0 CHECK (attr_body_xp   BETWEEN 0 AND 199), -- 体魄
  attr_mind_xp    INTEGER NOT NULL DEFAULT 0 CHECK (attr_mind_xp   BETWEEN 0 AND 199), -- 心智
  attr_order_xp   INTEGER NOT NULL DEFAULT 0 CHECK (attr_order_xp  BETWEEN 0 AND 199), -- 秩序
  attr_spirit_xp  INTEGER NOT NULL DEFAULT 0 CHECK (attr_spirit_xp BETWEEN 0 AND 199), -- 心力
  attr_bond_xp    INTEGER NOT NULL DEFAULT 0 CHECK (attr_bond_xp   BETWEEN 0 AND 199), -- 联结
  attr_body_pts   INTEGER NOT NULL DEFAULT 0 CHECK (attr_body_pts   >= 0), -- 已获得的属性点
  attr_mind_pts   INTEGER NOT NULL DEFAULT 0 CHECK (attr_mind_pts   >= 0),
  attr_order_pts  INTEGER NOT NULL DEFAULT 0 CHECK (attr_order_pts  >= 0),
  attr_spirit_pts INTEGER NOT NULL DEFAULT 0 CHECK (attr_spirit_pts >= 0),
  attr_bond_pts   INTEGER NOT NULL DEFAULT 0 CHECK (attr_bond_pts   >= 0),

  -- 货币
  ember         INTEGER NOT NULL DEFAULT 0 CHECK (ember >= 0),      -- 余烬（软货币）
  material      INTEGER NOT NULL DEFAULT 0 CHECK (material >= 0),   -- 材料（硬货币，v0.4 才用）

  onboarding_done INTEGER NOT NULL DEFAULT 0 CHECK (onboarding_done IN (0,1)),

  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);
`;

/** 表 2：settings —— 设置（永远只有 1 行，id 固定为 'singleton'） */
export const SETTINGS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  id               TEXT PRIMARY KEY NOT NULL DEFAULT 'singleton'
                     CHECK (id = 'singleton'),
  player_id        TEXT NOT NULL REFERENCES player(id) ON DELETE CASCADE,

  -- 业务日
  day_start_hour   INTEGER NOT NULL DEFAULT 4
                     CHECK (day_start_hour BETWEEN 0 AND 23),
  last_settled_date TEXT,        -- 上次结算的业务日；首次启动设为当天，避免补算历史
  week_starts_on   INTEGER NOT NULL DEFAULT 1 CHECK (week_starts_on IN (0,1)), -- 1 = 周一

  -- 难度与外观
  difficulty       TEXT NOT NULL DEFAULT 'easy'
                     CHECK (difficulty IN ('easy','standard','hard')),  -- 默认轻松
  -- v1 只认前三套。晨光（daybreak）由迁移 2 重写这张表时加进来，见 SCHEMA_SQL_V2
  theme_id         TEXT NOT NULL DEFAULT 'furnace'
                     CHECK (theme_id IN ('furnace','nightvoyage','tundra')),
  theme_mode       TEXT NOT NULL DEFAULT 'system'
                     CHECK (theme_mode IN ('system','light','dark')),
  reduce_motion    INTEGER NOT NULL DEFAULT 0 CHECK (reduce_motion IN (0,1)),
  haptics_enabled  INTEGER NOT NULL DEFAULT 1 CHECK (haptics_enabled IN (0,1)),

  -- 时钟异常检测
  max_seen_utc     INTEGER NOT NULL DEFAULT 0,   -- 见过的最大时间戳，用于发现系统时间回拨
  last_time_zone   TEXT,                          -- 上次记录的时区

  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
`;

/** 表 3：tasks —— 三类任务（习惯 / 待办 / 奖励）共用一张表 + type 判别键 */
export const TASKS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id               TEXT PRIMARY KEY NOT NULL,
  player_id        TEXT NOT NULL REFERENCES player(id) ON DELETE CASCADE,

  title            TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
  notes            TEXT,

  -- 类型
  type             TEXT NOT NULL CHECK (type IN ('habit','todo','reward')),

  -- 重复规则
  recurrence       TEXT NOT NULL CHECK (recurrence IN (
                     'daily',        -- 每天
                     'weekly_days',  -- 每周固定几天
                     'monthly_days', -- 每月固定几号
                     'every_x_days', -- 每 N 天
                     'weekly_times', -- 每周 N 次（灵活）
                     'once'          -- 一次性（待办 / 奖励）
                   )),
  recurrence_config TEXT NOT NULL DEFAULT '{}',   -- JSON，例如 {"days":[1,3,5]}
  anchor_date      TEXT,      -- every_x_days 的锚点业务日
  interval_n       INTEGER CHECK (interval_n IS NULL OR interval_n BETWEEN 1 AND 365),
  weekly_target    INTEGER CHECK (weekly_target IS NULL OR weekly_target BETWEEN 1 AND 7),

  start_date       TEXT NOT NULL,   -- 生效业务日
  end_date         TEXT,            -- 结束业务日（含）
  due_date         TEXT,            -- 待办截止日

  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','paused','done','archived')),
  completed_at     INTEGER,         -- 待办完成时间（毫秒）

  -- 五维属性归属
  attribute        TEXT NOT NULL
                     CHECK (attribute IN ('body','mind','order','spirit','bond')),

  -- 显示
  icon             TEXT,
  color            TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,

  -- 打卡控制
  max_per_day      INTEGER NOT NULL DEFAULT 1 CHECK (max_per_day BETWEEN 1 AND 10),
  allow_backfill   INTEGER NOT NULL DEFAULT 1 CHECK (allow_backfill IN (0,1)),

  -- 奖励类专用
  ember_cost       INTEGER NOT NULL DEFAULT 0 CHECK (ember_cost >= 0),

  -- 目标归属（可选）。一个任务最多属于一个目标
  -- 不加外键：目标删除是软删除，由 repo 层负责把关联任务的 goal_id 置空
  goal_id          TEXT,

  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL,
  deleted_at       INTEGER,        -- 软删除：NULL = 未删除

  -- 类型与重复规则自洽：习惯不能用 once，待办 / 奖励只能是 once
  CHECK (
    (type = 'habit' AND recurrence IN ('daily','weekly_days','monthly_days','every_x_days','weekly_times'))
    OR (type IN ('todo','reward') AND recurrence = 'once')
  ),
  -- weekly_times 要给出每周目标次数
  CHECK (recurrence <> 'weekly_times' OR weekly_target IS NOT NULL),
  -- every_x_days 要给出间隔与锚点
  CHECK (recurrence <> 'every_x_days' OR (interval_n IS NOT NULL AND anchor_date IS NOT NULL))
);
`;

/**
 * 表 4：checkins —— 打卡事实表（只追加，是 XP 的唯一来源）
 *
 * 奖励明细在写入时固化，以后调数值不改历史记录。
 * v0.1 的规则：同一任务同一业务日只保留一条有效记录，
 * 所以 uq_checkin_active 只按 (task_id, local_date) 建。
 * max_per_day > 1 的多次计数留给后续版本，届时索引要改成含 score_count。
 */
export const CHECKINS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS checkins (
  id             TEXT PRIMARY KEY NOT NULL,
  player_id      TEXT NOT NULL REFERENCES player(id) ON DELETE CASCADE,
  task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE RESTRICT,

  -- 业务日
  local_date     TEXT NOT NULL
                   CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  score_count    INTEGER NOT NULL DEFAULT 0 CHECK (score_count >= 0),  -- 同日第几次（0 基）
  occurred_at    INTEGER NOT NULL,     -- 真实发生时间（毫秒），只用于排序

  source         TEXT NOT NULL DEFAULT 'manual'
                   CHECK (source IN ('manual','backfill','import')),
  status         TEXT NOT NULL DEFAULT 'active'
                   CHECK (status IN ('active','reversed')),

  -- 奖励明细：写入时固化
  base_xp        INTEGER NOT NULL CHECK (base_xp >= 0),
  xp_awarded     INTEGER NOT NULL CHECK (xp_awarded >= 0),
  base_ember     INTEGER NOT NULL CHECK (base_ember >= 0),
  ember_awarded  INTEGER NOT NULL CHECK (ember_awarded >= 0),
  attr_key       TEXT NOT NULL
                   CHECK (attr_key IN ('body','mind','order','spirit','bond')),
  attr_xp_awarded INTEGER NOT NULL CHECK (attr_xp_awarded >= 0),
  multiplier     REAL NOT NULL CHECK (multiplier >= 0),  -- 难度倍率 × 补记比例
  is_capped      INTEGER NOT NULL DEFAULT 0 CHECK (is_capped IN (0,1)),

  -- 随机只影响文案与动画，不影响数值
  prng_seed      TEXT NOT NULL,
  flavor_key     TEXT,

  reversed_at    INTEGER,
  reverse_reason TEXT,

  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,

  -- 同一任务同一天的第 N 次唯一（撤销后重记也不会撞主键）
  UNIQUE (task_id, local_date, score_count)
);
`;

/**
 * 表 5：goals —— 目标（v0.3 才用，v0.1 建表但不接界面）
 *
 * 目标只有一句话、一个可选截止日、一个状态。
 * 没有子目标、没有阶段、没有百分比。
 *
 * 进度不存字段，每次由「关联任务完成了几个 / 一共几个」现算。
 * 存字段就得同步维护，一处漏改就永远对不上；现算永远不会错。
 * 关联走 tasks.goal_id，一个任务最多属于一个目标。
 */
export const GOALS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS goals (
  id            TEXT PRIMARY KEY NOT NULL,
  player_id     TEXT NOT NULL REFERENCES player(id) ON DELETE CASCADE,

  -- 一句话目标，例如「把睡眠找回来」
  title         TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 80),
  -- 为什么想走这一段（可选）。这是回头时最想看到的那句话
  why           TEXT,

  -- 截止日（可选）。不填就是不限期，不显示倒计时
  due_date      TEXT,

  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','done','archived')),
  completed_at  INTEGER,

  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  deleted_at    INTEGER,

  CHECK (due_date IS NULL
         OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);
`;

/** 索引：按「今天要做什么」「某天打了哪些卡」这两类查询来建 */
export const INDEXES_SQL = `
CREATE INDEX IF NOT EXISTS idx_tasks_player_status
  ON tasks (player_id, status, type) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_due
  ON tasks (player_id, due_date) WHERE deleted_at IS NULL;

-- 同一任务同一业务日只能有一条有效记录（撤销后可重记）
CREATE UNIQUE INDEX IF NOT EXISTS uq_checkin_active
  ON checkins (task_id, local_date)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_checkins_player_date
  ON checkins (player_id, local_date, status);

CREATE INDEX IF NOT EXISTS idx_checkins_task_date
  ON checkins (task_id, local_date, status);

-- 目标的列表按状态分组、按排序值排
CREATE INDEX IF NOT EXISTS idx_goals_player_status
  ON goals (player_id, status, sort_order) WHERE deleted_at IS NULL;

-- 按目标取它下面的任务，用来算进度
CREATE INDEX IF NOT EXISTS idx_tasks_goal
  ON tasks (goal_id) WHERE goal_id IS NOT NULL AND deleted_at IS NULL;
`;

/**
 * 完整建库脚本：迁移器从版本 0 升到 1 时整段执行。
 *
 * 注意 goals 表在这里就建好，虽然 v0.1 的界面还不接它。
 * 理由：建表是幂等的（IF NOT EXISTS），现在建好，v0.3 接界面时不用再写迁移；
 * 而迁移器每加一条都要在真机上验证一遍，能省一条是一条。
 */
export const SCHEMA_SQL_V1 = [
  PLAYER_TABLE_SQL,
  SETTINGS_TABLE_SQL,
  TASKS_TABLE_SQL,
  CHECKINS_TABLE_SQL,
  GOALS_TABLE_SQL,
  INDEXES_SQL,
].join('\n');

// ============================================================
// 迁移 2：settings.theme_id 的取值加 'daybreak'
//
// CHECK 约束改不了，SQLite 只能「建新表 → 拷数据 → 删旧表 → 改名」。
// 这段 SQL 只被 migrate.ts 在 1 → 2 时执行一次，写在这里是为了和建表 SQL 放在一起对照。
//
// 为什么要重建而不是干脆不做约束：settings 只有 1 行，重建成本可以忽略；
// 而 theme_id 一旦写进非法值，界面会静默回退到炉边，用户会觉得「主题设置丢了」。
// 宁可让非法值在写入时直接报错。
//
// 拷数据时逐列写死列名，不用 SELECT * —— 列顺序变了也不会错位。
// ============================================================

/** v2 的 settings 表：与 v1 相同，只有 theme_id 的 CHECK 多了 'daybreak' */
export const SETTINGS_TABLE_SQL_V2 = `
CREATE TABLE settings_v2 (
  id               TEXT PRIMARY KEY NOT NULL DEFAULT 'singleton'
                     CHECK (id = 'singleton'),
  player_id        TEXT NOT NULL REFERENCES player(id) ON DELETE CASCADE,

  day_start_hour   INTEGER NOT NULL DEFAULT 4
                     CHECK (day_start_hour BETWEEN 0 AND 23),
  last_settled_date TEXT,
  week_starts_on   INTEGER NOT NULL DEFAULT 1 CHECK (week_starts_on IN (0,1)),

  difficulty       TEXT NOT NULL DEFAULT 'easy'
                     CHECK (difficulty IN ('easy','standard','hard')),
  theme_id         TEXT NOT NULL DEFAULT 'furnace'
                     CHECK (theme_id IN ('furnace','nightvoyage','tundra','daybreak')),
  theme_mode       TEXT NOT NULL DEFAULT 'system'
                     CHECK (theme_mode IN ('system','light','dark')),
  reduce_motion    INTEGER NOT NULL DEFAULT 0 CHECK (reduce_motion IN (0,1)),
  haptics_enabled  INTEGER NOT NULL DEFAULT 1 CHECK (haptics_enabled IN (0,1)),

  max_seen_utc     INTEGER NOT NULL DEFAULT 0,
  last_time_zone   TEXT,

  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
`;

/**
 * 整个 1 → 2 迁移：重建 settings、给 player 加头像的重掷计数。
 * 包在 migrate.ts 的那个事务里，全成或全不成。
 */
export const MIGRATE_V1_TO_V2_SQL = `
${SETTINGS_TABLE_SQL_V2}
INSERT INTO settings_v2 (
  id, player_id, day_start_hour, last_settled_date, week_starts_on,
  difficulty, theme_id, theme_mode, reduce_motion, haptics_enabled,
  max_seen_utc, last_time_zone, created_at, updated_at
)
SELECT
  id, player_id, day_start_hour, last_settled_date, week_starts_on,
  difficulty, theme_id, theme_mode, reduce_motion, haptics_enabled,
  max_seen_utc, last_time_zone, created_at, updated_at
FROM settings;
DROP TABLE settings;
ALTER TABLE settings_v2 RENAME TO settings;

-- 头像的重掷计数。图案本身不存：它由 (player.id, avatar_seed) 算出来。
-- 存一个整数而不是一段 SVG / 一张图片，是为了让导入导出只多带一个数字，
-- 也保证「同一个 id + 同一个计数 = 同一个头像」在任何设备上成立。
-- ALTER TABLE 加列带 CHECK 在 SQLite 里是允许的：旧行按默认值 0 补齐。
ALTER TABLE player ADD COLUMN avatar_seed INTEGER NOT NULL DEFAULT 0
  CHECK (avatar_seed >= 0);
`;

// ============================================================
// 迁移 3：玩家可以上传自己的头像
//
// 原本（D20）头像是纯生成的，一个 avatar_seed 整数就够。现在允许上传一张图，
// 就必须存下这张图本身——但**只存一份小图**，不存原图：
//
//   - 存原图要处理 4K 照片、要占几 MB、要在备份里带上几 MB 的 base64。
//   - 头像最大只显示 64px（导出备份时按 128px 算也够），所以一律先缩到 256×256
//     再转成 JPEG 存进来。一张 256×256 的 JPEG 大约 8–20 KB，SQLite 里放得下。
//
// 存 base64 文本而不是 BLOB：
//   1. expo-sqlite 的同步 API 对 BLOB 支持要绕（Uint8Array 进出），
//      base64 字符串是最不容易出错的形式；
//   2. 导出 JSON 时不用再做一次编码，直接把字符串塞进去就行；
//   3. 代价是体积大 33%，但 256×256 的图本来就小，这点代价可以接受。
//
// avatar_data 为 NULL 表示「没上传过，用生成的人像」——老用户升级上来就是 NULL，
// 不需要写任何数据迁移。
//
// 为什么不建一张新表：头像和玩家是 1:1，且永远只有一行；单开一张表只会多一次 JOIN
// 和一条「这张表什么时候会有第二行」的疑问。
// ============================================================

/** 2 → 3：player 加两列，存自定义头像的图片与它的更新时间 */
export const MIGRATE_V2_TO_V3_SQL = `
-- 自定义头像的图片，base64 编码的 JPEG（不含 data: 前缀）。
-- 为 NULL 表示没上传过，界面用 (id, avatar_seed) 生成的人像。
ALTER TABLE player ADD COLUMN avatar_data TEXT;

-- 上传时间。只用于显示「什么时候换的」与备份里的可读性，不参与任何逻辑。
-- 0 表示没上传过。
ALTER TABLE player ADD COLUMN avatar_updated_at INTEGER NOT NULL DEFAULT 0;
`;

// ============================================================
// 迁移 4：玩家可以写一句自我介绍
//
// 「人物资料」在这一版只包含三样：名字、一句自我介绍、头像。
// 名字与头像在 v1–v3 已经有了，这里只补 bio。
//
// 为什么加在 player 表上而不是 settings：
//   settings 是「把 App 调成你想要的样子」，player 是「你是谁、你走到了哪儿」。
//   名字与自我介绍都属于后者。分开放的话，「导出我的资料」要查两张表，
//   而其中一张永远是单行——这种拆法只增加理解成本。
//
// 为什么默认是 NULL 而不是 ''：
//   NULL 表示「从来没写过」，'' 表示「写过、后来清空了」。
//   这一版界面对两者一视同仁（都不显示那一行），但导出与以后可能的
//   「引导里让新用户写一句」需要区分。用 NULL 也顺手省掉一次数据迁移。
// ============================================================

/** 3 → 4：player 加一列自我介绍 */
export const MIGRATE_V3_TO_V4_SQL = `
-- 一句自我介绍。NULL 表示从来没写过，'' 表示写过又清空了。
-- 上限由 domain/profile.ts 的 BIO_MAX 管（80 字），这里不加 CHECK：
-- 长度按「用户感知的字数」算，SQLite 的 length() 算的是码点，
-- 两边规则不一致的话，会在边界上出现「界面允许但写库报错」。
ALTER TABLE player ADD COLUMN bio TEXT;
`;

// ============================================================
// 迁移 5：补上 tasks.goal_id
//
// 这一列在**当前**的 SCHEMA_SQL_V1 里是有的，所以从 v1 一次建起来的库不缺。
// 但在它被写进建表语句之前就已经创建过数据库的安装，`CREATE TABLE IF NOT EXISTS`
// 不会给已存在的表补列——那些库永远缺 goal_id。
//
// 症状：每次读写 tasks 都报 no such column: goal_id，首页整页读不出数据，
// 新建任务点了保存没有任何反应（INSERT 里带了这一列）。
//
// 为什么现在才发现：迁移器从 v1 到 v4 没有一步碰过 tasks 的列，
// 而 v1 的建表语句被改过——「已发布的迁移永不修改」这条规则管住了迁移函数，
// 没管住被它引用的建表常量。
// ============================================================

/** 4 → 5：tasks 加 goal_id（只对缺这一列的库执行，见 migrate.ts） */
export const MIGRATE_V4_TO_V5_SQL = `
-- 关联目标（可选）。一个任务最多属于一个目标。
-- 不加外键：目标删除是软删除，由 repo 层负责把关联任务的 goal_id 置空。
ALTER TABLE tasks ADD COLUMN goal_id TEXT;
`;

// ============================================================
// 迁移 6：tasks 加 reminder_minute —— 每个任务自己的提醒时刻
//
// 为什么存「从零点起的分钟数」而不是 "20:30" 这样的字符串：
//   - 一个整数就能排序、比较、做 CHECK，字符串要解析才能比；
//   - 排序时「早上 8 点」排在「晚上 20 点」前面，是数字序，不是字典序；
//   - 时区变化不影响它 —— 它记的是「墙上时钟的几点」，不是绝对时刻。
//
// 为什么 NULL 表示「不提醒」而不是 0：
//   0 是合法的（午夜 0 点提醒），用一个合法值表示「没有」会让两者分不开。
//   与 bio、due_date 一样：NULL 是「没设过」，不是「设成了空」。
//
// 为什么是 0–1439 而不是 0–23 与 0–59 两列：
//   两列就多一种非法组合（hour=24、minute=99），要写两条 CHECK 去挡。
//   一列分钟数只有一个区间，越界直接拒绝。
//
// 这一列**不参与任何数值计算**：提醒只是提醒，不因为设了提醒多发一点 XP。
// ============================================================

/** 5 → 6：tasks 加 reminder_minute（每个任务自己的提醒时刻） */
export const MIGRATE_V5_TO_V6_SQL = `
-- 提醒时刻：从当天零点起的分钟数，0 = 00:00，1439 = 23:59。NULL = 不提醒。
-- 只对活跃任务生效：暂停、归档、已删除、已完成的待办都不会排提醒。
ALTER TABLE tasks ADD COLUMN reminder_minute INTEGER
  CHECK (reminder_minute IS NULL OR (reminder_minute >= 0 AND reminder_minute <= 1439));
`;

// ============================================================
// 迁移 7：头像从「生成的人像 + 上传的照片」换成「七个像素动物挑一个」
//
// 上一版头像有两条路：按 (id, avatar_seed) 算出来的墨色版画人像，
// 以及从相册上传的 256×256 JPEG（base64 存在 avatar_data）。
// 这一版两者都不要了：头像是一张 16×16 的像素图，用户从七个里左右挑一个，
// 库里只存一个词（'fox' / 'cat' / …）。
//
// 为什么要动数据，而不只是加一列：
//   1. avatar_data 是用户照片的 base64，一张 8–20 KB。用户已经把头像换成像素动物了，
//      那张照片就再也不会被画出来——留着它等于在库里、在每份备份里
//      永久携带一张已经不再属于任何东西的照片。这正是「把现有的头像数据删除」。
//   2. 清空是**不可逆**的，但可以接受：它对应的旧能力（上传自己的照片）
//      已经被产品层面移除了（用户明确要求换成像素动物），不是暂时下线。
//
// 为什么 avatar_seed / avatar_data / avatar_updated_at 三列不删：
//   按 D31 的规则，已经发布过的列只能废弃、不能删——删列在 SQLite 里是重建整张表，
//   而 player 上有外键（settings / tasks / checkins / goals 都 REFERENCES player）。
//   为了三个再也没人读的列去重建一个被四张表引用的表，风险远大于收益。
//   它们从这一版起是死列，与 settings.theme_id 同一种状态。
// ============================================================

/** 6 → 7：player 加 avatar_id（默认 'fox'），并清空旧的 avatar_data */
export const MIGRATE_V6_TO_V7_SQL = `
-- 挑中的头像 id。默认 'fox'：老用户升级上来看到的是默认动物，
-- 而不是一张空白的图。取值由 domain/avatar.ts 的 AVATAR_IDS 管，
-- 这里不加 CHECK：加一个七选一的 CHECK 意味着以后每加一只动物都要重建一次 player 表。
ALTER TABLE player ADD COLUMN avatar_id TEXT NOT NULL DEFAULT 'fox';

-- 清掉上一版上传的照片。旧版本把用户的相册照片以 base64 存在这一列，
-- 而这一版已经不会再画它了——留着只是让库和每份备份多背一张 8–20 KB 的死数据。
UPDATE player SET avatar_data = NULL, avatar_updated_at = 0;
`;

// ============================================================
// 迁移 8：连胜的宽限券与修复（D38）
//
// ---- 为什么这一步是「加一张表」而不是「给 player 加 11 个列」----
//
// docs/04 §7.1 里留了一段参考 SQL，要把 streak_current / streak_best /
// streak_break_date / streak_repair_deadline / streak_grace_remaining …
// 全部加在 player 上。D21 当时否掉了它，理由是「事实表是唯一真相，
// 再存一份就有对不上的那天」。
//
// D38 重新看了这个问题，结论是：**矛盾不在「要不要存」，而在「存什么」**。
//
//   - 存 current / best / totalDays → 与事实表重复。撤销一次打卡，
//     存下来的 current 不会自己变小，两份数据开始打架。这就是 D21 拒它的理由，
//     而这个理由仍然成立。
//   - 存「哪一天被宽限/修复过」→ **推不出来**。空档里没有 checkin，
//     没有别的地方能知道「这一天被宽恕了」。这才真正需要落库。
//
// 所以这一步只加一张 streak_bridges 表，连胜仍然每次从事实现算
// （domain/streak.ts 的 summarizeDates 接受 bridges 参数）。
//
// ---- 为什么是独立一张表，而不是给 checkins 加一列 ----
//
// checkins 是「我做过的事」的账本，它的每一行都发 XP / 余烬 / 五维。
// 桥接日什么都没做，一分钱都不发。把它塞进 checkins 只有两条路：
//   1. 加一列 kind 区分——那就要改 uq_checkin_active 这个唯一索引的语义，
//      而索引已发布；且所有「读打卡」的地方（统计、导出、重算快照）
//      都得多一个过滤条件，漏一处就把宽恕的日子算成了真做过的事。
//   2. 发一分钱的奖励——直接违背「宽限券是桥接，不是奖励」。
// 单独一张表则完全不碰 checkins 的任何现有语义。
//
// ---- 为什么不加外键到 tasks ----
//
// 桥接的是「这个人这一天」，不是「某个习惯这一天」——与我的页的整体连胜
// 同一个口径。连胜在这个 App 里就是整体概念（首页每条习惯的连胜
// 是它自己的事实算的，不需要桥接）。
// 不加 task_id 还有一个好处：删掉一个习惯不会连带删掉历史桥接，
// 于是「累计」永远不因删除而变小。
// ============================================================

/** 桥接日表：被宽限券或付费修复认定为「有记录」的那些日子 */
export const STREAK_BRIDGES_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS streak_bridges (
  -- 一个业务日只能有一条桥接记录（宽限或修复，二选一）
  local_date  TEXT PRIMARY KEY NOT NULL
                CHECK (local_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),

  -- grace = 宽限券自动桥接；repair = 付余烬修复
  kind        TEXT NOT NULL CHECK (kind IN ('grace','repair')),

  -- 修复花掉的余烬与材料。宽限券为 0。
  -- 记下来是为了「花了多少」可审计，而且不靠玩家余额反推。
  ember_spent    INTEGER NOT NULL DEFAULT 0 CHECK (ember_spent >= 0),
  material_spent INTEGER NOT NULL DEFAULT 0 CHECK (material_spent >= 0),

  -- 修复时一次补掉的那个缺口（含首尾）。只用于展示与审计
  gap_start   TEXT,
  gap_end     TEXT,

  created_at  INTEGER NOT NULL
);
`;

/** 7 → 8：加 streak_bridges 表（连胜的宽限券与修复） */
export const MIGRATE_V7_TO_V8_SQL = `
${STREAK_BRIDGES_TABLE_SQL}
`;

// ============================================================
// 迁移 9：周复盘（阶段 3 第 2 条）
//
// ---- 为什么主键是「那一周的周一」而不是自增 id ----
//
// 一周只能有一份复盘。用 week_key 做主键，这件事就由数据库保证——
// 而不是靠「写之前先查一下有没有」这种在两次点击之间会漏的写法。
// 重写同一周就是一次 UPDATE（见 services/review.ts 的 saveReview）。
//
// 为什么存「周一的日期」而不是「2026-W43」这种周序号：
// ISO 周号在跨年那一周会跳到上一年的第 52/53 周，
// 而「这一周的周一是哪天」永远唯一，且能直接用来算区间。
//
// ---- 为什么三个固定问题存成三列，而不是一张 answers 子表 ----
//
// 问题固定就三个，永不变（docs/05：不允许加字段）。
// 子表会多一次 JOIN 与一个「这一周怎么只有两个答案」的非法状态要防；
// 三列都是 TEXT NOT NULL DEFAULT ''，空串就是「没写」。
//
// ---- 为什么没有「跳过了」这个状态 ----
//
// 没写就是没有行。**不要**写一行 status='skipped'：
// 那会变成一张「你欠了几周」的账，而复盘跳过不惩罚是一条硬规则。
// 历史里只记「哪几周写过」，不记「哪几周没写」。
// ============================================================

/** 周复盘表：一周一行 */
export const REVIEWS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS reviews (
  -- 这一周的周一（YYYY-MM-DD）。一周只能有一份复盘
  week_key    TEXT PRIMARY KEY NOT NULL
                CHECK (week_key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),

  -- 三个固定问题。空串 = 没写，NULL 不允许（少一种状态要判断）
  answer_keep TEXT NOT NULL DEFAULT '',   -- 这周有哪件事想留着
  answer_stuck TEXT NOT NULL DEFAULT '',  -- 哪件事一直没动
  answer_next TEXT NOT NULL DEFAULT '',   -- 下周想试一点什么不一样

  -- 自由输入（可选）
  answer_free TEXT NOT NULL DEFAULT '',

  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
`;

/** 8 → 9：加 reviews 表（周复盘） */
export const MIGRATE_V8_TO_V9_SQL = `
${REVIEWS_TABLE_SQL}
`;

// ============================================================
// 迁移 10：月复盘（阶段 3 第 3 条）
//
// 与周复盘同一个形态：一月一行，主键是「YYYY-MM」。
// 一月只能有一份，这件事由主键保证，而不是靠「写之前先查」。
//
// ---- 为什么只有一列正文 ----
//
// 周复盘已经问过三个具体问题了（这周想留着什么 / 什么没动 / 下周试什么）。
// 月末再来三个，一个月就要写八个。所以月复盘只留一句「这个月想说的」。
// 它的主体是**看**（数字与五维变化），不是写。
// ============================================================

/** 月复盘表：一个月一行 */
export const MONTH_REVIEWS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS month_reviews (
  -- 这个月的键 YYYY-MM。一个月只能有一份月复盘
  month_key   TEXT PRIMARY KEY NOT NULL
                CHECK (month_key GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]'),

  -- 这个月想说的一句话。空串 = 没写（NULL 不允许，少一种状态要判断）
  note        TEXT NOT NULL DEFAULT '',

  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
`;

/** 9 → 10：加 month_reviews 表（月复盘） */
export const MIGRATE_V9_TO_V10_SQL = `
${MONTH_REVIEWS_TABLE_SQL}
`;

// ============================================================
// 迁移 11：精炼材料（阶段 4 第 6 条·材料合成）
//
// ---- 为什么是一列，而不是一张材料表 ----
//
// 这一版只有两种材料：普通与精炼。两种都是「一个数字」——
// 没有过期、没有绑定、没有品质词条。为两个数字开一张表，
// 会多一个 JOIN 与一个「这个玩家怎么没有材料行」的非法状态要防。
//
// 等阶段 5 真的需要「材料种类」时（比如不同活动掉不同材料），
// 那时再开表，并把这两个数字迁过去。现在开表是为将来买单。
//
// ---- 为什么默认值是 0 而不是 NULL ----
//
// 0 是合法的（一个精炼材料都没有），而且它是「没有」的唯一含义。
// 用 NULL 会让「没有」有两种写法，每处读它都要判两次。
// ============================================================

/** 10 → 11：player 加 refined_material（材料合成产出的精炼材料） */
export const MIGRATE_V10_TO_V11_SQL = `
-- 精炼材料：3 个普通材料合成 1 个。目前与 material 一样，只是一个数字。
-- 默认 0：老库升级上来一个都没有，而合成是用户主动做的事，
-- 升级不该凭空送任何东西。
ALTER TABLE player ADD COLUMN refined_material INTEGER NOT NULL DEFAULT 0
  CHECK (refined_material >= 0);
`;

// ============================================================
// 迁移 12：月度活动奖励的「发到哪个月了」（阶段 5 第 1 条）
//
// ---- 为什么需要一列 ----
//
// 月度奖励是**自动发**的（不需要用户点「领取」），而自动发就必须
// 能回答「这个月发过了没有」。不记的话，每次启动都会发一遍。
//
// 为什么不从别的数据推：
//   - 材料余额的变化推不出来（没有流水表，而为此开一张流水表是阶段 6 的事）；
//   - 打卡记录能推出「哪个月有记录」，但推不出「奖励有没有真的发过」——
//     用户可能在这个月把材料花掉了，那与「没发过」看起来一样。
//
// 所以记一个「上个月发过哪个月」的键。NULL = 从来没发过。
// ============================================================

/** 11 → 12：player 加 last_event_reward_month（月度奖励发到哪个月了） */
export const MIGRATE_V11_TO_V12_SQL = `
-- 最近一次发过奖励的月份键 YYYY-MM。NULL = 从来没发过。
-- 不加 CHECK：格式由代码保证（它就是 today.slice(0,7)），
-- 而加一个 GLOB 约束会在用户手改库时把整条迁移链卡住。
ALTER TABLE player ADD COLUMN last_event_reward_month TEXT;
`;
