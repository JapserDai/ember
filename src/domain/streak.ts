/**
 * 连胜（从事实现算 + 宽限券 / 修复的桥接日）
 *
 * ---- 两条腿 ----
 *
 * 1. **连胜本身永远从 `checkins` 现算**（D21）。事实表是唯一真相，
 *    没有第二份计数要维护，撤销一次打卡它自己就退回去了。
 * 2. **宽限券与修复只记录「哪一天算作有记录」**（D38）。
 *    它们不存 current / best，只存一张桥接日表。
 *
 * 这两条合起来回答了一个问题：修复的语义是「这段空档不算断」，
 * 而空档里没有 checkin——所以得有一种「没有打卡但算数」的日子。
 * 那就是 `BridgeDay`。
 *
 * 展示原则（docs 04 §7.4）：断签后界面必须同时显示
 * 「当前连胜 0 / 历史最佳 23 天 / 累计记录 147 天」。
 * 这三个数并排，用户看到的是「我做过很多」，而不是「我失败了」。
 *
 * 本文件是纯函数：不 import React、不碰数据库、不读系统时间。
 */

import { addDays, diffDays, isDateKey } from './date';

/** 连胜三态。v0.2 起 `repairable` 才真的会被用到（宽限券与修复） */
export type StreakStatus = 'normal' | 'repairable' | 'broken';

/**
 * 连胜状态快照 —— **已退役**（D38）。
 *
 * 这里曾经是完整的「状态机」形态：current / best / totalDays 全部存进 player 表，
 * 再加断签日、修复期限、冻结值、宽限券余额、纪元共 11 个列。
 * v0.1 按 D21 没启用它（连胜改成从 checkins 现算），v0.2 做修复时
 * 也没有按这个形态落地，原因写在下面这段。
 *
 * ---- 为什么最终没有存 current / best（D38）----
 *
 * 存下来就得维护。而撤销一次打卡会让事实变小，存下来的 current 不会自己变小，
 * 于是「快照」与「事实」开始对不上——这类错误在界面上表现为
 * 「数字莫名其妙」，且无法复现（取决于用户什么时候撤销过）。
 *
 * 所以 D38 走的是另一条路：**只存推不出来的东西**（哪一天被桥接了、
 * 哪一段被修复了、宽限券还剩几张），连胜本身仍然每次现算。
 * 具体实现在下面的 summarizeDatesWithBridges()。
 *
 * 这段注释保留下来，是因为「为什么不用 11 个列」是这个项目里
 * 最容易被重新提起的问题——下一个人想加列时应该先读到这里。
 */

/* ------------------------------------------------------------------ *
 * 从打卡事实现算（v0.2 的实际用法，D38）
 *
 * 事实表 checkins 是唯一真相，连胜每次现算：
 *   - 没有第二份数据，也就没有「两份对不上」的可能；
 *   - 撤销一次打卡后，连胜自动跟着回到撤销前的样子；
 *   - 导入、重建、换设备都不需要额外维护。
 *
 * ---- 宽限券与修复怎么进来（D38 把 D21 收窄的那一步）----
 *
 * 问题：修复的语义是「这一段空档不算断」，而空档里**没有 checkin**。
 * 如果只看 checkins，那么修好的那一天算出来还是断的——修复就白做了。
 *
 * 于是必须存点东西。但**存的不是连胜**，而是「哪几天算作有记录」：
 *   - 宽限券桥接掉的那一天 → 记一行 streak_bridges
 *   - 付余烬修复的那一段   → 记一行 streak_bridges（kind='repair'）
 *
 * 这样 current / best / totalDays 仍然完全由事实算出，只是「事实」
 * 从一份变成两份：真实的打卡 + 被认定有效的日子。撤销打卡照样自动回退，
 * 因为那一天的 checkin 没了，而它本来也不在桥接表里。
 *
 * 为什么不像 docs/04 §7.1 那样存 streak_current / streak_best：
 * 那会直接撞上 D21 否掉它的理由——撤销一次打卡，存下来的 current 不会自己变小，
 * 于是「事实」与「快照」开始对不上，而这类错误在界面上表现为「数字莫名其妙」
 * 且无法复现。
 *
 * 代价是每次首页都要扫一遍历史打卡。数据量按「一个习惯一天一条」算，
 * 一年三百多条，一次查询 + 一次分组在毫秒级，不值得为它做缓存。
 * ------------------------------------------------------------------ */

