/**
 * 日记的编排层
 *
 * 职责只有三件：**今天是哪个业务日**（唯一入口 `effectiveToday`）、
 * 把行读成视图、把用户输入规范化后写库。
 *
 * 这里**不产生任何数值**：写日记不加经验、不加余烬、不加属性点。
 * 它和复盘一样是「记录」，不是「打卡」。这一点与 D7 的立场一致——
 * 记录别人做的事不能反过来改变记录本身。
 */
import { addDays, effectiveToday } from '../domain/date';
import {
  JOURNAL_MAX,
  hasJournalContent,
  journalSummary,
  normalizeJournalBody,
} from '../domain/journal';
import {
  countJournalEntries,
  deleteJournalEntry,
  getJournalEntry,
  listJournalEntries,
  listJournalEntriesBefore,
  upsertJournalEntry,
} from '../db/repo/journal';
import { getSettings } from '../db/repo/settings';

/** 日记页需要的一行（历史列表用） */
export interface JournalHistoryItem {
  /** 业务日 YYYY-MM-DD */
  localDate: string;
  /** 第一行非空文字，界面自己按宽度截断 */
  summary: string;
  /** 全文，点开某项时直接填进编辑框，不用再查一次库 */
  body: string;
  updatedAt: number;
}

/** 日记页的全部数据 */
export interface JournalView {
  /** 今天的业务日 */
  today: string;
  /** 今天已经写下的内容。没写过是空串 */
  todayBody: string;
  /** 今天写过没有（空串也算没写） */
  todayWritten: boolean;
  /** 历史（不含今天），最近的在前 */
  history: JournalHistoryItem[];
}

/**
 * 读日记页的数据。
 *
 * 失败时**抛错**（与 `getReviewView` / `getTodayData` 一致）：
 * 返回空视图会被渲染成「你还没写过」，而实际是读库出问题了——
 * 那是在替用户否定他自己写过的东西。
 */
export function getJournalView(nowMs: number = Date.now(), historyLimit: number = 60): JournalView {
  const settings = getSettings();
  const { today } = effectiveToday(nowMs, settings.day_start_hour, settings.last_settled_date);

  const todayRow = getJournalEntry(today);

  /*
   * 历史列表要排除「今天」：今天那一条已经在最上面的编辑框里了，
   * 再在下面列一遍会让同一天出现两次，而它们是同一条记录。
   *
   * 空串的行也排除：写空了等于没写（见 `saveJournalEntry`），
   * 但万一库里真有一行空的（比如手改过库），这里不该把它当成日记。
   */
  const history = listJournalEntries(historyLimit + 1)
    .filter((row) => row.local_date !== today && hasJournalContent(row.body))
    .slice(0, Math.max(0, Math.trunc(historyLimit)))
    .map((row) => ({
      localDate: row.local_date,
      summary: journalSummary(row.body),
      body: row.body,
      updatedAt: row.updated_at,
    }));

  return {
    today,
    todayBody: todayRow?.body ?? '',
    todayWritten: hasJournalContent(todayRow?.body),
    history,
  };
}

/**
 * 读某一天的字（从「写过的日子」目录页点回来时用）。
 *
 * ---- 为什么不复用 `getJournalView` ----
 *
 * 那一份只带**最近 60 天**。用户在目录页点的可能是两年前的一天，
 * 只查首页视图会找不到，表现是「点了没反应」——而那一页的全部意义
 * 就是「找到那一天」。所以这里按日期直接读一行，不设范围。
 *
 * 空正文的行按「没写过」处理，与 `getJournalView` / `getJournalPage` 同一口径。
 */
export function getJournalDay(localDate: string): JournalHistoryItem | null {
  const row = getJournalEntry(localDate);
  if (!row || !hasJournalContent(row.body)) return null;
  return {
    localDate: row.local_date,
    summary: journalSummary(row.body),
    body: row.body,
    updatedAt: row.updated_at,
  };
}

/** 「看全部」一页取多少条 */
export const JOURNAL_PAGE_SIZE = 60;

/** 「看全部日记」的一页 */
export interface JournalPage {
  items: JournalHistoryItem[];
  /**
   * 还有没有更早的。
   *
   * 判断方式是「这一页取满了」而不是「再查一次」：
   * 取满说明后面很可能还有（也可能正好取完，下一次翻会得到空页——
   * 那一次界面显示「没有更早的了」，代价只是多点一次）。
   * 少一次查询，换来一次可能的空翻页，这个交换对本地 SQLite 是划算的。
   */
  hasMore: boolean;
  /** 下一页的游标（这一页最后一天的日期）。没有下一页时是 null */
  nextCursor: string | null;
  /** 库里的日记总天数。给页头一行「一共写过 N 天」用 */
  totalDays: number;
}

