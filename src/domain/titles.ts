/**
 * 称号（阶段 4 第 3 条；D52 起分两层）。
 *
 * ---- 它是什么 ----
 *
 * 称号是**你已经成了什么样的人**。**纯展示，不影响任何数值**（D7）。
 * 它没有稀有度、没有排序，也没有「已解锁 3 / 20」的进度条——
 * 那个进度条会立刻变成一张待办清单。
 *
 * ---- D52：两层，回答两个不同的问题 ----
 *
 *   1. **属性称号**（15 个）：某一维的点数到 3 / 12 / 30 就解锁。
 *      回答的是「**你的时间花在哪儿**」——五个方向各自的一段路。
 *   2. **旅程称号**（5 个）：人生等级到 10 / 20 / 30 / 40 / 50 就解锁。
 *      回答的是「**你整体走了多远**」——这是唯一跨维度的进度尺。
 *
 * 为什么必须分开而不是混成一张表：两者的**量纲不同**。属性点是「这一维做了多少」
 * （五条互不相干的水位），等级是「全部加起来多少」（一条总水位）。
 * 混在一起会让读者以为「体魄 30 点」和「LV.30」是同一件事。
 * 图鉴页因此分两组：五维在前（主线），旅程在后。
 *
 * ---- 为什么是 10 / 20 / 30 / 40 / 50，不是 docs/01 写的「每 5 级」----
 *
 * `XP_TABLE` 是 ceil(60 × L^1.4)，按「每天 3 件习惯（轻松档 26 XP/件）」折算：
 *
 *   LV10 ≈ 2.3 个月    LV20 ≈ 13 个月    LV30 ≈ 3 年
 *   LV40 ≈ 6 年        LV50 ≈ 10 年
 *
 * 每 5 级给一个 = 10 个称号，其中 6 个要 2–10 年才拿到。那不是远方的路标，
 * 那是 6 张永远灰着的卡——与「未解锁只显示条件」这条规矩（D41）直接打架。
 * 取每 10 级，留下 5 个：最近的 2 个在一年内能摸到，最远那个是十年。
 *
 * ---- 为什么按属性点，而不是按打卡次数 ----
 *
 * 属性点是**累积且不会掉**的（撤销会退，但那是对事实的诚实回退）。
 * 打卡次数会随撤销、随删除任务变化，用它做解锁条件会出现
 * 「昨天解锁的称号今天没了」——那是这个 App 最不该做的事。
 * 旅程称号用等级，同理：等级由累计 XP 反查，而累计 XP 只在撤销时回退。
 *
 * ---- 为什么属性阈值是 3 / 12 / 30 ----
 *
 * 属性点每 200 点属性 XP 换 1 点（ATTR_XP_PER_POINT）。
 * 一条习惯打卡一次给 20 属性 XP（标准难度，BASE_REWARD.habit_daily），
 * 乘 0.85（轻松档默认）= 17。所以下面这些数字是**在这一维上**的次数：
 *
 *   3 点 ≈ 这一维 35 次      第一个月内能摸到（每天一件的话）
 *   12 点 ≈ 这一维 140 次    大约半年
 *   30 点 ≈ 这一维 350 次    一年以上
 *
 * 注意「这一维」三个字不能省：属性 XP 是每维独立的，一条习惯只涨一维，
 * 所以「35 次记录」不等于「App 里一共记了 35 次」。
 *
 * 三档的间距是刻意拉的：前两档要能在真实使用里摸到，
 * 最后一档要真的是「走了很久」才拿得到。三档之间如果只差一点点，
 * 第二、三个称号就变成了「又解锁了一个」的通知噪音。
 *
 * ---- 为什么称号名是名词，不是形容词 ----
 *
 * 「体魄·坚韧」是在评价用户；「体魄·行者」是在描述他做过的事。
 * 这条与「不评判」底线一致（docs/02 §2.4）：App 只记录，不夸奖。
 *
 * 本文件是纯函数与纯常量：不 import React、不碰数据库。
 */
import { ATTRIBUTE_KEYS, MAX_LEVEL, type AttributeKey } from './balance';

/** 解锁一个属性称号需要的属性点 */
export const TITLE_THRESHOLDS = [3, 12, 30] as const;

/**
 * 解锁一个旅程称号需要的人生等级。
 *
 * 与 `TITLE_THRESHOLDS` 并列，不合并：两者量纲不同（见文件头）。
 */
export const JOURNEY_THRESHOLDS = [10, 20, 30, 40, 50] as const;

/** 一个称号 */
export interface Title {
  /** 稳定 id，形如 `body-1`（属性）或 `journey-10`（旅程）。存进库与导出都用它 */
  id: string;
  /** 属于哪一维。旅程称号不属于任何一维，固定 `null` */
  attribute: AttributeKey | null;
  /** 第几档（1 开始） */
  tier: number;
  /** 解锁需要的量：属性称号是属性点，旅程称号是人生等级 */
  threshold: number;
  /** 称号名。名词，不是形容词 */
  name: string;
  /** 一句话说明这个称号在说什么。**不夸奖**，只描述 */
  note: string;
}

