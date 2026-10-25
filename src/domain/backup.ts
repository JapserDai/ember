/**
 * 备份文件的校验规则（纯函数：不碰文件系统、不碰数据库）。
 *
 * ---- 为什么校验要单独成一个 domain 文件 ----
 *
 * 导入是这个 App 里**唯一一个会覆盖用户全部数据**的操作。它做错一次，
 * 用户几年的记录就没了，而且没有服务器可以找回来。
 *
 * 所以这里的每一道检查都必须能脱离「真的去写库」单独验证：
 * 校验通过之前，一行数据都不能碰。写库那一步（services/backup.ts）
 * 只在校验全绿之后才开始，并且在事务里做——失败就整体回滚。
 *
 * ---- 检查顺序不是随意的 ----
 *
 * 1. 是不是一个对象 → 2. 是不是我们的格式 → 3. 版本认不认识
 * → 4. 结构对不对（表、行、列、类型）→ 5. 行数对不对
 * → 6. 引用完不完整（checkin 指向的 task 存在吗）。
 *
 * 从便宜到贵：认格式只需要读一个字符串，而引用完整性要建索引扫全表。
 * 前面任何一道不过，后面的都不必跑。
 *
 * 校验和（sha256）不在这里：它要读磁盘上的文件算摘要，是异步的，
 * 放在 services 里做，而且排在结构校验之后——结构都不对的文件，
 * 先算一遍摘要只是白花时间。
 *
 * ---- 这一版只支持「全量替换」 ----
 *
 * 不做合并。合并两套打卡记录会破坏 `uq_checkin_active`（同一任务同一天只能有一条有效记录）
 * 与余额守恒，而单设备场景下几乎用不到合并。见 docs/03 §6.3。
 */

/** 信封里的格式标记。与 services/backup.ts 导出时写的值必须是同一个 */
export const BACKUP_FORMAT = 'ember.backup';

/** 信封格式版本。改信封结构时 +1 */
export const BACKUP_FORMAT_VERSION = 1;

/** 文件大小上限（字节）。超过就拒绝——一个 50MB 的 JSON 在手机上解析会卡死界面 */
export const BACKUP_MAX_BYTES = 50 * 1024 * 1024;

/** 校验失败的原因码。界面按码给出一句人话 */
export type BackupErrorCode =
  | 'NOT_JSON_OBJECT'
  | 'WRONG_FORMAT'
  | 'FUTURE_FORMAT'
  | 'FUTURE_SCHEMA'
  | 'MISSING_DATA'
  | 'BAD_TABLE'
  | 'BAD_ROW'
  | 'BAD_PLAYER_COUNT'
  | 'COUNTS_MISMATCH'
  | 'BROKEN_REFERENCE'
  | 'DUPLICATE_ID';

/** 每个原因码对应的一句话。都是「说清哪里不对」，不是「你错了」 */
export const BACKUP_ERROR_MESSAGE: Record<BackupErrorCode, string> = {
  NOT_JSON_OBJECT: '这个文件读不出内容。换一个备份文件试试。',
  WRONG_FORMAT: '这个文件不是 Ember 的备份。',
  FUTURE_FORMAT: '这份备份是更新版本的 App 写的，这个版本读不了。',
  FUTURE_SCHEMA: '这份备份来自更新版本的 App。先更新 App，再导入它。',
  MISSING_DATA: '这份备份缺了数据部分，可能没写完。',
  BAD_TABLE: '这份备份的表结构不对，可能被改过。',
  BAD_ROW: '这份备份里有一行的内容不对，可能被改过。',
  BAD_PLAYER_COUNT: '这份备份里的玩家资料不是一份，读不了。',
  COUNTS_MISMATCH: '这份备份的行数和它自己写的不一致，可能被改过。',
  BROKEN_REFERENCE: '这份备份里有记录指向不存在的事，读不了。',
  DUPLICATE_ID: '这份备份里有重复的编号，读不了。',
};

