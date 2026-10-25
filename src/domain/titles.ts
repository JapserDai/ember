/**
 * 称号（阶段 4 第 3 条）。
 *
 * ---- 它是什么 ----
 *
 * 五维属性点达到阈值就解锁一个称号。**纯展示，不影响任何数值**（D7）。
 *
 * 称号不是「等级」，也不是「成就分」。它是一句话：你这个人的时间大多花在哪儿。
 * 所以它没有稀有度、没有排序、没有「已解锁 3 / 20」的进度条——
 * 那个进度条会立刻变成一张待办清单。
 *
 * ---- 为什么按属性点，而不是按打卡次数 ----
 *
 * 属性点是**累积且不会掉**的（撤销会退，但那是对事实的诚实回退）。
 * 打卡次数会随撤销、随删除任务变化，用它做解锁条件会出现
 * 「昨天解锁的称号今天没了」——那是这个 App 最不该做的事。
 *
 * ---- 为什么阈值是 3 / 12 / 30 ----
 *
 * 属性点每 200 点属性 XP 换 1 点（ATTR_XP_PER_POINT）。
 * 一条习惯打卡一次给 20 属性 XP（标准难度，BASE_REWARD.habit_daily），
 * 乘 0.85（轻松档默认）= 17。所以：
 *
 *   3 点 ≈ 35 次记录      第一个月内能摸到（每天一件的话）
 *   12 点 ≈ 140 次记录    大约半年
 *   30 点 ≈ 350 次记录    一年以上
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
import { ATTRIBUTE_KEYS, type AttributeKey } from './balance';

/** 解锁一个称号需要的属性点 */
export const TITLE_THRESHOLDS = [3, 12, 30] as const;

/** 一个称号 */
export interface Title {
  /** 稳定 id，形如 `body-1`。存进库与导出都用它 */
  id: string;
  /** 属于哪一维 */
  attribute: AttributeKey;
  /** 第几档（1 开始） */
  tier: number;
  /** 解锁需要的属性点 */
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

/** 按 id 取称号。不认识时返回 null（不是抛错：导入的旧数据可能有陌生 id） */
export function getTitle(id: string): Title | null {
  return TITLES.find((title) => title.id === id) ?? null;
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
    const value = points[title.attribute] ?? 0;
    if (value >= title.threshold) out.push(title.id);
  }
  return out;
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

/** 解锁进度：已解锁几个 / 一共几个。给图鉴页用 */
export function titleProgress(points: Record<AttributeKey, number>): {
  unlocked: number;
  total: number;
} {
  return { unlocked: unlockedTitles(points).length, total: TITLES.length };
}
