/**
 * 导入备份。
 *
 * ---- 这是全 App 唯一会覆盖用户全部数据的操作 ----
 *
 * 所以它的每一步都按「最坏情况」设计：
 *
 * 1. **先校验，一行都不写。** 校验规则在 `domain/backup.ts`（纯函数），
 *    结构、行数、引用完整性全部在碰数据库之前查完。
 * 2. **先拍快照，再动库。** 真的开始替换之前，把当前的 `ember.db`
 *    复制成 `ember.pre-import.db` 放在同一个目录里。导入失败、或者导进来
 *    的数据不对，用户还有一份能拿回来的原始库。
 * 3. **一个事务里删干净再插满。** 中途任何一步抛错，SQLite 整体回滚，
 *    库还是导入前那个样子——不会留下「删了一半」的中间态。
 * 4. **重算派生值。** 文件里的等级、属性是导出那一刻的快照。
 *    导入时按 checkins 重算一遍：事实表才是唯一可信的来源（D21 的同一个道理）。
 *
 * ---- 为什么不做合并 ----
 *
 * 合并两套打卡记录会破坏 `uq_checkin_active`（同一任务同一天只能有一条有效记录），
 * 也会让「余额 = 所有奖励之和」这条守恒断掉。单设备场景下也几乎用不到。
 * 所以这一版只有全量替换（docs/03 §6.3）。
 *
 * ---- 快照为什么也放在数据库目录里 ----
 *
 * 放 `Paths.cache` 的话，系统在空间紧张时会把它删掉——而它恰恰是「出事时唯一
 * 还能救回来的东西」，被系统清掉就等于没有。所以和数据库放在一起，
 * 只有用户卸载 App 才会消失。
 */
import { File, Paths } from 'expo-file-system';
import { defaultDatabaseDirectory } from 'expo-sqlite';

import { closeDatabase, getDb, initDatabase, runInTransaction } from '../db/client';
import { CURRENT_SCHEMA_VERSION } from '../db/migrate';
import {
  BACKUP_MAX_BYTES,
  BACKUP_TABLES,
  canonicalDataJson,
  validateBackup,
  type BackupErrorCode,
  type BackupPayload,
  type BackupRow,
} from '../domain/backup';
import { ATTRIBUTE_KEYS, levelFromTotalXp, type AttributeKey } from '../domain/balance';
import { settleUpTo } from './settle';

/** 导入前快照的文件名。与数据库同目录 */
export const PRE_IMPORT_SNAPSHOT = 'ember.pre-import.db';

/** 导入失败的原因码。比校验错误多出「文件读写」「校验和不符」「写库失败」三类 */
export type ImportErrorCode =
  | BackupErrorCode
  | 'CANCELLED'
  | 'FILE_TOO_BIG'
  | 'FILE_UNREADABLE'
  | 'CHECKSUM_MISMATCH'
  | 'SNAPSHOT_FAILED'
  | 'WRITE_FAILED';

/** 导入结果。ok=false 时 message 是可以直接给用户看的一句话 */
export interface ImportResult {
  ok: boolean;
  code?: ImportErrorCode;
  message: string;
  /** 成功时导入了多少行，用于页面显示「导入了多少」 */
  counts?: Record<string, number>;
  /** 成功时快照文件的位置 */
  snapshotUri?: string;
}

/** 校验错误码 → 一句话。这里只补新增的四条，其余复用 domain 的表 */
const EXTRA_MESSAGE: Record<
  Extract<ImportErrorCode, 'CANCELLED' | 'FILE_TOO_BIG' | 'FILE_UNREADABLE' | 'CHECKSUM_MISMATCH' | 'SNAPSHOT_FAILED' | 'WRITE_FAILED'>,
  string
