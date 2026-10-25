/**
 * 叙事层（阶段 5）的编排。
 *
 * 内容在 `src/content/*`（四季故事、Boss、月度活动），纯规则在
 * `domain/ruleEngine.ts`（温柔复盘、任务拆解）。这里只做取数与装配。
 *
 * ---- 这一层最重要的一条 ----
 *
 * **所有解锁条件都用「累计」，不用「连续」。**
 *
 * 验收标准写得很明确：断更 2 周后回归，剧情不惩罚、只补一句「欢迎回来」。
 * 所以这里每一次算解锁，输入都是 `totalDays`（累计有记录的天数），
 * 而不是 `current`（当前连胜）。
 *
 * 这一条不只是文案问题：如果故事按连续天数解锁，断更就会让已经读到的
 * 段落「退回去」——那是比任何一句难听的话都更强的惩罚。
 */
import { listActiveCheckinDates, listCheckinsByTaskRange } from '../db/repo/checkins';
import { getPlayerSnapshot, updatePlayer } from '../db/repo/player';
import { getSettings } from '../db/repo/settings';
import { listActiveTasks, listTasks } from '../db/repo/tasks';
import { ATTRIBUTE_LABEL } from '../domain/balance';
import { addDays, businessDate, effectiveToday } from '../domain/date';
import { summarizeDates } from '../domain/streak';
import { bossOf, bossState, type BossState } from '../content/boss';
import { eventOfMonth, qualifiesForReward, type MonthlyEvent } from '../content/monthlyEvents';
import {
  nextSegmentGap,
  seasonOfMonth,
  storyOf,
  unlockedSegments,
  type Season,
  type SeasonStory,
  type StorySegment,
} from '../content/stories';
import { getStatsData } from './stats';

/** 叙事页需要的一整份数据 */
export interface NarrativeView {
  /** 今天（业务日） */
  today: string;
  /** 当前季节 */
  season: Season;
  /** 当前季的故事 */
  story: SeasonStory | null;
  /** 已经解锁的段落 */
  unlocked: readonly StorySegment[];
  /** 下一段还差几天。null 表示这一季读完了 */
  nextGap: number | null;
  /** 累计有记录的天数（解锁条件用的就是这个） */
  totalDays: number;
  /** 当前季的 Boss 状态。null 表示这一季没有 Boss（理论上不会） */
  boss: BossState | null;
  /** 这个月的活动 */
  event: MonthlyEvent | null;
  /** 这个月有没有资格拿活动奖励（有记录就行） */
  eventQualified: boolean;
  /** 这个月已经记了多少次 */
  checkinsThisMonth: number;
}

/**
 * 某个月份范围的记录条数。
 *
 * 与统计页同一套取数（活跃任务 + 已完成的待办），否则这月做完的待办
 * 会从 Boss 伤害里消失——那会让「打完 Boss」比实际更难。
 */
function countCheckinsBetween(start: string, end: string, today: string): number {
  const tasks = [...listActiveTasks(), ...listTasks({ status: 'done' })];
  let count = 0;
  for (const task of tasks) {
    const checkins = listCheckinsByTaskRange(task.id, start, end);
    for (const checkin of checkins) {
      if (checkin.localDate > today) continue;
      count += 1;
    }
  }
  return count;
}

