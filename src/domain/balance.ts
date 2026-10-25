/**
 * 数值表与计算（纯函数，不碰数据库、不碰 UI）
 *
 * 这里的每个数字都来自 docs/04-数据模型与数值.md 第 4 节。
 * 改动任何一个都要同步改文档，否则 UI 显示和实际发放会对不上。
 *
 * 约定：
 * - 所有奖励先乘难度倍率，再乘补记比例，最后过每日软上限。
 * - 随机不参与任何数值计算（只影响文案与动画），所以撤销重记不会多拿。
 */

/** 等级上限。满级后不再升级，但属性专精继续成长 */
export const MAX_LEVEL = 50;

/** 属性 XP 每满多少转 1 个属性点 */
export const ATTR_XP_PER_POINT = 200;

/** 单个属性点上限（纯展示，不影响任何数值） */
export const ATTR_POINTS_MAX = 99;

/** 每日绝对硬上限：无论软上限怎么算，一天最多拿这么多 XP */
export const ABSOLUTE_DAILY_XP_CAP = 3000;

/** 五维属性的键。顺序固定，UI 展示顺序也按这个来 */
export const ATTRIBUTE_KEYS = ['body', 'mind', 'order', 'spirit', 'bond'] as const;

/** 属性键类型：体魄 / 心智 / 秩序 / 心力 / 联结 */
export type AttributeKey = (typeof ATTRIBUTE_KEYS)[number];

/** 属性中文名，只用于展示。集中放这里，避免各处各写一份 */
export const ATTRIBUTE_LABEL: Record<AttributeKey, string> = {
  body: '体魄',
  mind: '心智',
  order: '秩序',
  spirit: '心力',
  bond: '联结',
};

/**
 * 升到下一级所需 XP 表：XP_TABLE[L] = 从 L 级升到 L+1 级所需。
 *
 * 公式：ceil(60 × L^1.4)，L 从 1 到 49；50 级已满，填 0。
 * 在模块加载时生成而不是硬编码 49 个数字：
 * 以后要调曲线只改这一个公式，也不用担心手抄错一位。
 *
 * 下标 0 留空（没有 0 级），这样 XP_TABLE[1] 就是 1 级的需求，读起来不容易错位。
 */
export const XP_TABLE: readonly number[] = (() => {
  const table: number[] = [0]; // 占位：下标 0 不使用
  for (let level = 1; level <= MAX_LEVEL; level++) {
    if (level === MAX_LEVEL) {
      table.push(0); // 满级：不再需要 XP
    } else {
      table.push(Math.ceil(60 * Math.pow(level, 1.4)));
    }
  }
  return table;
})();

/**
 * 累计 XP 表：CUM_XP[L] = 从 1 级升到 L 级总共需要的 XP。
 *
 * CUM_XP[1] = 0（1 级是起点），CUM_XP[2] = 60，……，CUM_XP[50] = 291741。
 * 用它做「总 XP → 当前等级」的反查，比每次循环累加更省事。
 */
export const CUM_XP: readonly number[] = (() => {
  const cum: number[] = [0, 0]; // 下标 0 占位；CUM_XP[1] = 0
  let sum = 0;
  for (let level = 1; level < MAX_LEVEL; level++) {
    sum += XP_TABLE[level];
    cum.push(sum); // 此时 cum 的下标正好是 level + 1
  }
  return cum;
})();

/** 达到某个等级所需的累计 XP（自动钳制到 1–50） */
export function xpForLevel(level: number): number {
  const l = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  return CUM_XP[l] ?? 0;
}

/**
 * 由历史累计 XP 反查当前等级与级内进度。
 *
 * 返回：
 * - level：1–50
 * - inLevel：当前等级内已积累的 XP（满级时固定为 0）
 *
 * 用线性扫描（最多 50 次）而不是二分：表太短，可读性更重要。
 * 负数和 NaN 一律按 1 级 0 进度处理，避免脏数据把 UI 弄崩。
 */