> = {
  CANCELLED: '',
  FILE_TOO_BIG: '这个文件太大了，不像是一份备份。',
  FILE_UNREADABLE: '这个文件读不出来。换一个备份文件试试。',
  CHECKSUM_MISMATCH: '这份备份和它自己的校验和对不上，可能被改过。为了安全，没有导入。',
  SNAPSHOT_FAILED: '导入前没能把当前数据存一份，为了安全，没有继续。',
  WRITE_FAILED: '写库的时候出错了，已经整体撤回。你的数据还是原来那份。',
};

/** 组装失败结果 */
function fail(code: ImportErrorCode, message?: string): ImportResult {
  return { ok: false, code, message: message ?? EXTRA_MESSAGE[code as keyof typeof EXTRA_MESSAGE] ?? '没能导入。' };
}

/** 数据库文件 */
function dbFile(): File {
  return new File(defaultDatabaseDirectory, 'ember.db');
}

/** 导入前的快照文件 */
function snapshotFile(): File {
  return new File(defaultDatabaseDirectory, PRE_IMPORT_SNAPSHOT);
}

/**
 * 把当前库复制一份到 `ember.pre-import.db`。
 *
 * 复制之前先做一次 `wal_checkpoint(TRUNCATE)`：WAL 模式下，最近的写入可能还在
 * `ember.db-wal` 里，只复制主文件会得到一份**缺了最后几次打卡**的库。
 * checkpoint 把它们合并回主文件并清空 WAL，之后复制才是完整的。
 *
 * 返回快照的 uri；失败时抛错，由调用方转成 SNAPSHOT_FAILED。
 */
function snapshotCurrentDatabase(): string {
  getDb().execSync('PRAGMA wal_checkpoint(TRUNCATE);');

  const target = snapshotFile();
  if (target.exists) target.delete();
  dbFile().copySync(target);
  return target.uri;
}

/** 把一行数据按白名单列拼成 INSERT */
function insertRow(table: string, row: BackupRow, allowed: readonly string[]): void {
  const columns: string[] = [];
  const values: Array<string | number | null> = [];

  for (const column of allowed) {
    if (!(column in row)) continue;
    columns.push(column);
    values.push(row[column]);
  }

  // 理论上不会发生（校验阶段已经保证必填列都在），但拼出空 INSERT 会是语法错误，
  // 与其抛一个看不懂的 SQL 错误，不如明确报一句
  if (columns.length === 0) {
    throw new Error(`导入的行没有任何可用列：${table}`);
  }

  const placeholders = columns.map(() => '?').join(', ');
  getDb().runSync(
    `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`,
    values
  );
}

/**
 * 按 checkins 重算玩家快照。
 *
 * 只重算**完全由事实决定**的三样：总 XP、当前等级、五维属性。
 *
 * - 总 XP = 所有 active 打卡的 `xp_awarded` 之和。这是定义，不是估算。
 * - 等级由总 XP 查表得出（`levelFromTotalXp`），不读文件里的 level。
 * - 五维属性 = 按 `attr_key` 分组的 `attr_xp_awarded` 之和，再按 200 换 1 点。
 *
 * **不重算的两样，以及为什么**：
 * - `ember`：它的构成是「启程礼 30 + 打卡奖励 + 升级奖励 − 未来的消费」。
 *   消费还没有做，但一旦做了，余烬就不再能从 checkins 推出来。
 *   现在就按可推出来处理，等于给自己埋一个「以后一改就错」的坑。
 *   所以余烬照文件里的值写回，并由校验和保证它没被手改过。
 * - `highest_level`：历史最高，撤销都不回退，更不该被重算压低。
 *   取「文件里的值」与「重算出来的等级」的较大者。
 */
