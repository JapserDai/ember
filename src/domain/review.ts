/**
 * 周复盘（阶段 3 第 2 条）——纯规则。
 *
 * ---- 这一条要回答什么 ----
 *
 * 「这一周我过得怎么样」。三个固定问题 + 一个自由输入，5 分钟内能填完。
 *
 * 三个固定问题的选择标准是**它们都能自己回答**，不需要用户会写作文：
 *   1. 这周有哪件事想留着？（找出一个真实发生过的、值得记住的时刻）
 *   2. 哪件事一直没动？（不追问原因，只承认它在那儿）
 *   3. 下周想试一点什么不一样？（给一个具体的、很小的动作）
 *
 * ---- 为什么「跳过不惩罚」是一条硬规则 ----
 *
 * 复盘是最容易变成「作业」的东西。一旦它有了连续记录、有了「你已连续复盘 4 周」，
 * 第 5 周没做就变成了欠账——而那正是这个 App 全部设计要避开的东西（D6）。
 *
 * 所以：
 *   - 没有「连续复盘 N 周」这种计数；
 *   - 跳过之后**不出现任何催促**，下周照常出现一张空白的；
 *   - 历史里只记「哪几周写过」，不记「哪几周没写」。
 *
 * 验收标准（docs/05 阶段 3）就是这一条：**复盘跳过 2 周后 App 无任何催促式文案**。
 *
 * ---- 为什么统计只报事实、不报完成率 ----
 *
 * 与统计页（D33）同一个立场。周复盘里出现「本周完成率 62%」，
 * 剩下那 38% 立刻变成欠账。所以这里只报：
 *   - 有几天动过；
 *   - 记了多少次；
 *   - 哪一件最稳（记录次数最多的那件事）。
 *
 * 本文件是纯函数：不碰数据库、不读系统时间、不 import React。
 */
import { addDays, diffDays, isDateKey, startOfWeek } from './date';

/** 三个固定问题。顺序固定，界面按这个顺序排 */
export const REVIEW_QUESTIONS = [
  {
    key: 'keep',
    /** 问题本身。第二人称、口语，不用「请描述」这种书面语 */
    prompt: '这周有哪件事想留着？',
    /** 输入框的占位提示。给一个例子比给一句要求有用 */
    placeholder: '比如：周三晚上那顿慢慢吃完的饭。',
    /** 字数上限 */
    maxLength: 120,
  },
  {
    key: 'stuck',
    prompt: '哪件事一直没动？',
    placeholder: '写下来就行，不用解释为什么。',
    maxLength: 120,
  },
  {
    key: 'next',
    prompt: '下周想试一点什么不一样？',
    placeholder: '比如：把手机放在客厅充电。',
    maxLength: 120,
  },
] as const;

/** 三个固定问题的键 */
export type ReviewQuestionKey = (typeof REVIEW_QUESTIONS)[number]['key'];

/** 自由输入的上限 */
export const REVIEW_FREE_MAX = 200;

/**
 * 一次复盘的答案。
 *
 * 三个固定问题**都可以空着**：这是一次「想写就写」的记录，不是一张表单。
 * 允许全空——那也算写过了（用户打开、看了一遍、觉得没什么想说的）。
 */
export interface ReviewAnswers {
  keep: string;
  stuck: string;
  next: string;
  /** 自由输入。没有就是空串 */
  free: string;
}

/** 空白答案。界面用它初始化 */
export function emptyAnswers(): ReviewAnswers {
  return { keep: '', stuck: '', next: '', free: '' };
}

/**
 * 规范化一次答案。
 *
 * - 去首尾空白、把行尾空白去掉（用户不会想让「 」占一行）；
 * - 连续空行压成一个（保留分段，因为这是一小段话）；
 * - 按每个问题的上限截断。
 *
 * 为什么不在这里过滤禁用词：用户在自己写的字段里写「失败」是他的事
 * （与 `domain/profile.ts` 的 bio 同一个立场）。禁用词表管的是**App 说的话**，
 * 不管用户说的话。这里只做物理上放不下的处理。
 */