/**
 * 读「看全部日记」的一页。
 *
 * `beforeDate` 为 null 表示第一页（从最新开始）。
 *
 * 与 `getJournalView` 的区别：那个是**日记首页**（今天 + 最近 60 天，排除今天），
 * 这个是**目录页**（全部历史，可以一直往前翻）。两个都用同一套
 * `journalSummary` 摘要规则，界面才能一眼认出「这是同一条记录」。
 *
 * 空正文的行照旧排除：库里有空行只可能是手改过库，不该在目录里占一行。
 */
export function getJournalPage(
  beforeDate: string | null = null,
  pageSize: number = JOURNAL_PAGE_SIZE,
  nowMs: number = Date.now()
): JournalPage {
  const settings = getSettings();
  const { today } = effectiveToday(nowMs, settings.day_start_hour, settings.last_settled_date);

  /*
   * 第一页要从「明天」开始往前翻，而不是从「今天」。
   *
   * `WHERE local_date < ?` 是严格小于，若游标给 today，今天那一条会被跳过——
   * 而它在目录里应该出现（目录是「全部」，不像首页那样把今天单独拎出去）。
   * `addDays(today, 1)` 是个比任何已存日期都大的界，且不用写 `'9999-12-31'` 那种魔法值。
   */
  const cursor = beforeDate ?? addDays(today, 1);
  const size = Math.max(1, Math.trunc(pageSize));

  /*
   * 多取一条（`size + 1`）来判断「还有没有下一页」：
   * 拿到 size + 1 行就说明后面还有，丢掉多出来那一条，不额外发一次 COUNT。
   */
  const raw = listJournalEntriesBefore(cursor, size + 1);
  const hasMore = raw.length > size;
  const pageRows = raw.slice(0, size);

  const items = pageRows
    .filter((row) => hasJournalContent(row.body))
    .map((row) => ({
      localDate: row.local_date,
      summary: journalSummary(row.body),
      body: row.body,
      updatedAt: row.updated_at,
    }));

  return {
    items,
    hasMore,
    /*
     * 游标取**这一页最后一行**（`pageRows`），不是最后一条 `items`。
     *
     * 两者平时是同一条。但若这一页的末几行是空正文（只可能来自手改库），
     * 它们会被 `items` 过滤掉——此时若拿 `items` 的末尾当游标，
     * 游标就停在更靠后的日期上，下一次翻页会把刚过滤掉的行再读一遍；
     * 极端情况下（整页都是空行）`items` 为空、游标变成 null，
     * 而 `hasMore` 仍是 true，「看更早的」按钮会永远点不动。
     * 取原始行就能保证每一页都往前走。
     */
    nextCursor: hasMore && pageRows.length > 0 ? pageRows[pageRows.length - 1].local_date : null,
    totalDays: countJournalEntries(),
  };
}

/** 保存结果。与 `SaveReviewResult` 同一个形态，界面不用学两套 */
export type SaveJournalResult =
  | { ok: true; localDate: string; /** 全空被当成「清掉」 */ cleared: boolean }
  | { ok: false; message: string };

/**
 * 保存某一天的日记。
 *
 * ---- 全空 = 清掉这一天的记录 ----
 *
 * 用户把内容全删掉再点保存，意思通常是「我不想留这一篇」。
 * 留一行空正文没有意义（界面上它和「没写过」一模一样），
 * 所以直接删行——让「写过没有」这件事在库里也是真的。
 * 这与 `services/review.ts` 的 saveReview 是同一个判断。
 *
 * ---- 为什么不需要事务 ----
 *
 * 只有一条写操作，且没有跨表读取。`saveReview` 包事务是因为
 * 「规范化 + 判断 + 写」要看到同一份输入——这里输入只有一个字符串，
 * 不存在中间被别的写打断的可能。
 */
export function saveJournalEntry(
  localDate: string,
  rawBody: unknown,
  nowMs: number = Date.now(),
  /**
   * 这一天的字数上限（D65）。
   *
   * 不传就用 `JOURNAL_MAX`（2000）——与 D65 之前完全一致，
   * 所以任何忘了传的调用点都不会改变行为。
   *
   * 截断**必须在这里做，不能只靠输入框的 `maxLength`**：
   * 输入框只是一个建议（粘贴、输入法回填、将来别的写入路径都能绕过它），
   * 而库里的那一列不该因为绕过而超长。
   */
  bodyLimit: number = JOURNAL_MAX
): SaveJournalResult {
  const body = normalizeJournalBody(rawBody, bodyLimit);

  if (!hasJournalContent(body)) {
    deleteJournalEntry(localDate);
    return { ok: true, localDate, cleared: true };
  }

  upsertJournalEntry(localDate, body, nowMs);
  return { ok: true, localDate, cleared: false };
}

/**
 * 界面上的字数上限。
 *
 * D65 起它只是**默认值**：真实上限来自 `settings.journal_prefs.bodyLimit`。
 * 保留这个导出是为了不破坏既有调用点；新代码应当读偏好。
 */
export const JOURNAL_BODY_MAX = JOURNAL_MAX;
