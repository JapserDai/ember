/**
 * 打卡的纯计算部分（不写数据库、不碰 React）
 *
 * 这个文件回答一个问题：给定「任务 + 玩家 + 今天已经拿了多少 + 难度 + 是否补记」，
 * 这一次打卡应该发多少 XP / 余烬 / 属性 XP，会不会升级，有没有被软上限截断。
 *
 * 真正的落库（写 checkins、更新 player、待办标记完成）在 repo 层，
 * 由 db.withTransactionSync 包起来。这里只算数，方便直接写单元测试。
 *
 * 计算顺序（与 docs/04 §5.1 一致，不能调换）：
 *   基础奖励 → 难度倍率 → 补记折扣 → 每日软上限 → 绝对硬上限
 * 升级奖励（每级 10 余烬）不占软上限，单独加。
 */

import {
  ATTRIBUTE_KEYS,
  BASE_REWARD,
  LEVEL_UP_EMBER_REWARD,
  MAX_LEVEL,
  applySoftCap,
  dailyCap,
  getDifficulty,
  growAttribute,
  levelFromTotalXp,
  type AttributeKey,
  type DifficultyKey,
  type RewardKey,
} from './balance';
import { businessDayEndMs, diffDays, MS_PER_HOUR } from './date';
import { checkinSeed } from './prng';
import type { RecurrenceKind, TaskKind, TaskStatus } from './recurrence';

/**
 * 每日软上限里「超出部分」的折算比例。
 *
 * XP 与属性 XP 共用这个比例（属性 XP 按 XP 的额度比例切分，见 splitByXpQuota），
 * 余烬的对应比例是 0——超出额度后余烬一点不给，这是 docs 4.4 的硬规定。
 */
export const XP_OVERFLOW_RATIO = 0.25;

/** 一次打卡的输入来源 */
export type ScoreSource = 'manual' | 'backfill' | 'import';

/**
 * 计算所需的任务形状。
 *
 * 只声明用得到的字段：repo 层查出来转成驼峰后可以直接传进来，
 * 不需要为「算奖励」再造一个完整实体。
 */
export interface ScorableTask {
  id: string;
  type: TaskKind;
  recurrence: RecurrenceKind;
  attribute: AttributeKey;
  status: TaskStatus;
  /** 同一业务日最多能记几次 */
  maxPerDay: number;
  /** 0/1：是否允许补记 */
  allowBackfill: number;
  /** 奖励类任务的余烬价格（v0.1 只有数据字段，兑换逻辑 v0.4 才完整） */
  emberCost: number;
  deletedAt?: number | null;
}

/** 单个属性的当前状态：属性 XP（0–199）+ 已获得的属性点 */
export interface AttributeState {
  xp: number;
  points: number;
}

/** 计算所需的玩家快照 */
export interface ScorablePlayer {
  id: string;
  level: number;
  xpTotal: number;
  /** 当前等级内进度，仅用于回填 UI；等级以 levelFromTotalXp(xpTotal) 为准 */
  xpInLevel: number;
  highestLevel: number;
  ember: number;
  attributes: Record<AttributeKey, AttributeState>;
}

/**
 * 一次打卡的完整输入。
 *
 * today / todayCount / todayXp / todayEmber 全部由调用方查好再传进来，
 * 这样这个函数不需要知道「今天」是什么，也不需要访问数据库。
 */
export interface ScoreInput {
  task: ScorableTask;
  player: ScorablePlayer;
  /** 要打卡的业务日（补记时是过去的某天） */
  targetDate: string;
  /** 当前业务日，用于拒绝未来日期 */
  today: string;
  /** 真实时间戳（毫秒），用于补记窗口判断与审计 */
  nowMs: number;
  source: ScoreSource;
  difficulty: DifficultyKey;
  /** 日界小时，用于算业务日结束点 */
  dayStartHour: number;
  /** 该任务在该业务日已有的有效打卡次数（也是这次记录的 scoreCount） */
  todayCount: number;
  /** 该业务日已经拿到的 XP（所有任务合计） */
  todayXp: number;
  /** 该业务日已经拿到的余烬（所有任务合计） */
  todayEmber: number;
}

/** 拒绝打卡的原因码。UI 层据此展示中性文案，不在这里拼字符串 */
export type ScoreErrorCode =
  | 'TASK_NOT_FOUND'
  | 'TASK_DELETED'
  | 'TASK_PAUSED'
  | 'TASK_ARCHIVED'
  | 'FUTURE_DATE'
  | 'ALREADY_DONE'
  | 'BACKFILL_NOT_ALLOWED'
  | 'BACKFILL_EXPIRED'
  | 'INSUFFICIENT_EMBER';

/**
 * 错误码 → 中性中文提示。
 *
 * 全部避开禁用词（不说「失败」「惩罚」「必须」），
 * 断签或次数用尽也只描述事实，不评价人。
 */