function rebuildPlayerSnapshot(payload: BackupPayload): void {
  const checkins = payload.data.checkins;

  let xpTotal = 0;
  const attrXp: Record<AttributeKey, number> = { body: 0, mind: 0, order: 0, spirit: 0, bond: 0 };

  for (const row of checkins) {
    if (row.status !== undefined && row.status !== 'active') continue;
    if (typeof row.xp_awarded === 'number') xpTotal += row.xp_awarded;
    const key = row.attr_key;
    if (typeof key === 'string' && (ATTRIBUTE_KEYS as readonly string[]).includes(key)) {
      const awarded = row.attr_xp_awarded;
      if (typeof awarded === 'number') attrXp[key as AttributeKey] += awarded;
    }
  }

  const levelState = levelFromTotalXp(xpTotal);

  const sets: string[] = ['xp_total = ?', 'level = ?', 'xp_in_level = ?'];
  const values: Array<number> = [xpTotal, levelState.level, levelState.inLevel];

  for (const key of ATTRIBUTE_KEYS) {
    const total = attrXp[key];
    const points = Math.floor(total / 200);
    const xp = total % 200;
    sets.push(`attr_${key}_xp = ?`, `attr_${key}_pts = ?`);
    values.push(xp, points);
  }

  // highest_level 取两者较大者：重算可能因为文件里的等级更高而变高，
  // 但绝不会把它压低——历史最高只增不减。
  sets.push('highest_level = MAX(highest_level, ?)');
  values.push(levelState.level);

  getDb().runSync(`UPDATE player SET ${sets.join(', ')}`, values);

  /*
   * 清掉导入进来的旧头像图片。
   *
   * 旧备份（v7 之前导出）里带着 `avatar_data`——一张 base64 的用户照片。
   * 那一列从 v7 起已经没人读了（头像换成了 `avatar_id`），而导入是
   * 「全量替换」：如果原样写进去，用户刚刚删掉的那张照片就又从备份里回来了，
   * 而且是永久地回到了库与之后的每一份备份里。
   *
   * 所以这里无条件清空。`avatar_id` 不在这里动：
   * 新备份里有它，旧备份里没有——没有时 `ALTER TABLE` 给的默认值 'fox' 正好是
   * 我们想要的结果，不需要额外写一段「旧文件要补默认值」的分支。
   *
   * 注意这行必须在 `replaceAllData` 的事务**里面**执行：它是这个函数的一部分，
   * 而整个函数都在那个事务里（见 replaceAllData），失败时跟着一起回滚。
   */
  getDb().runSync('UPDATE player SET avatar_data = NULL, avatar_updated_at = 0');
}

/**
 * 在一个事务里把库换成备份里的内容。
 *
 * 删除顺序按外键依赖倒着来：checkins → tasks → goals → settings → player。
 * 插入顺序正着来：player → settings → goals → tasks → checkins。
 * 顺序错了会撞外键约束，而且报的是英文 SQL 错误。
 *
 * streak_bridges（D38）没有任何外键，删和插都放在最后：
 * 删它放在第一行也行，但把它归到「无依赖的表最后处理」这条规则下，
 * 以后给它加外键时就不用改这里的顺序。
 */
function replaceAllData(payload: BackupPayload): void {
  const db = getDb();

  db.execSync('DELETE FROM streak_bridges;');
  db.execSync('DELETE FROM reviews;');
  db.execSync('DELETE FROM month_reviews;');
  db.execSync('DELETE FROM checkins;');
  db.execSync('DELETE FROM tasks;');
  db.execSync('DELETE FROM goals;');
  db.execSync('DELETE FROM settings;');
  db.execSync('DELETE FROM player;');

  // 插入顺序与 BACKUP_TABLES 的声明顺序一致（player → settings → goals → tasks → checkins）
  for (const spec of BACKUP_TABLES) {
    for (const row of payload.data[spec.name]) {
      insertRow(spec.name, row, spec.columns);
    }
  }

  // 重算派生值（必须在插入之后：它读的是刚写进去的 checkins）
  rebuildPlayerSnapshot(payload);
}

/**
 * 校验文件里声明的校验和。
 *
 * **必须用与导出端完全相同的规则重算**：对 `parsed.data` 做
 * `JSON.stringify`（紧凑、不带缩进），算 sha256。
 * 见 `domain/backup.ts` 的 `canonicalDataJson`。
 *
 * 文件里没有 checksum（理论上不会，导出一定写）时按「无法校验」处理：
 * 不拦，但让调用方知道。这里返回 'skipped'。
 */