/**
 * 称号表：五维 × 三档 = 15 个。
 *
 * 每一档的名字都从「走过 / 做过」的角度取，而不是从「你很好」的角度。
 * 三个档位在同一维里是递进的动作：开始做 → 一直在做 → 成了习惯。
 */
export const TITLES: readonly Title[] = [
  // 体魄
  { id: 'body-1', attribute: 'body', tier: 1, threshold: 3, name: '起身的人', note: '开始把身体当回事了。' },
  { id: 'body-2', attribute: 'body', tier: 2, threshold: 12, name: '常动的人', note: '动起来已经是日常的一部分。' },
  { id: 'body-3', attribute: 'body', tier: 3, threshold: 30, name: '耐久的行者', note: '这件事已经不需要下决心了。' },

  // 心智
  { id: 'mind-1', attribute: 'mind', tier: 1, threshold: 3, name: '翻开书的人', note: '开始留时间给要动脑的事。' },
  { id: 'mind-2', attribute: 'mind', tier: 2, threshold: 12, name: '常读的人', note: '读和学已经排进了日子里。' },
  { id: 'mind-3', attribute: 'mind', tier: 3, threshold: 30, name: '长线的求索者', note: '想弄明白的事，一直在弄。' },

  // 秩序
  { id: 'order-1', attribute: 'order', tier: 1, threshold: 3, name: '收拾的人', note: '开始给东西找位置。' },
  { id: 'order-2', attribute: 'order', tier: 2, threshold: 12, name: '常整理的人', note: '把秩序维持住成了习惯。' },
  { id: 'order-3', attribute: 'order', tier: 3, threshold: 30, name: '安静的管家', note: '东西自己会回到位置上。' },

  // 心力
  { id: 'spirit-1', attribute: 'spirit', tier: 1, threshold: 3, name: '坐下来的人', note: '开始给自己留一段安静。' },
  { id: 'spirit-2', attribute: 'spirit', tier: 2, threshold: 12, name: '常静的人', note: '安静的那一段已经是日常。' },
  { id: 'spirit-3', attribute: 'spirit', tier: 3, threshold: 30, name: '稳的锚', note: '不太容易被一天里的事推走。' },

  // 联结
  { id: 'bond-1', attribute: 'bond', tier: 1, threshold: 3, name: '开口的人', note: '开始主动联系别人。' },
  { id: 'bond-2', attribute: 'bond', tier: 2, threshold: 12, name: '常在的人', note: '「想起来了就问一句」成了习惯。' },
  { id: 'bond-3', attribute: 'bond', tier: 3, threshold: 30, name: '一直都在的人', note: '对几个人来说，你一直在。' },
];

/**
 * 旅程称号：人生等级 10 / 20 / 30 / 40 / 50 = 5 个。
 *
 * 名字与属性称号的取法一致：**名词、说做过的事**，不夸奖。
 * 但两层的「说明」措辞刻意不同——
 *   属性称号说的是「**这一维**」：动起来、读和学、把秩序维持住……
 *   旅程称号说的是「**整件事**」：排进日子里、不用每天重新决定、人还在……
 * 这样读者不会把「体魄三档」和「LV.30」当成同一件事的两种说法。
 *
 * 为什么第一档是 10 级而不是 5 级：5 级大约 12 天就到（每天 3 件习惯），
 * 那时用户还在「刚装了一个 App」的阶段，给一个称号反而像发参与奖。
 * 10 级约 2.3 个月，是「这件事真的进了我的生活」的第一个可信时刻。
 */
export const JOURNEY_TITLES: readonly Title[] = [
  {
    id: 'journey-10',
    attribute: null,
    tier: 1,
    threshold: 10,
    name: '走过一段的人',
    note: '这件事已经排进日子里了。',
  },
  {
    id: 'journey-20',
    attribute: null,
    tier: 2,
    threshold: 20,
    name: '有节奏的人',
    note: '不用每天重新决定要不要做。',
  },
  {
    id: 'journey-30',
    attribute: null,
    tier: 3,
    threshold: 30,
    name: '走了很久的人',
    note: '中间有过空档，但人还在。',
  },
  {
    id: 'journey-40',
    attribute: null,
    tier: 4,
    threshold: 40,
    name: '留得住的人',
    note: '它已经长在生活里了。',
  },
  {
    id: 'journey-50',
    attribute: null,
    tier: 5,
    threshold: 50,
    name: '火一直在的人',
    note: '从点着那天起，它没熄过。',
  },
];

/** 全部称号：属性 15 + 旅程 5 = 20。图鉴页按这个顺序分两组渲染 */
export const ALL_TITLES: readonly Title[] = [...TITLES, ...JOURNEY_TITLES];

/** 是不是旅程称号。类型守卫：`attribute` 为 null 的就是旅程 */
export function isJourneyTitle(title: Title): boolean {
  return title.attribute === null;
}