export const SCORE_ERROR_MESSAGE: Record<ScoreErrorCode, string> = {
  TASK_NOT_FOUND: '这一项找不到了。',
  TASK_DELETED: '这一项已经被移除了。',
  TASK_PAUSED: '这一项正在暂停中。',
  TASK_ARCHIVED: '这一项已经收起来了。',
  FUTURE_DATE: '这一天还没到。',
  ALREADY_DONE: '这一项今天已经记过了。',
  BACKFILL_NOT_ALLOWED: '这一项没有开启补记。',
  BACKFILL_EXPIRED: '这一项的可补记时间已经过去了。',
  INSUFFICIENT_EMBER: '余烬还不太够。',
};

/** 本次实际写入 checkins 的那一行（数值全部固化，以后调平衡不改历史） */
export interface CheckinDraft {
  taskId: string;
  playerId: string;
  localDate: string;
  scoreCount: number;
  occurredAt: number;
  source: ScoreSource;
  /** 标准难度下的基础 XP（未乘任何倍率） */
  baseXp: number;
  xpAwarded: number;
  baseEmber: number;
  emberAwarded: number;
  attrKey: AttributeKey;
  attrXpAwarded: number;
  /** 难度倍率 × 补记比例 */
  multiplier: number;
  /** 1 表示本次被软上限截断过 */
  isCapped: number;
  /** 随机种子串：只决定文案与动画，不影响数值 */
  prngSeed: string;
}

/** 升级信息 */
export interface LevelUpInfo {
  from: number;
  to: number;
  levelsGained: number;
  /** 升级奖励的余烬（每级 10，不占软上限） */
  emberAwarded: number;
}

/** 软上限的明细，给 UI 解释「为什么这次少了一点」 */
export interface CapInfo {
  /** 本次计算用的软上限 */
  xpCap: number;
  emberCap: number;
  /** 本次之前今天已用掉的额度 */
  xpUsedBefore: number;
  emberUsedBefore: number;
  /** 是否被截断 */
  xpCapped: boolean;
  emberCapped: boolean;
}

/** 打卡计算结果（成功） */
export interface ScoreSuccess {
  ok: true;
  checkin: CheckinDraft;
  /** 计算后的玩家快照，repo 层直接写回数据库 */
  player: {
    xpTotal: number;
    level: number;
    xpInLevel: number;
    highestLevel: number;
    ember: number;
    attributes: Record<AttributeKey, AttributeState>;
  };
  levelUp: LevelUpInfo;
  cap: CapInfo;
  /** 本次实际发放量，方便 UI 直接播动画 */
  awarded: { xp: number; ember: number; attrXp: number };
}

/** 打卡计算结果（被拒绝） */
export interface ScoreFailure {
  ok: false;
  code: ScoreErrorCode;
  /** 中性提示，UI 可直接显示 */
  message: string;
}

export type ScoreResult = ScoreSuccess | ScoreFailure;

/** 把 0/1 的开关字段安全转成布尔 */
function flag(value: number | boolean | null | undefined): boolean {
  return value === 1 || value === true;
}

/** 把数值钳到 [min, max] 的整数；NaN 走默认值 */
function clampInt(value: number, min: number, max: number, fallback: number = min): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

/**
 * 按任务类型与重复规则选基础奖励。
 *
 * 「每周 N 次」的习惯单次奖励比每日习惯低一点（25 vs 30），
 * 因为它更灵活，不能让它变成高收益刷分项。
 */
function rewardKeyOf(task: ScorableTask): RewardKey {
  if (task.type === 'todo') return 'todo';
  if (task.type === 'reward') return 'reward';
  return task.recurrence === 'weekly_times' ? 'habit_weekly_times' : 'habit_daily';
}

/**
 * 校验能否打卡。顺序照 docs/04 §5.1，先便宜的后昂贵的。
 *
 * 返回 null 表示可以继续算奖励。
 */
