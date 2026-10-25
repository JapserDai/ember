/**
 * 统计页的取数与纯计算。
 *
 * ---- 这一页回答什么问题 ----
 *
 * 不是「你考了多少分」，而是三件**行为**上的事：
 *   1. 最近 30 天，你有多少天动过；
 *   2. 你通常在一天里的什么时候记；
 *   3. 这些时间花在了哪几个维度上。
 *
 * 三条都是「我做过什么」，没有一条是「我做得够不够」。
 * 所以这里不出现完成率、不出现目标线、不出现「还差几天」。
 *
 * ---- 为什么不画雷达图 ----
 *
 * 原文（docs/05 阶段 2 第 5 条）写的是「五维雷达」。做的时候改成了横条：
 * 雷达图用**面积**表达数值，而面积会随轴的顺序和夹角的分配变化——
 * 同样的五个数，换个顺序画出来「形状」完全不同，读者会去比较形状而不是数值。
 * 五维是五个独立的刻度（每 200 点换 1 点），彼此没有「合起来是一个整体」的语义，
 * 横条才是它真实的样子：五条并排的读数。
 *
 * 这是一处**有意的偏离**，已记进 docs/05 的进度表。
 *
 * ---- 为什么时段只分四段 ----
 *
 * 一天 24 根柱子在一个手机屏上每根不到 15px，读不出任何东西；
 * 分成「早 / 午 / 晚 / 夜」四段，每一段都对应一种真实的生活节奏，
 * 一句话就能说清（「你大多在晚上记」）。
 */
import { listActiveCheckinDates, listCheckinsByTaskRange } from '../db/repo/checkins';
import { getPlayerSnapshot } from '../db/repo/player';
import { getSettings } from '../db/repo/settings';
import { listActiveTasks } from '../db/repo/tasks';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABEL,
  ATTR_XP_PER_POINT,
  type AttributeKey,
} from '../domain/balance';
import { addDays, effectiveToday } from '../domain/date';
import { summarizeDates } from '../domain/streak';

/** 统计窗口：最近多少天（含今天） */
export const STATS_WINDOW_DAYS = 30;

/** 一天里的四个时段。顺序固定，界面按这个顺序排 */
export const TIME_BUCKETS = [
  /*
   * 标签用两个字的**完整说法**（早上 / 中午 / 晚上 / 深夜），不用单字。
   *
   * 单字没法组成句子：统计页要写「你大多在早上记」，
   * 而「早」只能拼出「在早上记」这一种通顺的形态，「午」拼出来是
   * 「在午上记」。两个字的标签同时能当横条左边的名字和句子里的成分。
   */
  { key: 'morning', label: '早上', range: '5–11 点' },
  { key: 'afternoon', label: '中午', range: '11–17 点' },
  { key: 'evening', label: '晚上', range: '17–23 点' },
  { key: 'night', label: '深夜', range: '23–5 点' },
] as const;

export type TimeBucketKey = (typeof TIME_BUCKETS)[number]['key'];

/** 一条横条的数据：标签 + 数值 + 占比（0–1，用于画条长） */
export interface StatBar {
  key: string;
  label: string;
  /** 副标题，例如时段范围。没有就不显示 */
  hint: string | null;
  value: number;
  /** 相对于本组最大值的比例。最大的一条是 1 */
  ratio: number;
}

/** 统计页需要的全部数据 */
export interface StatsData {
  /** 窗口的最后一天（今天） */
  today: string;
  /** 窗口第一天 */
  since: string;
  /** 窗口内「有记录的天数」 */
  activeDays: number;
  /** 窗口内的记录总条数 */
  totalCheckins: number;
  /** 窗口内所有记录拿到的 XP 合计 */
  totalXp: number;
  /** 时段分布，四段固定全在（数值可以为 0） */
  byTime: StatBar[];
  /** 五维分布，五条固定全在 */
  byAttribute: StatBar[];
  /** 窗口内记录最多的那个时段的中文说法。null 表示窗口里一条记录都没有 */
  peakTimeLabel: string | null;
  /** 窗口内记录最多的那一维的中文名。null 表示没有记录 */
  topAttributeLabel: string | null;
}

/**
 * 把一个真实发生时间归到四个时段之一。
 *
 * 用**真实小时**而不是业务日：业务日回答「这算哪一天的账」，
 * 而这里问的是「你几点坐在桌前」——凌晨 1 点记的那一笔，
 * 业务日算昨天，但人是在夜里记的。
 */
export function bucketOfHour(hour: number): TimeBucketKey {
  if (hour >= 5 && hour < 11) return 'morning';
  if (hour >= 11 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 23) return 'evening';
  return 'night';
}