export function levelFromTotalXp(xpTotal: number): { level: number; inLevel: number } {
  if (!Number.isFinite(xpTotal) || xpTotal <= 0) {
    return { level: 1, inLevel: 0 };
  }

  let level = 1;
  for (let l = 1; l < MAX_LEVEL; l++) {
    if (xpTotal >= CUM_XP[l + 1]) {
      level = l + 1;
    } else {
      break;
    }
  }

  if (level >= MAX_LEVEL) {
    // 满级：不再累积级内进度，多出来的 XP 只体现在 xp_total 上
    return { level: MAX_LEVEL, inLevel: 0 };
  }

  return { level, inLevel: xpTotal - CUM_XP[level] };
}

/** 升到下一级还需要多少 XP（满级返回 0） */
export function xpToNextLevel(level: number, inLevel: number): number {
  const l = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  if (l >= MAX_LEVEL) return 0;
  return Math.max(0, XP_TABLE[l] - Math.max(0, inLevel));
}

/**
 * 基础奖励表的键。
 *
 * 与 docs 4.2 一一对应：
 * - habit_daily        习惯·每日打卡
 * - habit_weekly_times 习惯·每周 N 次（每次）
 * - weekly_goal        周目标达成（每周一次）
 * - todo               待办完成
 * - reward             奖励兑换（只消耗余烬，不产出）
 */
export type RewardKey = 'habit_daily' | 'habit_weekly_times' | 'weekly_goal' | 'todo' | 'reward';

/** 单次奖励结构：XP / 余烬 / 属性 XP */
export interface BaseReward {
  xp: number;
  ember: number;
  attrXp: number;
}

/**
 * 标准难度下的单任务基础奖励。
 *
 * 这里存的是「标准难度」原值；轻松/硬核在发放时乘 DIFFICULTY 的 rewardMult。
 * 周目标、奖励兑换在 v0.1 还不发放，但表先定好，避免以后各处散落魔法数字。
 */
export const BASE_REWARD: Record<RewardKey, BaseReward> = {
  habit_daily: { xp: 30, ember: 3, attrXp: 20 },
  habit_weekly_times: { xp: 25, ember: 3, attrXp: 18 },
  weekly_goal: { xp: 40, ember: 10, attrXp: 0 },
  todo: { xp: 60, ember: 6, attrXp: 50 },
  reward: { xp: 0, ember: 0, attrXp: 0 },
};

/** 三档难度的标识。默认 easy（轻松），与引导语「先选温和的」一致 */
export type DifficultyKey = 'easy' | 'standard' | 'hard';

/** 一档难度的完整配置。字段含义见下方 DIFFICULTY 注释 */
export interface DifficultyProfile {
  /** 界面展示名（界面语气：不说「惩罚」，说「温和」） */
  label: string;
  /** 收益倍率：同时作用于 XP、余烬、属性 XP */
  rewardMult: number;
  /** 补记窗口（小时）：从该业务日结束点开始算 */
  backfillWindowHours: number;
  /** 补记收益比例：先乘难度倍率，再乘它 */
  backfillRatio: number;
  /** 连胜修复消耗的余烬 */
  repairEmber: number;
  /** 连胜修复消耗的材料（v0.4 才真正消耗，v0.1 只留字段） */
  repairMaterial: number;
  /** 每月自动宽限次数，每月第一次结算时重置，不累积 */
  gracePerMonth: number;
  /** 修复期结束仍未修复时扣余烬的比例（轻松为 0，永不惩罚） */
  breakPenaltyRate: number;
  /** 单次扣余烬上限（轻松为 0） */
  breakPenaltyCap: number;
  /** 修复成功后当日记录的 XP 比例（轻松 100%、标准 70%、硬核 100% 已付费） */
  repairXpRatio: number;
}

/**
 * 三档难度完整配置。
 *
 * 数值必须与 docs/02 §2.1 和 docs/04 §4.5 逐项一致。
 * 轻松档的所有「惩罚」字段都是 0——这是产品的硬原则：永不惩罚。
 */