async function verifyChecksum(
  rawData: Record<string, unknown>,
  declared: string | null
): Promise<'ok' | 'mismatch' | 'skipped'> {
  if (!declared) return 'skipped';

  const json = canonicalDataJson(rawData);
  const scratch = new File(Paths.cache, 'ember-import-checksum.json');
  try {
    scratch.writeSync(json);
    const digest = await scratch.digest('SHA-256');
    return `sha256:${digest}` === declared ? 'ok' : 'mismatch';
  } finally {
    // 算完就删。临时文件留在缓存里没有意义，而且它包含用户全部数据
    try {
      if (scratch.exists) scratch.delete();
    } catch {
      // 删不掉不算错误：它在缓存目录，系统会回收
    }
  }
}

/**
 * 导入一份备份文件。
 *
 * `pick` 为 false 时只校验不导入（用于「先看看这个文件行不行」）；
 * 正常调用不传。
 */
export async function importBackup(): Promise<ImportResult> {
  // ---------- 1. 选文件 ----------
  let picked;
  try {
    picked = await File.pickFileAsync({
      // 备份是 .json。放宽到 text/* 与 */* 的兜底：部分手机的文件管理器
      // 给 .json 报的 MIME 是 application/octet-stream，只写 application/json
      // 会让备份文件在选择器里灰掉——用户会以为文件坏了。
      mimeTypes: ['application/json', 'text/plain', 'application/octet-stream'],
    });
  } catch (err) {
    console.warn('[Ember] 打开文件选择器失败', err);
    return fail('FILE_UNREADABLE');
  }

  if (picked.canceled || !picked.result) {
    return fail('CANCELLED');
  }
  const file = picked.result;

  // ---------- 2. 大小 ----------
  // size 在读不到时是 0（content:// 的 URI 常见）。0 不拦——
  // 真正的保护是下面解析失败就停，而不是靠这个数字。
  if (file.size > BACKUP_MAX_BYTES) {
    return fail('FILE_TOO_BIG');
  }

  // ---------- 3. 读 + 解析 ----------
  let parsed: unknown;
  try {
    const text = await file.text();
    parsed = JSON.parse(text);
  } catch (err) {
    console.warn('[Ember] 备份文件读取或解析失败', err);
    return fail('NOT_JSON_OBJECT');
  }

  // ---------- 4. 结构校验（纯函数）----------
  const validation = validateBackup(parsed, CURRENT_SCHEMA_VERSION);
  if (!validation.ok) {
    return { ok: false, code: validation.code, message: validation.message };
  }
  const payload = validation.payload;

  // ---------- 5. 校验和 ----------
  //
  // 用**原始** parsed.data 而不是清洗过的 payload.data：导出端算的就是原始数据，
  // 清洗会丢掉文件里多出来的键，摘要就不一样了。
  const rawData = (parsed as { data: Record<string, unknown> }).data;
  const checksumState = await verifyChecksum(rawData, payload.checksum);
  if (checksumState === 'mismatch') {
    return fail('CHECKSUM_MISMATCH');
  }
  if (checksumState === 'skipped') {
    console.warn('[Ember] 备份文件里没有校验和，跳过完整性校验');
  }

  // ---------- 6. 先拍快照 ----------
  let snapshotUri: string;
  try {
    snapshotUri = snapshotCurrentDatabase();
  } catch (err) {
    console.warn('[Ember] 导入前快照失败', err);
    return fail('SNAPSHOT_FAILED');
  }

  // ---------- 7. 事务内替换 ----------
  try {
    runInTransaction(() => {
      replaceAllData(payload);
    });
  } catch (err) {
    console.warn('[Ember] 导入写库失败，已回滚', err);
    return {
      ok: false,
      code: 'WRITE_FAILED',
      message: EXTRA_MESSAGE.WRITE_FAILED,
      snapshotUri,
    };
  }

  // ---------- 8. 结算 ----------
  //
  // 导进来的库可能停在很久以前（`last_settled_date` 是导出那天）。
  // 这里立刻结算一次，把撤销的分界线推到今天——否则「一周前的记录还能撤销」
  // 会变成一条越权路径。结算失败不影响导入结果（它自己兜住了）。
  settleUpTo();

  return {
    ok: true,
    message: `导入了 ${payload.counts.tasks} 件事、${payload.counts.checkins} 次记录。`,
    counts: payload.counts,
    snapshotUri,
  };
}

