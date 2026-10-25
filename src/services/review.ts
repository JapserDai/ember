/**
 * 周复盘（阶段 3 第 2 条）。
 *
 * ---- 这一层负责什么 ----
 *
 * 规则在 `domain/review.ts`（纯函数：哪一周该写、答案怎么规范化、摘要怎么算）。
 * 这里只做编排：
 *
 *   读设置与打卡 → 算这一周的统计 → 读/写 reviews 表 → 给界面一份完整视图
 *
 * ---- 为什么「跳过不惩罚」要落在这一层 ----
 *
 * 复盘最容易变成作业。所以这个文件里**没有**任何：
 *   - 「连续复盘 N 周」的计数；
 *   - 「你还有 X 周没写」的统计；
 *   - 错过之后的补偿或催促。
 *
 * 唯一主动的东西是 `maintainWeeklyReminder()` 排的那一条周日提醒，
 * 而它和任务提醒用同一套「无声、不弹横幅」的渠道（D36）——
 * 提醒说的是「这一周过完了」，不是「你该交作业了」。
 */
import { runInTransaction } from '../db/client';
import { listCheckinsByTaskRange } from '../db/repo/checkins';
import { getSettings } from '../db/repo/settings';
import { listActiveTasks, listTasks } from '../db/repo/tasks';
import {
  deleteReview,
  getReview,
  listReviewWeeks,
  listReviews,
  upsertReview,
  type ReviewRow,
} from '../db/repo/reviews';
import { ATTRIBUTE_LABEL } from '../domain/balance';
import { addDays, effectiveToday } from '../domain/date';
import {
  describeWeek,
  formatWeekRange,
  isBlankAnswers,
  normalizeAnswers,
  pickDefaultWeek,
  summarizeWeek,
  weekEndOf,
  weekKeyOf,
  type ReviewAnswers,
  type ReviewStats,
} from '../domain/review';

/** 周复盘页需要的一整份数据 */
export interface ReviewView {
  /** 要写的这一周（周一）。null 表示最近两周都写过了 */
  weekKey: string | null;
  /** 这一周的展示标签，例如「10 月 19 日 – 25 日」 */
  rangeLabel: string;
  /** 已经写过的答案。没写过时是空答案 */
  answers: ReviewAnswers;
  /** 这一周是否已经写过（决定按钮文案是「写下来」还是「改一下」） */
  written: boolean;
  /** 这一周的统计 */
  stats: ReviewStats;
  /** 统计 → 一句人话。null 表示不需要说 */
  summary: string | null;
  /** 上一次写这一周的时间（毫秒）。没写过为 null */
  updatedAt: number | null;
}

/** 回忆页要的一条复盘 */
export interface ReviewHistoryItem {
  weekKey: string;
  rangeLabel: string;
  /** 非空的答案，按问题的顺序。界面按这个顺序画 */
  entries: Array<{ prompt: string; answer: string }>;
  updatedAt: number;
}

/** 三个固定问题的提示语。与 domain/review.ts 的 REVIEW_QUESTIONS 对应 */
const PROMPTS = {
  keep: '这周有哪件事想留着？',
  stuck: '哪件事一直没动？',
  next: '下周想试一点什么不一样？',
} as const;

/**
 * 把库里的一行变成答案对象。
 *
 * 空串与 null 都当「没写」：这一版界面对两者一视同仁，
 * 而库里这两列是 NOT NULL DEFAULT ''，所以实际只会读到空串。
 */
function toAnswers(row: ReviewRow | null): ReviewAnswers {
  if (!row) return { keep: '', stuck: '', next: '', free: '' };
  return {
    keep: row.answer_keep ?? '',
    stuck: row.answer_stuck ?? '',
    next: row.answer_next ?? '',
    free: row.answer_free ?? '',
  };
}

/**
 * 取这一周的打卡事实，算成统计。
 *
 * 为什么要连「已完成的待办」一起查：待办做完之后 status 变成 'done'，
 * 而 `listActiveTasks()` 只查 status='active'。只查活跃任务的话，
 * 这周做完的三件待办会从周复盘里消失——而它们正是这一周真实发生的事。
 */
function collectWeekStats(weekKey: string, today: string): ReviewStats {
  const start = weekKey;
  const end = weekEndOf(weekKey);

  // 活跃的 + 已完成的（与首页取数的口径一致）
  const tasks = [...listActiveTasks(), ...listTasks({ status: 'done' })];

  const facts: Array<{ date: string; title: string; attributeLabel: string }> = [];
  for (const task of tasks) {
    const checkins = listCheckinsByTaskRange(task.id, start, end);
    for (const checkin of checkins) {
      // 未来日期不能算进这一周（补记、改设备时间都可能留下这种行）
      if (checkin.localDate > today) continue;
      facts.push({
        date: checkin.localDate,
        title: task.title,
        attributeLabel: ATTRIBUTE_LABEL[checkin.attrKey] ?? '',
      });
    }
  }

  return summarizeWeek(weekKey, facts);
}