function validate(input: ScoreInput): ScoreErrorCode | null {
  const { task, targetDate, today, nowMs, source } = input;

  // 1. 任务本身状态
  if (task.deletedAt) return 'TASK_DELETED';
  if (task.status === 'paused') return 'TASK_PAUSED';
  if (task.status === 'archived') return 'TASK_ARCHIVED';
  if (task.status === 'done' && task.type !== 'habit') return 'ALREADY_DONE';

  // 2. 未来日期：diffDays(today, targetDate) > 0 表示 target 在 today 之后
  if (diffDays(today, targetDate) > 0) return 'FUTURE_DATE';

  // 3. 当日次数
  const maxPerDay = clampInt(task.maxPerDay, 1, 10, 1);
  if (input.todayCount >= maxPerDay) return 'ALREADY_DONE';

  // 4. 补记：开关 + 窗口（从该业务日结束点开始算小时）
  if (source === 'backfill') {
    if (!flag(task.allowBackfill)) return 'BACKFILL_NOT_ALLOWED';

    const profile = getDifficulty(input.difficulty);
    const dayEndMs = businessDayEndMs(targetDate, input.dayStartHour);
    const hoursSince = (nowMs - dayEndMs) / MS_PER_HOUR;
    // 负值表示这一天还没结束（比如刚过零点补记今天），当然在窗口内
    if (hoursSince > profile.backfillWindowHours) return 'BACKFILL_EXPIRED';
  }

  // 5. 奖励兑换要付余烬（v0.1 仅保留数据路径，界面在 v0.4 才开放）
  if (task.type === 'reward') {
    const cost = clampInt(task.emberCost, 0, Number.MAX_SAFE_INTEGER, 0);
    if (input.player.ember < cost) return 'INSUFFICIENT_EMBER';
  }

  return null;
}

/**
 * 把本次原始奖励按「XP 软额度还剩多少」切成两段，并给属性 XP 同样的待遇。
 *
 * 为什么不给属性单独设一个上限：属性 XP 是跟着 XP 走的（20 属性 XP / 30 XP），
 * 再单独定义一套额度会让两张表互相打架。这里让属性 XP 按 XP 的额度比例切分：
 * 额度内那段 100%，超出那段给 25%。这样「今天做太多了」对三项收益的影响一致。
 *
 * 绝对硬上限（3000 XP/日）不在这里处理：它是一道硬闸，
 * 由调用方在拿到结果后再封顶，避免出现「软上限溢出 25% 把总量顶破 3000」的情况。
 */
function splitByXpQuota(
  rawXp: number,
  rawAttr: number,
  remaining: number
): { xp: number; attr: number; capped: boolean } {
  if (rawXp <= remaining) {
    return { xp: rawXp, attr: rawAttr, capped: false };
  }

  const inQuotaXp = Math.max(0, remaining);
  const overflowXp = rawXp - inQuotaXp;

  // 按 XP 的额度内外比例切属性 XP，向下取整，避免多发
  const inQuotaAttr = rawXp > 0 ? Math.floor((rawAttr * inQuotaXp) / rawXp) : 0;
  const overflowAttr = rawAttr - inQuotaAttr;

  return {
    xp: inQuotaXp + Math.floor(overflowXp * XP_OVERFLOW_RATIO),
    attr: inQuotaAttr + Math.floor(overflowAttr * XP_OVERFLOW_RATIO),
    capped: true,
  };
}

/**
 * 复制一份属性表，保证纯函数不改入参。
 *
 * 直接展开对象是最省事的做法；五维只有 5 个键，开销可以忽略。
 */
function cloneAttributes(
  attrs: Record<AttributeKey, AttributeState>
): Record<AttributeKey, AttributeState> {
  const out = {} as Record<AttributeKey, AttributeState>;
  for (const key of ATTRIBUTE_KEYS) {
    const a = attrs[key];
    out[key] = { xp: a ? a.xp : 0, points: a ? a.points : 0 };
  }
  return out;
}

/**
 * 计算一次打卡的全部结果。纯函数：不读数据库、不写数据库、不改入参。
 *
 * 返回 ScoreResult：
 * - ok: false 时带错误码与中性提示，调用方据此给用户反馈；
 * - ok: true 时带 checkin（要写入的事实行）、player（新快照）、levelUp、cap。
 *
 * 注意：这里不做「任务是否属于该玩家」「任务是否今天排期」的校验——
 * 前者是 repo 层的事（会带 player_id 查询），后者是 recurrence.ts 的事。
 * 这里只关心「这一次打卡该发多少」。
 */