/** 一张表在备份文件里的定义 */
export interface BackupTableSpec {
  /** 表名，同时也是 data 里的键 */
  name: string;
  /** 允许写进库的列。**只写这些列**，文件里多出来的键一律忽略 */
  columns: readonly string[];
  /** 必须有值的列（对应建表语句里的 NOT NULL 且没有默认值的那些） */
  required: readonly string[];
  /** 这一张表必须恰好有几行。undefined 表示不限 */
  exactRows?: number;
  /**
   * 这张表是哪个 schema 版本才有的。
   *
   * 旧备份文件里没有它——而「旧文件能不能导入」是必须保证的事
   * （用户手里就拿着那些文件）。所以低于这个版本的备份，
   * 缺这张表是**正常**的，按空表处理；到了这个版本之后缺它才是文件坏了。
   *
   * undefined = 从 v1 就有。
   */
  sinceSchemaVersion?: number;
}

/**
 * 五张表的列清单。
 *
 * 这份清单是**导入时的白名单**：只有列在这里的键会被写进 INSERT，
 * 文件里多出来的键（比如手工加的一个 `note`）不会被拼进 SQL。
 * 这样即使文件被人改过，也不会出现「未知列」把 INSERT 拼错的情况。
 *
 * 改 schema 时要同步改这里——但只加不删，理由与迁移器同一条：
 * 旧备份文件里可能没有新列，删列会让旧文件导入失败。
 */