/**
 * 一个「被认定有效的日子」——宽限券桥接或付费修复。
 *
 * 它**不是打卡**：不计 XP、不计余烬、不计五维、不计「累计记录天数」的分子
 * 以外的任何东西。它只回答一个问题：这一天算不算「有记录」，
 * 从而决定连胜要不要在这里断。
 */
export interface BridgeDay {
  /** 业务日 YYYY-MM-DD */
  date: string;
  /** grace = 宽限券自动桥接；repair = 付余烬修复 */
  kind: 'grace' | 'repair';
}

/**
 * 某个键（习惯 id，或整体用的固定键）的连胜三元组。
 *
 * 与上面的 StreakDisplay 字段一致，但语义上更弱：
 * 它是「当前事实算出来的」，不是「历史累积下来的记录」。
 */
export interface StreakSummary {
  /** 当前连续天数。今天还没记录时，从昨天往回数（今天还没过完，不算断） */
  current: number;
  /** 历史最佳连续天数 */
  best: number;
  /** 有记录的业务日总数（去重后） */
  totalDays: number;
  /** 最近一次有记录的业务日；从未记录为 null */
  lastDate: string | null;
}

/** 一条「某键在某业务日有记录」的事实 */
export interface DatedFact {
  /** 习惯 → taskId；整体 → 用固定字符串 'all' */
  key: string;
  /** 业务日 YYYY-MM-DD */
  date: string;
}

/** 空结果。从未记录时用它，界面显示「第一天」而不是 0 */
const EMPTY_SUMMARY: StreakSummary = { current: 0, best: 0, totalDays: 0, lastDate: null };

/**
 * 把「打卡日」与「桥接日」并成一张「算数的日子」的集合。
 *
 * 两者在连胜计算里**地位完全相同**：只要这一天在集合里，就算有记录。
 * 差别只在别处：
 *   - 打卡日发 XP / 余烬 / 五维，桥接日什么都不发；
 *   - `totalDays`（「累计记录天数」）只数**真正的打卡日**，
 *     因为那是用户自己记下的日子，不是系统宽恕的日子。
 *
 * 未来日期一律丢掉（补记、改设备时间都可能留下这种行）。
 */
function collectValidDays(
  dates: readonly string[],
  bridges: readonly BridgeDay[],
  today: string
): { valid: Set<string>; recorded: Set<string> } {
  const recorded = new Set<string>();
  for (const d of dates) {
    if (!isDateKey(d)) continue;
    if (diffDays(today, d) > 0) continue;
    recorded.add(d);
  }

  // 桥接日只能是「真的没有打卡的那一天」，而且不能是未来。
  // 如果某天既有打卡又有桥接记录（理论上不会），以打卡为准：
  // 那一天是真做过的，不该被降格成「系统宽恕的」。
  const valid = new Set<string>(recorded);
  for (const bridge of bridges) {
    if (!bridge || !isDateKey(bridge.date)) continue;
    if (diffDays(today, bridge.date) > 0) continue;
    valid.add(bridge.date);
  }

  return { valid, recorded };
}

/**
 * 把一串业务日算成连胜三元组。
 *
 * 入参允许重复、乱序、含非法字符串、含未来日期——这些都会被清洗掉，
 * 因为它的上游是数据库查询，而数据库里什么都可能有。
 *
 * 今天没记录时**不判定为断签**：
 *   - 今天有记录           → 从今天往回数
 *   - 今天没有、昨天有     → 从昨天往回数（今天还没过完）
 *   - 今天没有、昨天也没有 → current = 0
 * 否则每天早上打开 App 都会看到「连胜断了」，那是错的。
 *
 * 关于「永不回落」：只要事实只增，best 与 totalDays 只会变大。
 * 但撤销一次打卡会删掉一条事实，此时它们**允许随之变小**——
 * 这是「按事实重算」的正确语义，不是 bug。界面也永远不会把 0 说成「归零」。
 */
