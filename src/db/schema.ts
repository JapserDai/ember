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
 * 主题 id。
 *
 * 注意：这里的取值必须和 theme/tokens.ts 的 ThemeId 完全一致，
 * 但两边是各自声明的——db 层不能 import theme 层（依赖方向是 db → domain，theme 是界面侧）。
 * 改这里就要同步改 tokens.ts，以及 v1 建表 SQL 里的 CHECK（v1 已发布，靠迁移 2 扩）。
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