/** 一季的起止业务日 */
function seasonRange(season: Season, today: string): { start: string; end: string } {
  const [year] = today.split('-').map(Number);
  const month = Number(today.slice(5, 7));

  // 冬季跨年：12 月属于今年的冬，1–2 月属于「上一个 12 月开始的冬」
  if (season === 'winter') {
    if (month === 12) {
      return { start: `${year}-12-01`, end: `${year + 1}-02-28` };
    }
    // 1 / 2 月：这个冬天从去年 12 月开始
    return { start: `${year - 1}-12-01`, end: `${year}-02-28` };
  }

  const months: Record<Exclude<Season, 'winter'>, [number, number]> = {
    spring: [3, 5],
    summer: [6, 8],
    autumn: [9, 11],
  };
  const [from, to] = months[season as Exclude<Season, 'winter'>];
  const lastDay = new Date(Date.UTC(year, to, 0)).getUTCDate();
  return {
    start: `${year}-${String(from).padStart(2, '0')}-01`,
    end: `${year}-${String(to).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * 读叙事页的数据。
 *
 * 失败时抛错（与其它取数函数一致）：返回空视图会被画成「什么都没有」，
 * 而实际是读库出问题了。
 */
export function getNarrativeView(nowMs: number = Date.now()): NarrativeView {
  const settings = getSettings();
  const { today } = effectiveToday(nowMs, settings.day_start_hour, settings.last_settled_date);

  // 累计天数：所有历史，不截窗口。这是解锁条件，必须用全量
  const pairs = listActiveCheckinDates(today);
  const totalDays = summarizeDates(
    pairs.map((pair) => pair.localDate),
    today
  ).totalDays;

  const month = Number(today.slice(5, 7));
  const season = seasonOfMonth(month);
  const story = storyOf(season);
  const unlocked = unlockedSegments(season, totalDays);
  const nextGap = nextSegmentGap(season, totalDays);

  // Boss 伤害 = 本季的记录次数
  const range = seasonRange(season, today);
  const damage = countCheckinsBetween(range.start, range.end, today);
  const boss = bossOf(season);
  const bossNow = boss ? bossState(boss, damage) : null;

  // 本月活动
  const event = eventOfMonth(month);
  const monthStart = `${today.slice(0, 7)}-01`;
  const monthEnd = addDays(monthStart, 31).slice(0, 7) === today.slice(0, 7)
    ? `${today.slice(0, 7)}-31`
    : today;
  const checkinsThisMonth = countCheckinsBetween(monthStart, monthEnd, today);

  return {
    today,
    season,
    story,
    unlocked,
    nextGap,
    totalDays,
    boss: bossNow,
    event,
    eventQualified: qualifiesForReward(checkinsThisMonth),
    checkinsThisMonth,
  };
}

/**
 * 月末发月度活动奖励（材料）。
 *
 * ---- 什么时候跑 ----
 *
 * 与结算、宽限券同一个时机（App 冷启动）。
 *
 * ---- 怎么保证只发一次 ----
 *
 * 用 `player.last_event_reward_month` 记「上个月发过哪个月的奖励」。
 * 不记的话，每次启动都会发一遍——那是白送材料。
 *
 * ---- 为什么不需要用户「领取」----
 *
 * 领取是一个多余的动作，它会制造「我忘了领」的焦虑。
 * 条件满足（这个月有记录）就自动进账，与宽限券的自动生效同一个立场。
 *
 * 返回这次发了几件（0 表示没发）。
 */
export function grantMonthlyEventReward(nowMs: number = Date.now()): {
  granted: number;
  month: string | null;
  message: string | null;
} {
  try {
    const settings = getSettings();
    const { today } = effectiveToday(
      nowMs,
      settings.day_start_hour,
      settings.last_settled_date
    );

    // 发的是**上个月**的奖励：这个月还没过完，不该提前发
    const monthKey = today.slice(0, 7);
    const [year, month] = monthKey.split('-').map(Number);
    const prevMonthDate = month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, '0')}-01`;
    const prevMonthKey = prevMonthDate.slice(0, 7);

    const player = getPlayerSnapshot();
    // 已经发过了
    if (player.lastEventRewardMonth === prevMonthKey) {
      return { granted: 0, month: prevMonthKey, message: null };
    }

    const prevEvent = eventOfMonth(Number(prevMonthKey.slice(5, 7)));
    if (!prevEvent) {
      return { granted: 0, month: prevMonthKey, message: null };
    }

    // 上个月有没有记录
    const prevStart = `${prevMonthKey}-01`;
    const prevEnd = addDays(`${prevMonthKey}-01`, 31).slice(0, 7) === prevMonthKey
      ? `${prevMonthKey}-31`
      : today;
    const count = countCheckinsBetween(prevStart, prevEnd, today);

    if (!qualifiesForReward(count)) {
      // 没记录就不发，但也要记下「这个月处理过了」，
      // 否则每次启动都会重新数一遍
      updatePlayer({ lastEventRewardMonth: prevMonthKey });
      return { granted: 0, month: prevMonthKey, message: null };
    }

    updatePlayer({
      material: player.material + prevEvent.rewardMaterial,
      lastEventRewardMonth: prevMonthKey,
    });

    return {
      granted: prevEvent.rewardMaterial,
      month: prevMonthKey,
      message: `上个月有记录，收到了 ${prevEvent.rewardMaterial} 个材料。`,
    };
  } catch (err) {
    console.warn('[Ember] 发放月度活动奖励失败，本次跳过', err);
    return { granted: 0, month: null, message: null };
  }
}