export function computeScore(input: ScoreInput): ScoreResult {
  const error = validate(input);
  if (error) {
    return { ok: false, code: error, message: SCORE_ERROR_MESSAGE[error] };
  }

  const { task, player, targetDate, source } = input;
  // 未知难度回退到轻松档：宁可少发一点，也不要因为脏配置崩溃
  const diff = getDifficulty(input.difficulty);

  // ---------- 1. 基础奖励（标准难度原值） ----------
  const rewardKey = rewardKeyOf(task);
  const base = BASE_REWARD[rewardKey];

  // ---------- 2. 难度倍率 × 补记比例 ----------
  // 顺序不能反：docs 4.2 明确「先乘难度，再乘补记比例」
  const backfillRatio = source === 'backfill' ? diff.backfillRatio : 1;
  const multiplier = diff.rewardMult * backfillRatio;

  const rawXp = Math.round(base.xp * multiplier);
  const rawEmber = Math.round(base.ember * multiplier);
  const rawAttr = Math.round(base.attrXp * multiplier);

  // ---------- 3. 每日软上限 ----------
  // 用「打卡前」的等级算额度：这样升级带来的额度增加从下一次打卡开始生效，
  // 避免一次打卡既拿 XP 又抬高自己的上限。
  const cap = dailyCap(player.level);
  const xpUsedBefore = Math.max(0, Math.floor(input.todayXp || 0));
  const emberUsedBefore = Math.max(0, Math.floor(input.todayEmber || 0));

  // 先按软上限分段（超出部分给 25%），再用绝对硬上限 3000 XP/日 封顶。
  // 硬上限是防刷闸门：到顶之后一点都不给，也不参与 25% 折算。
  const softRemaining = Math.max(0, cap.xp - xpUsedBefore);
  const hardRemaining = Math.max(0, cap.xpHard - xpUsedBefore);

  const softSplit = splitByXpQuota(rawXp, rawAttr, softRemaining);
  const xpAwarded = Math.min(softSplit.xp, hardRemaining);
  // 属性 XP 按 XP 被硬上限削掉的比例同步削减，保持「20 属性 XP / 30 XP」的配比
  const attrXpAwarded =
    softSplit.xp > 0 ? Math.floor((softSplit.attr * xpAwarded) / softSplit.xp) : 0;
  // 软上限或硬上限任意一个削过，都记成「被截断」，UI 据此换成「今天已经很充实了」这类文案
  const xpCapped = softSplit.capped || xpAwarded < softSplit.xp;

  // 余烬：超出部分给 0%，所以 overflowRatio = 0
  const emberAwarded = applySoftCap(rawEmber, emberUsedBefore, cap.ember, 0);

  // ---------- 4. 奖励兑换只消耗，不产出 ----------
  // 奖励类任务（v0.4 商店）走同一条路径：不发 XP，只扣余烬。
  const spendEmber =
    task.type === 'reward' ? clampInt(task.emberCost, 0, Number.MAX_SAFE_INTEGER, 0) : 0;
  const finalXp = task.type === 'reward' ? 0 : xpAwarded;
  const finalAttr = task.type === 'reward' ? 0 : attrXpAwarded;
  const finalEmber = task.type === 'reward' ? 0 : emberAwarded;

  // ---------- 5. 等级与属性 ----------
  const xpTotal = Math.max(0, Math.floor(player.xpTotal || 0) + finalXp);
  const levelInfo = levelFromTotalXp(xpTotal);
  const oldLevel = clampInt(player.level, 1, MAX_LEVEL, 1);
  const levelsGained = Math.max(0, levelInfo.level - oldLevel);
  const levelEmber = levelsGained * LEVEL_UP_EMBER_REWARD;

  // 属性：200 XP 换 1 点，余数保留
  const attributes = cloneAttributes(player.attributes);
  const attrBefore = attributes[task.attribute];
  const growth = growAttribute(attrBefore.xp, attrBefore.points, finalAttr);
  attributes[task.attribute] = { xp: growth.xp, points: growth.points };

  // 余烬结算：先扣兑换成本，再加本次产出，最后加升级奖励（升级奖励不占软上限）
  const ember = Math.max(0, Math.floor(player.ember || 0) - spendEmber + finalEmber + levelEmber);

  // ---------- 6. 组装事实行 ----------
  // 种子只用于文案与动画；这里用打卡前的次数，保证同一天第一次点永远是同一句
  const seed = checkinSeed(player.id, targetDate, task.id, input.todayCount);

  const checkin: CheckinDraft = {
    taskId: task.id,
    playerId: player.id,
    localDate: targetDate,
    scoreCount: input.todayCount,
    occurredAt: input.nowMs,
    source,
    baseXp: base.xp,
    xpAwarded: finalXp,
    baseEmber: base.ember,
    emberAwarded: finalEmber,
    attrKey: task.attribute,
    attrXpAwarded: finalAttr,
    multiplier,
    // 奖励兑换不产出任何东西，不算被截断
    isCapped: task.type === 'reward' ? 0 : xpCapped || emberAwarded < rawEmber ? 1 : 0,
    prngSeed: seed,
  };

  return {
    ok: true,
    checkin,
    player: {
      xpTotal,
      level: levelInfo.level,
      xpInLevel: levelInfo.inLevel,
      highestLevel: Math.max(clampInt(player.highestLevel, 1, MAX_LEVEL, 1), levelInfo.level),
      ember,
      attributes,
    },
    levelUp: {
      from: oldLevel,
      to: levelInfo.level,
      levelsGained,
      emberAwarded: levelEmber,
    },
    cap: {
      xpCap: cap.xp,
      emberCap: cap.ember,
      xpUsedBefore,
      emberUsedBefore,
      xpCapped: xpCapped,
      emberCapped: emberAwarded < rawEmber,
    },
    awarded: { xp: finalXp, ember: finalEmber, attrXp: finalAttr },
  };
}