export const DIFFICULTY: Record<DifficultyKey, DifficultyProfile> = {
  easy: {
    label: '温和',
    rewardMult: 0.85,
    backfillWindowHours: 72,
    backfillRatio: 1.0, // 轻松档补记不打折
    repairEmber: 15,
    repairMaterial: 0,
    gracePerMonth: 3,
    breakPenaltyRate: 0,
    breakPenaltyCap: 0,
    repairXpRatio: 1.0,
  },
  standard: {
    label: '标准',
    rewardMult: 1.0,
    backfillWindowHours: 48,
    backfillRatio: 0.7,
    repairEmber: 40,
    repairMaterial: 1,
    gracePerMonth: 2,
    breakPenaltyRate: 0.05,
    breakPenaltyCap: 30,
    repairXpRatio: 0.7,
  },
  hard: {
    label: '硬核',
    rewardMult: 1.2,
    backfillWindowHours: 24,
    backfillRatio: 0.4,
    repairEmber: 100,
    repairMaterial: 3,
    gracePerMonth: 0,
    breakPenaltyRate: 0.1,
    breakPenaltyCap: 80,
    repairXpRatio: 1.0,
  },
};

/** 取难度配置；传入未知字符串时回退到默认的轻松档，避免崩溃 */
export function getDifficulty(key: string | null | undefined): DifficultyProfile {
  if (key === 'standard' || key === 'hard') return DIFFICULTY[key];
  return DIFFICULTY.easy;
}

/** 每日额度：软上限 + 硬上限 */
export interface DailyCap {
  /** XP 软上限 = 150 + 25 × 等级 */
  xp: number;
  /** 余烬软上限 = 15 + 3 × 等级 */
  ember: number;
  /** XP 绝对硬上限（恒为 3000），超过就一点都不给了 */
  xpHard: number;
}

/**
 * 计算某等级的每日软上限。
 *
 * 公式来自 docs 4.4。软上限的作用是「防刷」而不是「罚」：
 * 超出部分 XP 仍给 25%，余烬给 0%，用户不会觉得白做。
 */
export function dailyCap(level: number): DailyCap {
  const l = Math.min(MAX_LEVEL, Math.max(1, Math.floor(Number.isFinite(level) ? level : 1)));
  return {
    xp: 150 + 25 * l,
    ember: 15 + 3 * l,
    xpHard: ABSOLUTE_DAILY_XP_CAP,
  };
}

/**
 * 分段应用软上限。
 *
 * 不是「超了就砍半」的一刀切，而是把这次奖励切成两段：
 * - 额度内那段：100% 发放；
 * - 超出那段：按 overflowRatio 打折（XP 0.25，余烬 0）。
 *
 * 例：额度剩 10，本次原始 30，overflowRatio = 0.25
 *   → 10 + floor(20 × 0.25) = 15。
 *
 * 参数：
 * - raw：本次原始奖励（已乘完难度与补记比例）
 * - alreadyEarned：该业务日已经拿到的同类奖励
 * - cap：软上限
 * - overflowRatio：超出部分的比例（0–1）
 */
export function applySoftCap(
  raw: number,
  alreadyEarned: number,
  cap: number,
  overflowRatio: number
): number {
  const rawValue = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
  if (rawValue === 0) return 0;

  const used = Math.max(0, Number.isFinite(alreadyEarned) ? alreadyEarned : 0);
  const remaining = Math.max(0, cap - used);
  const ratio = Math.min(1, Math.max(0, Number.isFinite(overflowRatio) ? overflowRatio : 0));

  if (rawValue <= remaining) return rawValue;
  return remaining + Math.floor((rawValue - remaining) * ratio);
}

/** 属性成长结果 */
export interface AttributeGrowth {
  /** 转换后剩余的属性 XP（0–199） */
  xp: number;
  /** 转换后的属性点（上限 99） */
  points: number;
  /** 本次新获得多少属性点（0 或 1，理论上一次最多 1，但保留通用性） */
  pointsGained: number;
  /** 本次是否产生了属性点（用于 UI 播放提示） */
  leveledUp: boolean;
}

