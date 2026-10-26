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
import { effectiveToday } from '../domain/date';
import {
  JOURNAL_MAX,
  hasJournalContent,
  journalSummary,
  normalizeJournalBody,
} from '../domain/journal';
import {
  deleteJournalEntry,
  getJournalEntry,
  listJournalEntries,
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
  /** 今天这一条最后改于什么时候。没写过是 null */
  todayUpdatedAt: number | null;
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
    todayUpdatedAt: todayRow?.updated_at ?? null,
    history,
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
  nowMs: number = Date.now()
): SaveJournalResult {
  const body = normalizeJournalBody(rawBody);

  if (!hasJournalContent(body)) {
    deleteJournalEntry(localDate);
    return { ok: true, localDate, cleared: true };
  }

  upsertJournalEntry(localDate, body, nowMs);
  return { ok: true, localDate, cleared: false };
}

/** 界面上的字数上限，避免每个页面各写一份 */
export const JOURNAL_BODY_MAX = JOURNAL_MAX;