/**
 * 回忆页要的「关键节点」。
 *
 * 只做三个（docs/05 第 4 条）：首次 7 天、首次解锁称号、首次完成月目标。
 *
 * 为什么只做三个：回忆卡的价值在于「少而重」。二十张卡会让每张都变轻。
 *
 * 这些节点**不存库**——它们全部可以从事实推出来：
 *   - 首次 7 天：累计天数 ≥ 7 的那一天；
 *   - 首次解锁称号：属性点第一次过 3 的那一天（用现在的点数反推，精度够用）；
 *   - 首次完成月目标：这里不做（月目标属于阶段 5 的月度活动，
 *     而活动没有「完成」这个概念——见 content/monthlyEvents.ts 的注释）。
 *
 * 所以这一版只有两个节点。少一个比编一个诚实。
 */
export interface Milestone {
  id: string;
  /** 什么时候发生的（业务日） */
  date: string;
  title: string;
  note: string;
}

export function listMilestones(nowMs: number = Date.now()): Milestone[] {
  const out: Milestone[] = [];

  try {
    const settings = getSettings();
    const { today } = effectiveToday(
      nowMs,
      settings.day_start_hour,
      settings.last_settled_date
    );

    const pairs = listActiveCheckinDates(today);
    const sorted = [...new Set(pairs.map((pair) => pair.localDate))].sort();

    // 首次累计到 7 天：第 7 个有记录的日子
    if (sorted.length >= 7) {
      out.push({
        id: 'first-7-days',
        date: sorted[6],
        title: '第一次攒到 7 天',
        note: '这一天之前，记录还只是一件偶尔的事。',
      });
    }

    // 首次解锁称号：用当前属性点反推不了「哪一天」，所以用
    // 「累计天数第一次到 3 的那天」代替——3 天对应第一档称号的门槛量级
    if (sorted.length >= 3) {
      const player = getPlayerSnapshot();
      const anyTitle = Object.values(player.attributes).some((attr) => attr.points >= 3);
      if (anyTitle) {
        out.push({
          id: 'first-title',
          date: sorted[2],
          title: '第一个称号',
          note: '五维里的某一维，开始有了名字。',
        });
      }
    }

    // 按日期倒序：最近的回忆在前面
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  } catch (err) {
    console.warn('[Ember] 读取回忆节点失败', err);
  }

  return out;
}

/**
 * 温柔复盘要的输入，从库里算好。
 *
 * 直接复用统计页的取数（最近 30 天），再截到 7 天：
 * 两份口径各算一遍必然会有对不上的那一天，而用户会看到
 * 「统计页说 5 天，复盘说 4 天」。
 */
export function getGentleReviewInput(nowMs: number = Date.now()) {
  const stats = getStatsData(nowMs);
  const settings = getSettings();
  const { today } = effectiveToday(
    nowMs,
    settings.day_start_hour,
    settings.last_settled_date
  );

  // 7 天窗口内重新数一遍（stats 是 30 天，不能直接截）
  const since = addDays(today, -6);
  const tasks = [...listActiveTasks(), ...listTasks({ status: 'done' })];

  const days = new Set<string>();
  let checkins = 0;
  const byTitle = new Map<string, number>();
  const byAttr = new Map<string, number>();

  for (const task of tasks) {
    const rows = listCheckinsByTaskRange(task.id, since, today);
    for (const checkin of rows) {
      if (checkin.localDate > today) continue;
      checkins += 1;
      days.add(checkin.localDate);
      byTitle.set(task.title, (byTitle.get(task.title) ?? 0) + 1);
      const label = ATTRIBUTE_LABEL[checkin.attrKey];
      if (label) byAttr.set(label, (byAttr.get(label) ?? 0) + 1);
    }
  }

  const steadiest =
    [...byTitle.entries()].sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1))[0]?.[0] ??
    null;

  const topAttribute =
    [...byAttr.entries()].sort((a, b) => (b[1] !== a[1] ? b[1] - a[1] : a[0] < b[0] ? -1 : 1))[0]?.[0] ??
    null;

  // 峰值时段直接用统计页的（它算的是 30 天，但「你大多什么时候记」
  // 这个结论在 7 天与 30 天上通常一致，而多算一遍不值得）
  return {
    activeDays: days.size,
    checkins,
    steadiest,
    peakTime: checkins > 0 ? stats.peakTimeLabel : null,
    topAttribute,
  };
}

/**
 * 一句话说「今天是什么日子」——给叙事页的页头用。
 *
 * 断更回来的第一句必须是「欢迎回来」，而不是「你多久没来了」。
 */
export function greetingForReturn(daysSinceLastRecord: number): string | null {
  if (daysSinceLastRecord <= 1) return null;
  if (daysSinceLastRecord >= 14) return '回来就好。';
  return '中间空了一阵。今天还是这个时候，坐下来就好。';
}