export const BACKUP_TABLES: readonly BackupTableSpec[] = [
  {
    name: 'player',
    columns: [
      'id', 'display_name', 'level', 'xp_total', 'xp_in_level', 'highest_level',
      'attr_body_xp', 'attr_mind_xp', 'attr_order_xp', 'attr_spirit_xp', 'attr_bond_xp',
      'attr_body_pts', 'attr_mind_pts', 'attr_order_pts', 'attr_spirit_pts', 'attr_bond_pts',
      'ember', 'material', 'refined_material', 'last_event_reward_month',
      'onboarding_done',
      // avatar_seed / avatar_data / avatar_updated_at 三列从 v7 起是死列：
      // 头像改成一个 avatar_id，那三列再也没人读。它们仍留在白名单里，
      // 因为旧备份文件里可能有这三列，而删列会让旧文件导入失败（只加不删）。
      'avatar_seed', 'avatar_data', 'avatar_updated_at', 'avatar_id', 'bio',
      'created_at', 'updated_at',
    ],
    required: ['id', 'display_name', 'level', 'xp_total', 'xp_in_level', 'highest_level'],
    exactRows: 1,
  },
  {
    name: 'settings',
    columns: [
      'id', 'player_id', 'day_start_hour', 'last_settled_date', 'week_starts_on',
      'difficulty', 'theme_id', 'theme_mode', 'reduce_motion', 'haptics_enabled',
      'max_seen_utc', 'last_time_zone', 'created_at', 'updated_at',
    ],
    required: ['id', 'player_id', 'day_start_hour'],
    exactRows: 1,
  },
  {
    name: 'goals',
    columns: [
      'id', 'player_id', 'title', 'why', 'due_date', 'status', 'completed_at',
      'sort_order', 'created_at', 'updated_at', 'deleted_at',
    ],
    required: ['id', 'player_id', 'title', 'status'],
  },
  {
    name: 'tasks',
    columns: [
      'id', 'player_id', 'title', 'notes', 'type', 'recurrence', 'recurrence_config',
      'anchor_date', 'interval_n', 'weekly_target', 'start_date', 'end_date', 'due_date',
      'status', 'completed_at', 'attribute', 'icon', 'color', 'sort_order',
      'max_per_day', 'allow_backfill', 'ember_cost', 'goal_id', 'reminder_minute',
      'created_at', 'updated_at', 'deleted_at',
    ],
    required: ['id', 'player_id', 'title', 'type', 'recurrence', 'start_date', 'attribute', 'status'],
  },
  {
    name: 'checkins',
    columns: [
      'id', 'player_id', 'task_id', 'local_date', 'score_count', 'occurred_at',
      'source', 'status', 'base_xp', 'xp_awarded', 'base_ember', 'ember_awarded',
      'attr_key', 'attr_xp_awarded', 'multiplier', 'is_capped', 'prng_seed', 'flavor_key',
      'reversed_at', 'reverse_reason', 'created_at', 'updated_at',
    ],
    required: [
      'id', 'player_id', 'task_id', 'local_date', 'base_xp', 'xp_awarded',
      'base_ember', 'ember_awarded', 'attr_key', 'attr_xp_awarded', 'multiplier', 'prng_seed',
    ],
  },
  /*
   * 连胜的桥接日（D38，迁移 v7→v8）。
   *
   * ---- 为什么它必须在白名单里 ----
   *
   * 白名单是导入时的唯一写入来源。漏了它不报错，只会**静默丢数据**：
   * 用户导出再导入，宽限券与修复记录全部消失，连胜当场变短。
   * 这已经踩过两次（avatar_seed、reminder_minute），第三次代价最高：
   * 那一次丢失的是「用户花余烬买过的东西」。
   *
   * ---- 为什么不需要 required ----
   *
   * 除了 local_date 与 kind，其它列都有默认值或允许为 NULL。
   * 但 local_date 与 kind 是 NOT NULL 且无默认值，所以它们必须必填。
   *
   * ---- 为什么表名要排在 checkins 后面 ----
   *
   * 插入顺序与这张数组的顺序一致（player → settings → goals → tasks → checkins → 桥接）。
   * 桥接表没有任何外键（见 schema.ts 的解释），所以放在最后最安全：
   * 即使将来给它加了外键，依赖的表也已经插好了。
   */
  {
    name: 'streak_bridges',
    sinceSchemaVersion: 8,
    columns: [
      'local_date', 'kind', 'ember_spent', 'material_spent',
      'gap_start', 'gap_end', 'created_at',
    ],
    required: ['local_date', 'kind'],
  },
  /*
   * 周复盘（阶段 3，迁移 v8→v9）。
   *
   * 主键是 week_key（那一周的周一），所以 `required` 里必须有它。
   * 四个答案列都有 DEFAULT ''，旧文件里不会有——缺了就是「没写」，
   * 这与新行的默认值一致，不需要额外处理。
   *
   * 必须进白名单的理由与 streak_bridges 一样：漏了不报错，
   * 只会让用户导出再导入之后，自己写过的东西全部消失。
   */
  {
    name: 'reviews',
    sinceSchemaVersion: 9,
    columns: [
      'week_key', 'answer_keep', 'answer_stuck', 'answer_next', 'answer_free',
      'created_at', 'updated_at',
    ],
    required: ['week_key'],
  },
  /*
   * 月复盘（阶段 3，迁移 v9→v10）。
   *
   * 与周复盘同一个形态：主键是 month_key（YYYY-MM），正文一列。
   */
  {
    name: 'month_reviews',
    sinceSchemaVersion: 10,
    columns: ['month_key', 'note', 'created_at', 'updated_at'],
    required: ['month_key'],
  },
];

/** 一行数据：列名 → 值。值只允许 string / number / null */
export type BackupRow = Record<string, string | number | null>;

/** 校验通过后的结果：可以直接交给写库那一步 */
export interface BackupPayload {
  formatVersion: number;
  schemaVersion: number;
  appVersion: string | null;
  exportedAt: string | null;
  /** 各表的行数，键是表名 */
  counts: Record<string, number>;
  /** 各表的行，键是表名 */
  data: Record<string, BackupRow[]>;
  /** 文件里声明的校验和（含 `sha256:` 前缀）。null 表示文件里没有 */
  checksum: string | null;
}

