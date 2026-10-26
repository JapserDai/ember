/**
 * 导出备份。
 *
 * ---- 为什么这个功能必须从第一版就有 ----
 *
 * 这是一个**完全离线**的 App：数据只在手机上，没有服务器也没有账号。
 * 换机、卸载、手机进水，数据就没了——而且是永久地没了，没有任何地方能找回来。
 * 所以导出不是一个「高级功能」，它是这个 App 对用户的唯一一句承诺：
 * **你记下的东西是你的，随时可以带走。**
 *
 * ---- 这一版只做导出，不做导入 ----
 *
 * 导入要处理的事比导出多得多：校验、版本兼容、先给当前库拍快照、事务内全量替换、
 * 导入后重算快照（不能相信文件里的派生值）。任何一步做错都是**毁掉用户现有数据**。
 * 导出做错了最多是文件不完整，导入做错了是不可逆的。
 *
 * 所以先做导出，把信封格式钉死（docs/03 §6.3），导入等阶段 2 再做——
 * 那时导出的文件已经在手上了，可以拿真实文件测导入，而不是凭空造一份。
 *
 * ---- 信封格式 ----
 *
 * 不是直接把几张表倒出来，外面套一层信封：`format` / `formatVersion` / `schemaVersion`
 * 三个字段让**将来**的导入能判断「这个文件是不是我认识的」「它是哪个版本的 App 写的」。
 * 现在没有读者，但格式一旦发出去就改不了了（用户手里会有旧文件），
 * 所以第一版就要写对。
 *
 * `checksum` 用 `File.digest('SHA-256')` 算 `data` 部分的摘要，不引额外的库
 * （`expo-crypto` 会多一个原生模块，而这里只需要一个摘要）。
 * 它防的是「有人手改了几个数字，其它字段原封不动」，不是文件传输损坏——
 * 后者由文件系统与分享流程保证。`counts` 与数组长度是否一致由导入端校验。
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { getDb } from '../db/client';
import { CURRENT_SCHEMA_VERSION } from '../db/migrate';
import { BACKUP_FORMAT, BACKUP_FORMAT_VERSION, canonicalDataJson } from '../domain/backup';
/*
 * 格式标记与版本从 `domain/backup.ts` 取，**不在这里另写一份**。
 * 导出端与导入端必须认同一个字符串：两处各写一份，就一定会有一天只改了一边，
 * 然后所有新备份都被导入端判成「不是 Ember 的备份」。
 */
export { BACKUP_FORMAT, BACKUP_FORMAT_VERSION };

/** 导出结果。ok=false 时带一句能直接给用户看的话 */
export interface ExportResult {
  ok: boolean;
  /** 成功时是文件名，失败时是提示语 */
  message: string;
  /** 成功时的文件 URI */
  uri?: string;
  /** 各表的行数，成功时用于在页面上显示「导出了多少」 */
  counts?: Record<string, number>;
}

/** 一张表的导出定义：表名 + 排序列（保证两次导出顺序一致，方便比对） */
const TABLES: ReadonlyArray<{ name: string; orderBy: string }> = [
  { name: 'player', orderBy: 'created_at' },
  { name: 'settings', orderBy: 'id' },
  { name: 'tasks', orderBy: 'created_at' },
  { name: 'checkins', orderBy: 'created_at' },
  { name: 'goals', orderBy: 'created_at' },
  /*
  /*
   * 连胜的桥接日（D38）。
   *
   * 必须导出：它是「哪几天被宽限券或修复桥接过」的唯一记录，
   * 从 checkins 里推不出来。不导出的话，用户导一次备份、再导回来，
   * 修好的连胜就变短了——而那是他花余烬买过的东西。
   *
   * 顺序与 BACKUP_TABLES 一致（它比 player 早吗？不——但导出不需要
   * 遵守外键顺序，只有导入的 INSERT 需要。这里与那边保持同一个顺序，
   * 只是为了让两份清单一眼能对上）。
   */
  { name: 'streak_bridges', orderBy: 'local_date' },
  // 周复盘（阶段 3）。同样必须导出：那是用户自己写下的文字，
  // 丢了就是丢了，没有别的地方有第二份。
  { name: 'reviews', orderBy: 'week_key' },
  // 月复盘（阶段 3）。同样是用户自己写的字。
  { name: 'month_reviews', orderBy: 'month_key' },
  // 日记（D49）。一天一条，主键是业务日，所以按它排序就足够稳定。
  { name: 'journal_entries', orderBy: 'local_date' },
  // 番茄钟完成记录（D68）。一次专注一行，按完成时间排——它没有主键日期
  // 复合业务约束，但导出两次要能逐字节比对，排序键必须稳定
  { name: 'pomodoros', orderBy: 'completed_at' },
];

/**
 * 把一个业务日转成文件名里的日期部分。
 *
 * 用 `YYYY-MM-DD` 而不是时间戳：用户要在文件管理器里认出「这是哪天的备份」。
 * 同一天导出两次会得到两个同名文件——系统会自动加后缀，不影响。
 */