export function summarizeDates(
  dates: readonly string[],
  today: string,
  bridges: readonly BridgeDay[] = []
): StreakSummary {
  const { valid, recorded } = collectValidDays(dates, bridges, today);

  if (valid.size === 0) return { ...EMPTY_SUMMARY };

  // YYYY-MM-DD 的字典序就是日期序，不需要转 Date 再排
  const sorted = Array.from(valid).sort();

  // 历史最佳：扫一遍相邻间隔，差 1 天就接着数
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    if (diffDays(sorted[i - 1], sorted[i]) === 1) {
      run += 1;
      if (run > best) best = run;
    } else {
      run = 1;
    }
  }

  // 当前连胜：先定锚点，再从锚点往回数
  const yesterday = addDays(today, -1);
  const anchor = valid.has(today) ? today : valid.has(yesterday) ? yesterday : null;

  let current = 0;
  if (anchor) {
    let cursor = anchor;
    // 每轮都往更早走一天，最多走 totalDays 次，不会死循环
    while (valid.has(cursor)) {
      current += 1;
      cursor = addDays(cursor, -1);
    }
  }

  return {
    current,
    best,
    // 累计天数只数真正记过的日子：被桥接的那一天没有打卡，
    // 它不是「我做过的一天」，不该计入「累计 147 天」。
    totalDays: recorded.size,
    lastDate: sorted[sorted.length - 1] ?? null,
  };
}

/**
 * 一次算出「每条习惯」和「整体」的连胜。
 *
 * 首页要为每一条习惯显示自己的连胜，如果逐条查库就是 N+1；
 * 上游用一条 SQL 取出全部 (task_id, local_date) 后调这里分组，
 * 一次排序就够了。
 *
 * 返回的 byKey 只包含「至少有过一次记录」的键；
 * 没出现过的习惯按「第一天」处理（current = 0）。
 */
export function summarizeStreaks(
  facts: readonly DatedFact[],
  today: string,
  bridges: readonly BridgeDay[] = []
): { byKey: Map<string, StreakSummary>; overall: StreakSummary } {
  const grouped = new Map<string, string[]>();
  const allDates: string[] = [];

  for (const fact of facts) {
    if (!fact || typeof fact.key !== 'string') continue;
    const list = grouped.get(fact.key);
    if (list) {
      list.push(fact.date);
    } else {
      grouped.set(fact.key, [fact.date]);
    }
    allDates.push(fact.date);
  }

  const byKey = new Map<string, StreakSummary>();
  for (const [key, dates] of grouped) {
    byKey.set(key, summarizeDates(dates, today, bridges));
  }

  return { byKey, overall: summarizeDates(allDates, today, bridges) };
}

/* ------------------------------------------------------------------ *
 * 宽限券与修复（D38）
 *
 * ---- 两者的区别 ----
 *
 *   宽限券（grace）：**自动**。一个月几张，遇到断签先用券桥接一天，
 *                    不需要用户做任何事，用完就不再提。
 *   修复（repair）：**手动**。断签 48 小时内，用余烬买一次。
 *
 * 两者最终都写成一行 BridgeDay，差别只在那一天是谁买的。
 *
 * ---- 为什么修复期限是「断签那天的结束点 + 48 小时」----
 *
 * 不是「发现断了之后 48 小时」：那样长期不打开 App 的用户会得到一个
 * 永不过期的修复入口，而修复的意义是「趁你还记得的时候补上」。
 * 从断签那天算，期限会照常流逝，这是 docs/04 §7.3 的口径。
 * ------------------------------------------------------------------ */

/** 一次「当前该不该断签」的判定结果 */
export interface GapCheck {
  /** 连胜是不是真的断了（今天与昨天都没有算数的日子） */
  broken: boolean;
  /** 空档里没有记录的那几天（从早到晚）。broken 为 false 时为空 */
  gapDates: string[];
  /** 能不能用余烬修。false 时看 reason */
  repairable: boolean;
  /** 不能修的原因 */
  reason: 'ok' | 'nothing_to_repair' | 'deadline_passed' | 'insufficient_ember' | 'insufficient_material';
  /** 修复要花多少 */
  cost: { ember: number; material: number };
  /** 修复期限（本地毫秒）。null 表示没有可修的缺口 */
  deadlineMs: number | null;
}

/** 判定一个断签缺口能不能修所需要的输入。全部从外面传进来 */
export interface GapCheckInput {
  /** 今天（业务日） */
  today: string;
  /** 所有「算数的日子」（打卡日 + 已桥接的日子），用于找缺口 */
  validDates: readonly string[];
  /** 玩家当前余烬 */
  ember: number;
  /** 玩家当前材料 */
  material: number;
  /** 修复成本（来自 DIFFICULTY） */
  repairEmber: number;
  repairMaterial: number;
  /** 现在（本地毫秒），用于判断期限 */
  nowMs: number;
  /** 日界小时，用来算「断签那天的结束点」 */
  dayStartHour: number;
  /**
   * 算出某个业务日的结束时刻（本地毫秒）。
   *
   * 不从 date.ts 直接 import：`businessDayEndMs` 要读本地时区，
   * 而 domain 层的规矩是「不读系统时间」。由调用方把函数传进来，
   * 这样测试可以固定时区。
   */
  dayEndMs: (dateKey: string) => number;
}