/**
 * 属性成长：200 属性 XP 换 1 点，余数保留。
 *
 * 参数：
 * - currentXp：该维度当前属性 XP（0–199）
 * - currentPoints：该维度当前属性点
 * - gain：本次获得的属性 XP（已乘难度与补记比例）
 *
 * 属性点纯展示：不影响任何数值，所以不需要考虑平衡性。
 * 上限 99 是防止 UI 位数溢出，也符合「专精」的叙事。
 */
export function growAttribute(
  currentXp: number,
  currentPoints: number,
  gain: number
): AttributeGrowth {
  const xp0 = Math.min(ATTR_XP_PER_POINT - 1, Math.max(0, Math.floor(currentXp || 0)));
  const pts0 = Math.min(ATTR_POINTS_MAX, Math.max(0, Math.floor(currentPoints || 0)));
  const add = Math.max(0, Math.floor(Number.isFinite(gain) ? gain : 0));

  const total = xp0 + add;
  const gained = Math.floor(total / ATTR_XP_PER_POINT);
  const nextXp = total % ATTR_XP_PER_POINT;
  const nextPoints = Math.min(ATTR_POINTS_MAX, pts0 + gained);

  return {
    xp: nextXp,
    points: nextPoints,
    pointsGained: nextPoints - pts0,
    leveledUp: nextPoints > pts0,
  };
}

/** 属性回退结果 */
export interface AttributeRegression {
  /** 回退后的属性 XP（0–199） */
  xp: number;
  /** 回退后的属性点（0–99） */
  points: number;
  /** 本次扣掉了几点属性点（0 或正数） */
  pointsLost: number;
}

/**
 * 属性回退：growAttribute 的反向操作，撤销打卡时用。
 *
 * 为什么不直接 `growAttribute(xp, points, -loss)`：
 * 那个函数只接受正数的 gain，而且它不知道「点数」是可以拆回 XP 的。
 * 撤销一次拿过 20 属性 XP 的记录时，如果当时刚好靠它满了 200 换到 1 点，
 * 正确的回退是「点数减 1、XP 变成 180」，而不是「XP 减 20」。
 *
 * 做法：把「点数 × 200 + XP」还原成总量，扣掉 loss 再拆回去。
 * 这样不需要额外存「总属性经验」，也不会让 XP 落在 0–199 之外。
 *
 * 上限的取舍：属性点到 99 之后 growAttribute 丢弃了溢出的部分，
 * 所以这里的「总量」只是实际存下来的总量，回退结果与之一致，不会扣成负数。
 */
export function regressAttribute(
  currentXp: number,
  currentPoints: number,
  loss: number
): AttributeRegression {
  const xp0 = Math.min(ATTR_XP_PER_POINT - 1, Math.max(0, Math.floor(currentXp || 0)));
  const pts0 = Math.min(ATTR_POINTS_MAX, Math.max(0, Math.floor(currentPoints || 0)));

  const total = pts0 * ATTR_XP_PER_POINT + xp0;
  // 先钳到「现有的总量」，否则一次异常的 loss 能把属性扣成负数
  const take = Math.min(Math.max(0, Math.floor(Number.isFinite(loss) ? loss : 0)), total);
  const remaining = total - take;

  const nextPoints = Math.min(ATTR_POINTS_MAX, Math.floor(remaining / ATTR_XP_PER_POINT));
  const nextXp = remaining % ATTR_XP_PER_POINT;

  return {
    xp: nextXp,
    points: nextPoints,
    pointsLost: pts0 - nextPoints,
  };
}

/**
 * 升级时发的余烬奖励（每级 10）。
 *
 * 单独抽出来是因为它「不占每日软上限」——docs 4.4 明确说一次性奖励不占额度。
 * 一次性奖励统一走这个函数，避免以后有人把它塞进 applySoftCap。
 */
export const LEVEL_UP_EMBER_REWARD = 10;