/** 某一个旅程称号的图形键（给 `components/TitleMark` 用） */
export const JOURNEY_MARK_KEY = 'journey' as const;

/** 按 id 取称号。不认识时返回 null（不是抛错：导入的旧数据可能有陌生 id） */
export function getTitle(id: string): Title | null {
  return ALL_TITLES.find((title) => title.id === id) ?? null;
}

/** 某一维的全部称号，按档位升序 */
export function titlesOf(attribute: AttributeKey): Title[] {
  return TITLES.filter((title) => title.attribute === attribute);
}

/**
 * 五维当前点数 → 已解锁的称号 id。
 *
 * 纯函数：输入是五个数字，输出是一串 id。不读库、不读时间。
 * 之所以不「存」解锁状态，是因为它完全可以从点数推出来——
 * 存一份就多一个会对不上的地方（与 D21 / D38 同一条思路）。
 */
export function unlockedTitles(points: Record<AttributeKey, number>): string[] {
  const out: string[] = [];
  for (const title of TITLES) {
    // 属性称号表的每一项都有 attribute；`?? null` 只是为了让类型收窄通过
    const key = title.attribute;
    if (key === null) continue;
    if ((points[key] ?? 0) >= title.threshold) out.push(title.id);
  }
  return out;
}

/**
 * 人生等级 → 已解锁的旅程称号 id。
 *
 * 与 `unlockedTitles` 并列而不是合并：一个吃「五维点数」，一个吃「等级」。
 * 混成一个函数就要传两个参数，而且调用方永远只关心其中一个。
 */
export function unlockedJourneyTitles(level: number): string[] {
  const lv = Number.isFinite(level) ? level : 1;
  return JOURNEY_TITLES.filter((title) => lv >= title.threshold).map((title) => title.id);
}

/**
 * 下一个旅程称号（没有就返回 null = 已经到顶）。
 *
 * 与 `nextTitles` 的区别：那个返回**五个**（每维一个），这个只返回一个——
 * 等级是单条轴，没有「五个方向」可言。
 */
export function nextJourneyTitle(level: number): { title: Title; remaining: number } | null {
  const lv = Number.isFinite(level) ? level : 1;
  const next = JOURNEY_TITLES.find((title) => lv < title.threshold);
  if (!next) return null;
  return { title: next, remaining: next.threshold - lv };
}

/**
 * 下一批即将解锁的称号（每一维最多一个）。
 *
 * 「我的」页用它显示「再走 X 点就解锁」。
 *
 * 为什么每维只给一个：五个「还差多少」并排会变成五张待办。
 * 只给最近的那一个，是「下一步在哪儿」，不是「你还欠五件事」。
 */
export function nextTitles(points: Record<AttributeKey, number>): Array<{
  title: Title;
  remaining: number;
}> {
  const out: Array<{ title: Title; remaining: number }> = [];

  for (const key of ATTRIBUTE_KEYS) {
    const value = points[key] ?? 0;
    const next = titlesOf(key).find((title) => value < title.threshold);
    if (next) out.push({ title: next, remaining: next.threshold - value });
  }

  // 差得最少的排前面：它是「下一步最可能到手的那个」
  return out.sort((a, b) => a.remaining - b.remaining);
}

/**
 * 最高档已解锁的称号（每一维最多一个，按档位降序）。
 *
 * 「我的」页页头用它显示「你现在是哪一类人」。
 * 一个都没解锁时返回空数组，界面就不显示那一行。
 */
export function highestTitles(points: Record<AttributeKey, number>): Title[] {
  const out: Title[] = [];
  for (const key of ATTRIBUTE_KEYS) {
    const value = points[key] ?? 0;
    const reached = titlesOf(key).filter((title) => value >= title.threshold);
    const top = reached[reached.length - 1];
    if (top) out.push(top);
  }
  // 按档位降序：三档的排在前面（那是走得最远的）
  return out.sort((a, b) => b.tier - a.tier);
}

/**
 * 解锁进度：已解锁几个 / 一共几个。给图鉴页与状态页用。
 *
 * 两层一起数（属性 + 旅程），所以 `total` 是 20 而不是 15。
 * 两层的分量拆开也一并返回：图鉴页要按组显示，状态页那一行只写总数。
 */
export function titleProgress(
  points: Record<AttributeKey, number>,
  level: number
): {
  unlocked: number;
  total: number;
  attribute: { unlocked: number; total: number };
  journey: { unlocked: number; total: number };
} {
  const attrUnlocked = unlockedTitles(points).length;
  const journeyUnlocked = unlockedJourneyTitles(level).length;
  return {
    unlocked: attrUnlocked + journeyUnlocked,
    total: ALL_TITLES.length,
    attribute: { unlocked: attrUnlocked, total: TITLES.length },
    journey: { unlocked: journeyUnlocked, total: JOURNEY_TITLES.length },
  };
}