/** 修复期限的长度：48 小时（docs/04 §7.3） */
export const REPAIR_WINDOW_HOURS = 48;

/**
 * 找出当前的断签缺口，并判断能不能修。
 *
 * 缺口 = 从「最近一个算数的日子」到「今天」之间，那些既没打卡也没被桥接的日子。
 * 但**今天不算缺口**：今天还没过完，现在没记不等于不做（与 summarizeDates 同一个口径）。
 *
 * 如果昨天有记录，缺口为空 → 没有可修的。
 */
export function checkRepairableGap(input: GapCheckInput): GapCheck {
  const nothing = (reason: GapCheck['reason']): GapCheck => ({
    broken: false,
    gapDates: [],
    repairable: false,
    reason,
    cost: { ember: 0, material: 0 },
    deadlineMs: null,
  });

  const valid = new Set<string>();
  for (const d of input.validDates) {
    if (isDateKey(d) && diffDays(input.today, d) <= 0) valid.add(d);
  }

  // 从昨天往回找：昨天算数 → 没断
  const yesterday = addDays(input.today, -1);
  if (valid.has(yesterday)) return nothing('nothing_to_repair');

  // 往后数缺口：从昨天往前，直到遇到一个算数的日子
  const gapDates: string[] = [];
  let cursor = yesterday;
  // 上限 366 天：再长的空档也不需要逐日列出来（而且没人会修三年前的断签）
  for (let i = 0; i < 366; i++) {
    if (valid.has(cursor)) break;
    gapDates.push(cursor);
    cursor = addDays(cursor, -1);
  }
  gapDates.reverse(); // 从早到晚，与 checkins 的排序方向一致

  // 缺口一直数到了上限也没遇到任何算数的日子 → 从来没有过记录。
  // 那不是「断了」，是还没开始：没有可恢复的东西，也不该提供修复。
  if (gapDates.length === 0 || !valid.has(cursor)) return nothing('nothing_to_repair');

  // 期限：从「最后一个算数的日子」的结束点算起 48 小时。
  // 那一刻正是用户开始欠记录的时刻；期限从那里流逝，
  // 而不是从「他发现断了的那一刻」开始（docs/04 §7.3）。
  const lastGood = cursor;
  const deadlineMs = input.dayEndMs(lastGood) + REPAIR_WINDOW_HOURS * 3_600_000;

  const cost = { ember: Math.max(0, input.repairEmber), material: Math.max(0, input.repairMaterial) };

  if (input.nowMs > deadlineMs) {
    return {
      broken: true,
      gapDates,
      repairable: false,
      reason: 'deadline_passed',
      cost,
      deadlineMs,
    };
  }

  if (input.ember < cost.ember) {
    return { broken: true, gapDates, repairable: false, reason: 'insufficient_ember', cost, deadlineMs };
  }

  if (input.material < cost.material) {
    return { broken: true, gapDates, repairable: false, reason: 'insufficient_material', cost, deadlineMs };
  }

  return { broken: true, gapDates, repairable: true, reason: 'ok', cost, deadlineMs };
}

/**
 * 宽限券：这个月还剩几张。
 *
 * 按月重置，**不累积**（docs/04 §7.3）。传入本月用掉的券日，
 * 只数属于 `monthKey` 那个月的。
 *
 * 为什么传日期而不是传一个计数：计数得由调用方先算，
 * 而「哪些算这个月的」这个判断一旦分散到各处，就会有一处用错月份键。
 * 在这里统一 slice(0,7) 比较，只有一种算法。
 *
 * 为什么不在这个函数里扣减：它是纯函数，只回答「还剩几张」。
 * 扣减发生在 services 层写库那一步。
 */
export function graceRemaining(
  monthKey: string,
  usedDates: readonly string[],
  gracePerMonth: number
): number {
  const total = Math.max(0, Math.floor(gracePerMonth));
  let used = 0;
  for (const d of usedDates) {
    if (isDateKey(d) && monthKeyOf(d) === monthKey) used += 1;
  }
  return Math.max(0, total - used);
}

/**
 * 把「这个月」的键算出来。YYYY-MM。
 * 单独写一个函数而不是各处 slice(0,7)：让「一个月是什么」只有一种写法。
 */
export function monthKeyOf(dateKey: string): string {
  return dateKey.slice(0, 7);
}