/** 校验结果：失败时只有一句人话与一个原因码 */
export type BackupValidation =
  | { ok: true; payload: BackupPayload }
  | { ok: false; code: BackupErrorCode; message: string };

/** 组装失败结果。集中一处，免得每个分支都写一遍 message 查表 */
function fail(code: BackupErrorCode): BackupValidation {
  return { ok: false, code, message: BACKUP_ERROR_MESSAGE[code] };
}

/** 是不是一个普通的对象（不是 null、不是数组） */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 值能不能直接写进 SQLite：只允许字符串、数字、null */
function isScalar(value: unknown): value is string | number | null {
  if (value === null) return true;
  if (typeof value === 'string') return true;
  // NaN / Infinity 会被 SQLite 拒掉，提前当成不合格
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * 校验一份解析好的备份文件。
 *
 * 参数 `parsed` 是 `JSON.parse` 的结果，类型是 unknown——**不假设它是什么**。
 * 调用方不要先做类型断言再传进来，那样这一步就白做了。
 */
export function validateBackup(parsed: unknown, currentSchemaVersion: number): BackupValidation {
  // ---------- 1. 是不是一个对象 ----------
  if (!isPlainObject(parsed)) return fail('NOT_JSON_OBJECT');

  // ---------- 2. 是不是我们的格式 ----------
  if (parsed.format !== BACKUP_FORMAT) return fail('WRONG_FORMAT');

  // ---------- 3. 版本 ----------
  //
  // 两个版本分开判：信封版本管「怎么读这个文件」，schema 版本管「库表对不对」。
  // 都只接受「不比当前新」——比当前新的文件，这一版读不懂，
  // 硬读会丢掉新版本才有的字段，而用户会以为导入成功了。
  const formatVersion = typeof parsed.formatVersion === 'number' ? parsed.formatVersion : 0;
  if (formatVersion > BACKUP_FORMAT_VERSION) return fail('FUTURE_FORMAT');

  const schemaVersion = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 0;
  if (schemaVersion > currentSchemaVersion) return fail('FUTURE_SCHEMA');

  // ---------- 4. 结构与行 ----------
  if (!isPlainObject(parsed.data)) return fail('MISSING_DATA');
  const rawData = parsed.data;

  const data: Record<string, BackupRow[]> = {};
  const counts: Record<string, number> = {};

  for (const spec of BACKUP_TABLES) {
    const rows = rawData[spec.name];
    // 一张表整个缺失，与「这张表是空的」是两件事：
    // 前者是文件坏了，后者是完全合法的（新用户没有任何目标）。
    // 所以缺失一律拒绝，空数组放行。
    //
    // 例外：这一版之后才加的表，在旧文件里本来就不存在。
    // 拒绝的话，用户手里所有 v8 之前导出的备份全部失效——
    // 而那些文件本身是好的，只是写得早。
    if (!Array.isArray(rows)) {
      if (spec.sinceSchemaVersion !== undefined && schemaVersion < spec.sinceSchemaVersion) {
        data[spec.name] = [];
        counts[spec.name] = 0;
        continue;
      }
      return fail('BAD_TABLE');
    }

    if (spec.exactRows !== undefined && rows.length !== spec.exactRows) {
      return fail(spec.name === 'player' ? 'BAD_PLAYER_COUNT' : 'BAD_TABLE');
    }

    const cleaned: BackupRow[] = [];
    const seenIds = new Set<string>();

    for (const row of rows) {
      if (!isPlainObject(row)) return fail('BAD_ROW');

      for (const column of spec.required) {
        if (!(column in row)) return fail('BAD_ROW');
        if (row[column] === null || row[column] === undefined) return fail('BAD_ROW');
      }

      // 只保留白名单里的列，并且只保留标量值。
      // 文件里多出来的键不报错——将来版本可能加了新列，旧版本读到时
      // 应该是「忽略不认识的东西」，而不是「整份文件拒绝」。
      const next: BackupRow = {};
      for (const column of spec.columns) {
        const value = row[column];
        if (value === undefined) continue;
        if (!isScalar(value)) return fail('BAD_ROW');
        next[column] = value;
      }

      // 主键重复会让 INSERT 撞主键，报出来的是一个英文 SQL 错误。
      // 在这里先查出来，才能给用户一句中文。
      //
      // 主键列名不一定是 `id`：streak_bridges 的主键是 local_date。
      // 所以两个都查，而不是只查 id——漏掉的话，重复的桥接日会一直走到
      // INSERT 才报错，而那一步已经删过一遍数据了（虽然会回滚，
      // 但用户看到的是一个英文错误）。
      const pk = typeof next.id === 'string' ? next.id : typeof next.local_date === 'string' ? next.local_date : null;
      if (pk !== null) {
        if (seenIds.has(pk)) return fail('DUPLICATE_ID');
        seenIds.add(pk);
      }

      cleaned.push(next);
    }

    data[spec.name] = cleaned;
    counts[spec.name] = cleaned.length;
  }

  // ---------- 5. 行数与文件自称的一致吗 ----------
  //
  // 文件里的 counts 是导出时写下的。它和实际数组长度不一致，说明有人改过数组
  // 却没改 counts（或者反过来）——这正是「手改几个数字」会留下的痕迹。
  if (isPlainObject(parsed.counts)) {
    for (const spec of BACKUP_TABLES) {
      const declared = parsed.counts[spec.name];
      if (declared === undefined) continue;
      if (typeof declared !== 'number' || declared !== counts[spec.name]) {
        return fail('COUNTS_MISMATCH');
      }
    }
  }

  // ---------- 6. 引用完整性 ----------
  //
  // checkins.task_id 有外键（ON DELETE RESTRICT），tasks.goal_id 没有外键
  // （目标是软删除，删目标时由 repo 把 goal_id 置空）。
  // 有外键的那一条必须自己查：SQLite 在建表时开了 foreign_keys，
  // 但导入是先删后插，如果先插 checkins 就会直接报外键错误——
  // 与其让 SQLite 抛一个英文错误，不如在这里先说清楚。
  const taskIds = new Set(
    data.tasks.map((row) => row.id).filter((id): id is string => typeof id === 'string')
  );
  for (const row of data.checkins) {
    if (typeof row.task_id !== 'string' || !taskIds.has(row.task_id)) {
      return fail('BROKEN_REFERENCE');
    }
  }

  // 目标的引用不做硬校验：一个任务挂着一个已被软删除的目标是合法状态
  // （导出时那条目标还在表里，只是 deleted_at 不为空），而软删除的行也在 data.goals 里。
  // 真正会出问题的是「goal_id 指向一个根本不存在的目标」，
  // 这一版由 SQL 兜底（没有外键，所以不会报错，界面读到时按「没挂目标」处理）。

  const checksum = typeof parsed.checksum === 'string' ? parsed.checksum : null;

  return {
    ok: true,
    payload: {
      formatVersion,
      schemaVersion,
      appVersion: typeof parsed.appVersion === 'string' ? parsed.appVersion : null,
      exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : null,
      counts,
      data,
      checksum,
    },
  };
}

/**
 * 重建校验和用的规范串。
 *
 * **必须与导出端 `JSON.stringify(envelope.data)` 完全一致**：
 * 紧凑格式、不带缩进、键的顺序按对象自身的插入顺序。
 *
 * 为什么单独写一个函数而不是让调用方自己拼：导出与导入两边各写一遍，
 * 就一定会有一天只改了一边，然后所有旧备份都「校验失败」——
 * 而用户看到的是「你的备份被改过」，那是很重的指控。
 */
export function canonicalDataJson(data: Record<string, unknown>): string {
  return JSON.stringify(data);
}