/**
 * 读周复盘页的数据。
 *
 * 失败时**抛错**（与 `getTodayData` / `getStatsData` 一致）：
 * 返回空视图会被渲染成「这周你什么都没做」，而实际是读库出问题了。
 */
export function getReviewView(nowMs: number = Date.now()): ReviewView {
  const settings = getSettings();
  const { today } = effectiveToday(nowMs, settings.day_start_hour, settings.last_settled_date);

  // 最近两周都写过了 → weekKey 为 null，界面显示「都写过了」而不是催
  const writtenWeeks = listReviewWeeks();
  const weekKey = pickDefaultWeek(today, writtenWeeks);

  if (!weekKey) {
    return {
      weekKey: null,
      rangeLabel: '',
      answers: { keep: '', stuck: '', next: '', free: '' },
      written: false,
      stats: summarizeWeek('', []),
      summary: null,
      updatedAt: null,
    };
  }

  const row = getReview(weekKey);
  const stats = collectWeekStats(weekKey, today);

  return {
    weekKey,
    rangeLabel: formatWeekRange(weekKey),
    answers: toAnswers(row),
    written: row !== null,
    stats,
    summary: describeWeek(stats),
    updatedAt: row?.updated_at ?? null,
  };
}

/** 保存结果 */
export type SaveReviewResult =
  | { ok: true; weekKey: string; /** 全空被当成「清掉」 */ cleared: boolean }
  | { ok: false; message: string };

/**
 * 保存一周的复盘。
 *
 * ---- 全空 = 清掉这一周的记录 ----
 *
 * 用户把三个答案全删掉再点保存，意思通常是「我不想留这一份」。
 * 这时候留一行四个空串的行没有意义（界面上它和「没写过」一模一样），
 * 所以直接删行——让「写过没有」这件事在库里也是真的。
 *
 * 注意：这**不是**「跳过」。跳过是没有行，清掉也是没有行，
 * 两者在数据上不可区分——这是有意的：跳过不该被记住（见 domain/review.ts）。
 *
 * ---- 为什么包在事务里 ----
 *
 * 只有一条写操作，理论上不需要。但「规范化 + 判断 + 写」这三步要看到
 * 同一份输入，而且这是用户手动点保存的路径——多一层事务的成本可以忽略。
 */
export function saveReview(
  weekKey: string,
  input: Partial<ReviewAnswers>
): SaveReviewResult {
  return runInTransaction(() => {
    const answers = normalizeAnswers(input);

    if (isBlankAnswers(answers)) {
      deleteReview(weekKey);
      return { ok: true as const, weekKey, cleared: true };
    }

    upsertReview({
      weekKey,
      keep: answers.keep,
      stuck: answers.stuck,
      next: answers.next,
      free: answers.free,
    });

    return { ok: true as const, weekKey, cleared: false };
  });
}

/**
 * 回忆页要的复盘历史（按周倒序）。
 *
 * 只列「真的写过东西」的周。全空的行在保存时就被删掉了，
 * 所以这里不需要再过滤——但保险起见还是过一遍 `isBlankAnswers`：
 * 万一有旧数据或手改过的库留下了空行，它不该在回忆里显示成一条。
 */
export function listReviewHistory(): ReviewHistoryItem[] {
  const rows = listReviews();
  const items: ReviewHistoryItem[] = [];

  for (const row of rows) {
    const answers = toAnswers(row);
    if (isBlankAnswers(answers)) continue;

    const entries: Array<{ prompt: string; answer: string }> = [];
    if (answers.keep) entries.push({ prompt: PROMPTS.keep, answer: answers.keep });
    if (answers.stuck) entries.push({ prompt: PROMPTS.stuck, answer: answers.stuck });
    if (answers.next) entries.push({ prompt: PROMPTS.next, answer: answers.next });
    if (answers.free) entries.push({ prompt: '还想说的', answer: answers.free });

    items.push({
      weekKey: row.week_key,
      rangeLabel: formatWeekRange(row.week_key),
      entries,
      updatedAt: row.updated_at,
    });
  }

  return items;
}

/**
 * 这一周是不是刚过完、还没写。
 *
 * 界面用它决定要不要在「今天」页给一个入口。**不催**：
 * 返回 true 时也只给一行安静的入口，不弹窗、不加红点。
 *
 * 规则：上一周已经过完、且还没写 → true。
 */
export function hasUnwrittenLastWeek(nowMs: number = Date.now()): boolean {
  try {
    const settings = getSettings();
    const { today } = effectiveToday(nowMs, settings.day_start_hour, settings.last_settled_date);
    const thisWeek = weekKeyOf(today);
    const lastWeek = addDays(thisWeek, -7);
    return !listReviewWeeks().includes(lastWeek);
  } catch (err) {
    console.warn('[Ember] 读取周复盘状态失败', err);
    return false;
  }
}