/**
 * 导入前快照是否还在。
 *
 * 设置页用它显示「出事时可以回到导入前」。没有快照时返回 null。
 */
export function preImportSnapshotUri(): string | null {
  const file = snapshotFile();
  return file.exists ? file.uri : null;
}

/** 回退结果 */
export interface RestoreResult {
  ok: boolean;
  message: string;
}

/** 回退前再存一份当前库，万一回退本身也出错 */
const ROLLBACK_SAFETY = 'ember.before-restore.db';

/**
 * 回到导入前的那份数据。
 *
 * ---- 为什么要关掉连接才能做 ----
 *
 * SQLite 的文件在被连接持有时替换，得到的结果是不确定的：连接还指着旧的文件句柄，
 * 之后的读写可能写进一个已经被换掉的 inode，而界面读到的还是旧内容。
 * 所以顺序必须是：关连接 → 换文件 → 重新打开（`initDatabase()` 会重跑迁移与种子，
 * 但库里已经有数据，迁移是幂等的、种子会直接返回）。
 *
 * ---- 为什么要删 -wal 与 -shm ----
 *
 * 快照是用 `wal_checkpoint(TRUNCATE)` 之后复制的主文件，WAL 是空的。
 * 如果留着旧的 `ember.db-wal`，SQLite 下次打开时会把它「重放」到刚换进来的库上——
 * 等于把导入后的数据又盖回去一部分。必须一起删。
 *
 * ---- 替换失败怎么办 ----
 *
 * 先把当前库复制成 `ember.before-restore.db`，再替换。替换中途失败时，
 * 把这份再复制回去——用户至少还在导入后的状态，而不是没有库。
 */
export function restorePreImportSnapshot(): RestoreResult {
  const snapshot = snapshotFile();
  if (!snapshot.exists) {
    return { ok: false, message: '没有找到导入前的那份数据。' };
  }

  try {
    // 先把当前库落盘，再复制一份安全副本
    getDb().execSync('PRAGMA wal_checkpoint(TRUNCATE);');
    const safety = new File(defaultDatabaseDirectory, ROLLBACK_SAFETY);
    if (safety.exists) safety.delete();
    dbFile().copySync(safety);

    closeDatabase();

    // 换文件：先删主文件与两个伴生文件，再把快照复制过去
    const target = dbFile();
    if (target.exists) target.delete();
    for (const suffix of ['-wal', '-shm']) {
      const side = new File(defaultDatabaseDirectory, `ember.db${suffix}`);
      if (side.exists) side.delete();
    }
    snapshot.copySync(target);

    // 重新打开（会重跑迁移；库里已有数据，种子直接返回）
    initDatabase();

    return { ok: true, message: '已经回到导入前的那份数据。' };
  } catch (err) {
    console.warn('[Ember] 回退到导入前数据失败', err);

    // 尽力把安全副本放回去，让用户至少还在导入后的状态
    try {
      closeDatabase();
      const safety = new File(defaultDatabaseDirectory, ROLLBACK_SAFETY);
      if (safety.exists) {
        const target = dbFile();
        if (target.exists) target.delete();
        safety.copySync(target);
      }
      initDatabase();
    } catch (inner) {
      console.warn('[Ember] 回退失败后也未能恢复原库', inner);
    }

    return { ok: false, message: '回退没能完成。' };
  }
}