export function normalizeAnswers(input: Partial<ReviewAnswers> | null | undefined): ReviewAnswers {
  const clean = (value: unknown, max: number): string => {
    if (typeof value !== 'string') return '';
    const collapsed = value
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.replace(/[ \t\u3000]+$/u, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    // 按码点截断：一个 emoji 在 JS 里是 2 个码元、在用户眼里是 1 个字。
    // 用户数的是字，不是码元（与 domain/profile.ts 同一条规矩）。
    return Array.from(collapsed).slice(0, max).join('');
  };

  return {
    keep: clean(input?.keep, REVIEW_QUESTIONS[0].maxLength),
    stuck: clean(input?.stuck, REVIEW_QUESTIONS[1].maxLength),
    next: clean(input?.next, REVIEW_QUESTIONS[2].maxLength),
    free: clean(input?.free, REVIEW_FREE_MAX),
  };
}

/** 答案是不是完全空白 */
export function isBlankAnswers(answers: ReviewAnswers): boolean {
  return (
    answers.keep.length === 0 &&
    answers.stuck.length === 0 &&
    answers.next.length === 0 &&
    answers.free.length === 0
  );
}

/**
 * 一次复盘属于哪一周。
 *
 * 用**周一**作为这一周的标识（`weekStartsOn` 只影响展示与「本周」的算法，
 * 而复盘的主键必须是稳定的——同一天写的复盘，无论用户的周起始设置怎么改，
 * 都应该落在同一行上）。所以这里固定用周一。
 *
 * 为什么不用「2026-W43」这种周序号：跨年那一周会撞车（ISO 周号在 1 月 1 日
 * 附近会跳到上一年的第 52/53 周），而「这一周的周一是哪天」永远唯一。
 */
export function weekKeyOf(dateKey: string): string {
  return startOfWeek(dateKey, 1);
}

/** 这一周的最后一天（周日） */
export function weekEndOf(weekKey: string): string {
  return addDays(weekKey, 6);
}

/**
 * 一周的展示标签，例如「10 月 19 日 – 10 月 25 日」。
 *
 * 同一个月内不重复写月份：`10 月 19 日 – 25 日` 比
 * `10 月 19 日 – 10 月 25 日` 好读。跨月才写两次月份。
 */
export function formatWeekRange(weekKey: string): string {
  const end = weekEndOf(weekKey);
  const [y1, m1, d1] = weekKey.split('-').map(Number);
  const [y2, m2, d2] = end.split('-').map(Number);

  const monthDay = (m: number, d: number) => `${m} 月 ${d} 日`;

  if (y1 === y2 && m1 === m2) {
    return `${monthDay(m1, d1)} – ${d2} 日`;
  }
  return `${monthDay(m1, d1)} – ${monthDay(m2, d2)}`;
}

/**
 * 这一周是不是已经过完了。
 *
 * 「过完」= 今天在这周之后。今天在周内时，这一周还在进行，不该被当成
 * 「该复盘了」——复盘是对一段结束的时间的回顾。
 *
 * 注意这里**不判断「该不该提醒」**：提醒的时机由 services 层按
 * 「周日 / 周一」决定，而「能不能写」只看这一周过没过完。
 */
export function isWeekComplete(weekKey: string, today: string): boolean {
  if (!isDateKey(weekKey) || !isDateKey(today)) return false;
  return diffDays(weekEndOf(weekKey), today) > 0;
}

/**
 * 这一周能不能写复盘。
 *
 * 规则只有一条：**不能写未来的周**。
 *
 * 为什么允许写「本周」而不是只允许写「上周」：
 * 用户可能在周日晚上就想记两笔，那时这一周还没结束。拦着他等到周一
 * 只会让他在等到之前忘掉。而「未来的周」没有任何可回顾的东西。
 */
export function canWriteReview(weekKey: string, today: string): boolean {
  if (!isDateKey(weekKey) || !isDateKey(today)) return false;
  return diffDays(weekKey, today) >= 0;
}

/**
 * 默认要写哪一周。
 *
 * 优先「上一周」：周复盘的正常用法是回顾刚过去的一周。
 * 但如果上周已经写过了，就退回「本周」（用户可能想提前记两笔）。
 *
 * 两个都写过时返回 null——没有需要写的周，界面就不该催。
 */
export function pickDefaultWeek(
  today: string,
  writtenWeeks: readonly string[]
): string | null {
  const thisWeek = weekKeyOf(today);
  const lastWeek = addDays(thisWeek, -7);

  const written = new Set(writtenWeeks);
  if (!written.has(lastWeek)) return lastWeek;
  if (!written.has(thisWeek)) return thisWeek;
  return null;
}

/**
 * 复盘的统计摘要。
 *
 * ---- 只报四个事实，一个评价都没有 ----
 *
 *   activeDays  这一周有几天动过
 *   checkins    这一周记了多少次
 *   steadiest   记录次数最多的那件事（名字）。null 表示这周没有记录
 *   attributes  这周的时间花在哪几维（按次数，降序，最多三条）
 *
 * 为什么没有「完成率」：那是这一页最容易滑进惩罚的地方。
 * 「7 天里有 4 天」这句话本身就是一句评判，而「有 4 天动过」是同一件事的中性说法。
 */
export interface ReviewStats {
  weekKey: string;
  /** 这一周有几天有记录（去重） */
  activeDays: number;
  /** 这一周记录总条数 */
  checkins: number;
  /** 记录次数最多的那件事的名字。null 表示这周没记录 */
  steadiest: string | null;
  /** 花时间最多的几维（按记录次数降序）。最多三条 */
  attributes: string[];
}

/** 一条用于统计的打卡事实（由 services 层从库里取出来） */
export interface ReviewFact {
  /** 业务日 */
  date: string;
  /** 任务标题 */
  title: string;
  /** 属性中文名（例如「心智」） */
  attributeLabel: string;
}

/**
 * 把一周的打卡事实算成摘要。
 *
 * 入参允许乱序、重复、含非法日期——上游是数据库查询，什么都可能有。
 * 不属于这一周的日期会被丢掉（调用方已经过滤过，这里是第二道保险）。
 */
export function summarizeWeek(
  weekKey: string,
  facts: readonly ReviewFact[]
): ReviewStats {
  const end = weekEndOf(weekKey);

  const days = new Set<string>();
  const byTitle = new Map<string, number>();
  const byAttr = new Map<string, number>();
  let checkins = 0;

  for (const fact of facts) {
    if (!fact || !isDateKey(fact.date)) continue;
    // 只收这一周内的：越界的直接丢
    if (fact.date < weekKey || fact.date > end) continue;

    checkins += 1;
    days.add(fact.date);
    if (fact.title) byTitle.set(fact.title, (byTitle.get(fact.title) ?? 0) + 1);
    if (fact.attributeLabel) {
      byAttr.set(fact.attributeLabel, (byAttr.get(fact.attributeLabel) ?? 0) + 1);
    }
  }

  // 最稳的那件：次数最多；并列时取名字字典序靠前的那个，
  // 这样同样的数据每次算出来都是同一件（不让界面在两次渲染之间跳）
  let steadiest: string | null = null;
  let bestCount = 0;
  for (const [title, count] of byTitle) {
    if (count > bestCount || (count === bestCount && steadiest !== null && title < steadiest)) {
      steadiest = title;
      bestCount = count;
    }
  }

  const attributes = [...byAttr.entries()]
    .sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1))
    .slice(0, 3)
    .map(([label]) => label);

  return {
    weekKey,
    activeDays: days.size,
    checkins,
    steadiest,
    attributes,
  };
}

/**
 * 摘要 → 一句人话。
 *
 * 三条规则：
 *   - 只描述事实，不评价（不说「这周不错」，也不说「这周有点少」）；
 *   - 没有记录时不指责，只说「这周没有记录」并**把注意力放到下周**；
 *   - 不出现禁用词表里的任何一个词（有一条断言逐条检查）。
 *
 * 返回 null 表示不需要说什么。
 */
export function describeWeek(stats: ReviewStats): string | null {
  if (stats.checkins === 0) {
    return '这周没有记录。空着的周也是周，下周想动的时候再开始就行。';
  }

  const days = `这周有 ${stats.activeDays} 天动过，记了 ${stats.checkins} 次。`;
  const steady = stats.steadiest ? `最常记的是「${stats.steadiest}」。` : '';
  return days + steady;
}