/**
 * 把一组计数变成横条。
 *
 * `ratio` 用**本组最大值**归一，不用总和：这一页要回答的是「哪一段最多」，
 * 而不是「各占百分之几」。用总和归一的话，一段占 30% 的条只有三成宽，
 * 看起来像「很少」，而实际上它可能就是你的主要时段。
 *
 * 全为 0 时所有 ratio 都是 0——界面会画成空轨道，不画成满格。
 */
function toBars(
  entries: ReadonlyArray<{ key: string; label: string; hint: string | null; value: number }>
): StatBar[] {
  const max = entries.reduce((m, e) => Math.max(m, e.value), 0);
  return entries.map((entry) => ({
    ...entry,
    ratio: max > 0 ? entry.value / max : 0,
  }));
}

/**
 * 读统计页的数据。
 *
 * 失败时抛错（与 `getTodayData` 一致）：返回空数据会被画成「你什么都没做」，
 * 而实际是读库出问题了。界面自己决定怎么兜底。
 *
 * 查询次数固定为三次（任务、打卡、玩家），不随天数增长。
 */
export function getStatsData(nowMs: number = Date.now()): StatsData {
  const settings = getSettings();
  const { today } = effectiveToday(nowMs, settings.day_start_hour, settings.last_settled_date);
  const since = addDays(today, -(STATS_WINDOW_DAYS - 1));

  // ---- 1. 有记录的天数（连胜口径，只要那天有记录就算）----
  const pairs = listActiveCheckinDates(today);
  const inWindow = pairs.filter((pair) => pair.localDate >= since);
  const dateSummary = summarizeDates(
    inWindow.map((pair) => pair.localDate),
    today
  );

  // ---- 2. 时段分布与五维分布 ----
  //
  // 需要每一条打卡的 attr_key 与 occurred_at，所以不能只靠上面那份去重结果。
  // 这里逐任务取区间内的记录（任务数通常是个位数），再在内存里归并。
  const tasks = listActiveTasks();
  const byTimeCount: Record<TimeBucketKey, number> = {
    morning: 0,
    afternoon: 0,
    evening: 0,
    night: 0,
  };
  const byAttrCount: Record<AttributeKey, number> = {
    body: 0,
    mind: 0,
    order: 0,
    spirit: 0,
    bond: 0,
  };

  let totalCheckins = 0;
  let totalXp = 0;

  for (const task of tasks) {
    const checkins = listCheckinsByTaskRange(task.id, since, today);
    for (const checkin of checkins) {
      totalCheckins += 1;
      totalXp += checkin.xpAwarded;

      const hour = new Date(checkin.occurredAt).getHours();
      byTimeCount[bucketOfHour(hour)] += 1;

      if (ATTRIBUTE_KEYS.includes(checkin.attrKey)) {
        byAttrCount[checkin.attrKey] += 1;
      }
    }
  }

  const byTime = toBars(
    TIME_BUCKETS.map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      hint: bucket.range,
      value: byTimeCount[bucket.key],
    }))
  );

  /*
   * 五维横条的数值用「属性点数」而不是「记录条数」：
   * 这一页要说的是「你把时间花在哪几个维度上」，而一条记录给多少属性 XP
   * 取决于难度与上限，条数不反映分量。用点数与「我的」页的刻度也是同一个口径。
   */
  const player = getPlayerSnapshot();
  const byAttribute = toBars(
    ATTRIBUTE_KEYS.map((key) => {
      const attr = player.attributes[key];
      return {
        key,
        label: ATTRIBUTE_LABEL[key],
        hint: null,
        // 点数 × 200 + 余数 = 这一维累计的属性 XP，两个页面看到的是同一个数
        value: attr.points * ATTR_XP_PER_POINT + attr.xp,
      };
    })
  );

  // 峰值：并列时取排在前面的那个（时段按生活顺序、五维按固定顺序），
  // 不做「并列都列出来」——一句话说清一件事，比列三个并列更有用
  const peakBucket = byTime.reduce((best, cur) => (cur.value > best.value ? cur : best), byTime[0]);
  const topAttr = byAttribute.reduce(
    (best, cur) => (cur.value > best.value ? cur : best),
    byAttribute[0]
  );

  return {
    today,
    since,
    activeDays: dateSummary.totalDays,
    totalCheckins,
    totalXp,
    byTime,
    byAttribute,
    peakTimeLabel: totalCheckins > 0 ? peakBucket.label : null,
    topAttributeLabel: byAttribute.some((bar) => bar.value > 0) ? topAttr.label : null,
  };
}