function dateStamp(nowMs: number): string {
  const d = new Date(nowMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * 把整库读成一个信封对象。
 *
 * 导出是纯读，不开事务：一次导出过程中用户不可能同时在改数据
 * （这个 App 是单线程 UI，导出期间界面被分享面板挡住），
 * 而且即使真出现半新半旧的行，也只是某一行的时间戳不一致，不会损坏什么。
 */
function buildEnvelope(nowMs: number): { envelope: Record<string, unknown>; counts: Record<string, number> } {
  const db = getDb();
  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};

  for (const table of TABLES) {
    const rows = db.getAllSync<Record<string, unknown>>(
      `SELECT * FROM ${table.name} ORDER BY ${table.orderBy}`
    );
    data[table.name] = rows;
    counts[table.name] = rows.length;
  }

  const settings = data.settings[0] as Record<string, unknown> | undefined;

  const envelope = {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    appVersion: '0.0.1',
    exportedAt: new Date(nowMs).toISOString(),
    device: {
      platform: 'android',
      // 只记日界，不记时区名：时区名要 Intl，而 Hermes 上的 Intl 支持依版本而定，
      // 为一行备份元数据引入一个可能不存在的 API 不值得。
      // 日界是唯一真正影响「一天从几点开始」的设置，导入时要用它重算业务日。
      dayStartHour: typeof settings?.day_start_hour === 'number' ? settings.day_start_hour : 4,
    },
    counts,
    data,
  };

  return { envelope, counts };
}

/**
 * 导出整库到缓存目录，然后调起系统分享面板。
 *
 * 写缓存目录而不是文档目录：备份文件是给用户**拿出去**的，
 * 分享完就留在缓存里等系统清理，不该占着 App 的文档空间。
 * 用户点了「保存到文件」之后，系统会把它复制到用户选的位置。
 *
 * 失败时返回一句人话，不抛错——设置页的按钮不该让整个页面崩掉。
 */
export async function exportBackup(nowMs: number = Date.now()): Promise<ExportResult> {
  try {
    const { envelope, counts } = buildEnvelope(nowMs);

    /*
     * 校验和只覆盖 `data`，不覆盖整个文件。
     *
     * 为什么不能算整文件：checksum 本身要写进文件里，写进去之后文件就变了，
     * 摘要立刻对不上——先有鸡还是先有蛋。
     *
     * 为什么也不该算整文件：整文件的完整性由文件系统和分享流程保证，
     * 真正需要防的是「有人手改了几个数字，其它字段原封不动」。
     * 只对 data 算摘要，正好覆盖这一种。
     *
     * **导入端要用完全一样的规则重算**：`JSON.stringify(读出来的 data)`——
     * 紧凑格式、不带缩进、字段顺序按解析出来的顺序。
     * 这里算的是紧凑串而写进文件的是带缩进的串，两者字节不同：
     * 摘要锚在紧凑形式上，是因为它不依赖排版，改缩进不会让旧备份全部失效。
     *
     * 实现上借用一个临时文件拿到摘要：`File.digest()` 只能算磁盘上的文件，
     * 不能直接算一个字符串。临时文件写在缓存目录，算完立刻删。
     */
    // envelope 是普通对象，data 的静态类型是 unknown；这里它一定是「表名 → 行数组」
    const dataJson = canonicalDataJson(envelope.data as Record<string, unknown>);
    const scratch = new File(Paths.cache, 'ember-checksum-scratch.json');
    scratch.writeSync(dataJson);
    const digest = await scratch.digest('SHA-256');
    scratch.delete();

    const withChecksum = JSON.stringify({ ...envelope, checksum: `sha256:${digest}` }, null, 2);

    const file = new File(Paths.cache, `ember-backup-${dateStamp(nowMs)}.json`);
    /*
     * 同一天导出第二次时会撞上同名文件。先删再写，而不是依赖「覆盖」选项：
     * writeSync 的选项里只有 append（默认 false 就是整份覆盖），
     * 但文件已存在时某些平台会拒绝新建。删掉最稳，反正旧文件没有保留价值。
     */
    if (file.exists) file.delete();
    file.writeSync(withChecksum);

    /*
     * 从这一步开始，文件已经在手机上了。
     * 后面无论出什么问题，都不能说「没能导出」——那是谎话，
     * 正确的说法是「已经写好了，只是没能拿出去」。
     */
    const written = `已经写好一份备份：${counts.tasks} 件事、${counts.checkins} 次记录。`;

    let canShare = false;
    try {
      canShare = await Sharing.isAvailableAsync();
    } catch {
      // 探测失败按「不能分享」处理，让下面给出同一句解释，而不是抛出一个技术错误
      canShare = false;
    }
    if (!canShare) {
      return {
        ok: false,
        message: `${written}但这台手机没有可以接收文件的 App，所以它还在缓存里，没能拿出去。`,
        uri: file.uri,
        counts,
      };
    }

    try {
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: '保存 Ember 备份',
      });
    } catch (err) {
      console.warn('[Ember] 调起分享失败', err);
      return {
        ok: false,
        message: `${written}但分享面板没打开，再试一次。`,
        uri: file.uri,
        counts,
      };
    }

    return {
      ok: true,
      message: `导出了 ${counts.tasks} 件事、${counts.checkins} 次记录。`,
      uri: file.uri,
      counts,
    };
  } catch (err) {
    console.warn('[Ember] 导出备份失败', err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : '没能写出来，稍后再试一次。',
    };
  }
}
