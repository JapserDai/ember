/**
 * 连胜状态机
 *
 * v0.1 只做最简版：
 * - 每个业务日结算时，看昨天有没有记录；
 * - 有记录 → 连续天数 +1；
 * - 没记录 → 当前连胜回到 0，但「历史最佳」和「累计记录天数」一律保留。
 *
 * 三态（normal / repairable / broken）、宽限券、付费修复属于 v0.2，
 * 这里先把状态结构与接口定下来，v0.2 只需补上 advanceStreak 的分支，
 * 不需要改数据库字段或调用方签名。
 *
 * 展示原则（docs 04 §7.4）：断签后界面必须同时显示
 * 「当前连胜 0 / 历史最佳 23 天 / 累计记录 147 天」。
 * 这三个数并排，用户看到的是「我做过很多」，而不是「我失败了」。
 *
 * 本文件是纯函数：不 import React、不碰数据库、不读系统时间。
 */

import { addDays, diffDays, isDateKey } from './date';

/** 连胜三态。v0.1 只会产生 normal / broken，repairable 留给 v0.2 */
export type StreakStatus = 'normal' | 'repairable' | 'broken';

/**
 * 连胜状态快照。
 *
 * 字段与 docs 04 §7.1 的 player 表新增列一一对应，
 * 这样 v0.2 加列时 repo 层直接映射，不用重新设计结构。
 */
export interface StreakState {
  /** 当前状态 */
  status: StreakStatus;
  /** 当前连续天数。断签后为 0 */
  current: number;
  /** 历史最佳连续天数。永不回落 */
  best: number;
  /** 累计「有记录」的业务日总数。永不回落 */
  totalDays: number;
  /** 最近一次有记录的业务日 */
  lastSuccessDate: string | null;
  /** 最近一次结算过的业务日，用于保证同一天重复结算不会重复计数 */
  lastSettledDate: string | null;
  /** 断签发生的业务日（仅 repairable / broken 时有值） */
  breakDate: string | null;
  /** 修复截止的真实时间戳（毫秒）；v0.2 用，v0.1 恒为 null */
  repairDeadlineMs: number | null;
  /** 断签时冻结的连胜值，修复成功后从这里继续；v0.2 用 */
  frozenCurrent: number;
  /** 本月剩余宽限券 */
  graceRemaining: number;
  /** 宽限券所属月份 "YYYY-MM"；跨月时重置 */
  graceMonth: string | null;
  /** 连胜纪元：每次断签后 +1，用于「同一纪元同一阈值只发一次奖励」去重 */
  epoch: number;
}

/** 新玩家的初始连胜状态 */
export function createStreakState(gracePerMonth: number): StreakState {
  return {
    status: 'normal',
    current: 0,
    best: 0,
    totalDays: 0,
    lastSuccessDate: null,
    lastSettledDate: null,
    breakDate: null,
    repairDeadlineMs: null,
    frozenCurrent: 0,
    graceRemaining: Math.max(0, Math.floor(gracePerMonth)),
    graceMonth: null,
    epoch: 1,
  };
}

/**
 * 结算一个业务日的输入。
 *
 * 只传事实：那天有没有记录、那天是哪天。
 * 「有没有记录」由调用方用一条 count 查询得出（status='active' 的 checkin 数 > 0）。
 */
export interface StreakSettleInput {
  /** 正在结算的业务日（通常是「昨天」） */
  settledDate: string;
  /** 该业务日是否有有效打卡记录 */
  hadRecord: boolean;
  /** 该月第一天的月份键 "YYYY-MM"，用于宽限券按月重置 */
  currentMonth?: string;
  /** 每月宽限次数（来自难度配置）；v0.1 只记录不使用 */
  gracePerMonth?: number;
}

/** 结算结果：新状态 + 本次发生了什么 */
export interface StreakSettleResult {
  state: StreakState;
  /** 本次结算是否被跳过（重复结算 / 非法日期） */
  skipped: boolean;
  /** 跳过原因 */
  skipReason?: 'invalid_date' | 'already_settled';
  /** 本次是否延续了连胜（连续天数 +1） */
  extended: boolean;
  /** 本次是否发生断签（当前连胜回到 0） */
  broke: boolean;
  /** 本次是否刷新了历史最佳 */
  newBest: boolean;
}

/**
 * 结算一个业务日的连胜。
 *
 * v0.1 规则（刻意简单，先让主流程跑通）：
 * 1. settledDate 不合法 → 跳过，不动状态；
 * 2. settledDate 已经结算过（或更早）→ 跳过，保证幂等；
 * 3. 有记录：
 *    - 上一次有记录正好是前一天 → current + 1；
 *    - 否则（首次记录 / 中间有缺口）→ current = 1，开启新的一段；
 *    - totalDays + 1，best 取最大值；
 * 4. 没记录：
 *    - current 归 0，status 变 broken，breakDate 记下这天；
 *    - frozenCurrent 保存断签前的值（v0.2 修复用）；
 *    - best / totalDays 原样保留——这是「永不惩罚」原则的落点。
 *
 * 注意：v0.1 不用宽限券，也不进入 repairable。
 * v0.2 只需在「没记录」分支前插入「有宽限券 → 桥接」判断，函数签名不变。
 */
export function advanceStreak(
  state: StreakState,
  input: StreakSettleInput
): StreakSettleResult {
  const unchanged = (skipReason: 'invalid_date' | 'already_settled'): StreakSettleResult => ({
    state,
    skipped: true,
    skipReason,
    extended: false,
    broke: false,
    newBest: false,
  });

  if (!isDateKey(input.settledDate)) return unchanged('invalid_date');

  // 幂等：同一业务日重复结算不产生任何变化；
  // settledDate 早于已结算日说明时钟回拨，也一律跳过（业务日只能前进）
  if (state.lastSettledDate && diffDays(state.lastSettledDate, input.settledDate) <= 0) {
    return unchanged('already_settled');
  }

  // 宽限券按月重置：只更新计数，v0.1 不消费它
  const gracePerMonth = Math.max(0, Math.floor(input.gracePerMonth ?? state.graceRemaining));
  let graceRemaining = state.graceRemaining;
  let graceMonth = state.graceMonth;
  if (input.currentMonth && input.currentMonth !== state.graceMonth) {
    graceRemaining = gracePerMonth;
    graceMonth = input.currentMonth;
  }

  if (input.hadRecord) {
    // 连续 = 上一次有记录就是昨天；否则从 1 重新开始（不叫「中断」，只记录事实）
    const continues = state.lastSuccessDate === addDays(input.settledDate, -1);
    const nextCurrent = continues ? state.current + 1 : 1;
    const newBest = nextCurrent > state.best;

    const next: StreakState = {
      ...state,
      status: 'normal',
      current: nextCurrent,
      best: newBest ? nextCurrent : state.best,
      totalDays: state.totalDays + 1,
      lastSuccessDate: input.settledDate,
      lastSettledDate: input.settledDate,
      // 有记录就清掉断签标记；epoch 不变（修复/续上都不换纪元）
      breakDate: null,
      repairDeadlineMs: null,
      frozenCurrent: 0,
      graceRemaining,
      graceMonth,
    };

    return {
      state: next,
      skipped: false,
      extended: continues,
      broke: false,
      newBest,
    };
  }

  // 没有记录：当前连胜回到 0，其余全部保留
  const next: StreakState = {
    ...state,
    status: 'broken',
    current: 0,
    best: state.best, // 历史最佳不回落
    totalDays: state.totalDays, // 累计记录天数不回落
    lastSettledDate: input.settledDate,
    breakDate: input.settledDate,
    frozenCurrent: state.current, // 冻结，供 v0.2 修复使用
    epoch: state.epoch + 1, // 新纪元：旧纪元的阈值奖励不再重复发
    graceRemaining,
    graceMonth,
  };

  return {
    state: next,
    skipped: false,
    extended: false,
    broke: state.current > 0,
    newBest: false,
  };
}

/**
 * 展示用的三个数字（docs 04 §7.4）。
 *
 * 断签时 current 为 0，但 best 与 totalDays 仍然是非零的真实数字。
 * UI 必须三个一起显示，不能只显示 current——只显示 0 会变成羞辱。
 */
export interface StreakDisplay {
  current: number;
  best: number;
  totalDays: number;
}

/** 从状态里取出展示三元组。纯取值，方便 UI 层直接渲染 */
export function toStreakDisplay(state: StreakState): StreakDisplay {
  return {
    current: Math.max(0, state.current),
    best: Math.max(0, state.best),
    totalDays: Math.max(0, state.totalDays),
  };
}

/**
 * 连胜里程碑阈值（docs 04 §4.2）：7 天 / 30 天 / 100 天。
 *
 * 奖励在 v0.2 启用；这里先给出常量与判断函数，
 * 让 v0.2 只改「发放」部分，不用重新定义阈值。
 */
export const STREAK_MILESTONES = [7, 30, 100] as const;

/**
 * 本次结算是否刚好跨过某个里程碑。
 *
 * 只在「本次让 current 增加了」时判定，避免修复后重复触发。
 * 去重键 = epoch + 阈值，由调用方在发放时记录。
 */
export function milestoneCrossed(previousCurrent: number, current: number): number | null {
  for (const m of STREAK_MILESTONES) {
    if (previousCurrent < m && current >= m) return m;
  }
  return null;
}

/**
 * v0.2 接口占位：修复连胜。
 *
 * v0.1 不实现（没有 repairable 状态，也没有余烬修复入口）。
 * 先把签名固定下来，v0.2 实现时调用方不需要改。
 *
 * 语义（v0.2）：
 * - 只有 status === 'repairable' 且未过 repairDeadlineMs 才能修复；
 * - 成本来自 DIFFICULTY[difficulty].repairEmber / repairMaterial；
 * - 修复后 current = frozenCurrent + 断签后连续成功天数，epoch 不变。
 */
export interface StreakRepairInput {
  state: StreakState;
  /** 当前真实时间戳，用于判断修复期限 */
  nowMs: number;
  /** 玩家当前余烬 */
  ember: number;
  /** 玩家当前材料 */
  material: number;
  /** 修复消耗 */
  repairEmber: number;
  repairMaterial: number;
  /** 断签之后已经连续记录的天数 */
  daysAfterBreak: number;
}

/** 修复结果：v0.1 恒为未开放 */
export interface StreakRepairResult {
  ok: boolean;
  reason: 'ok' | 'not_repairable' | 'deadline_passed' | 'insufficient_ember' | 'not_available_in_v01';
  state: StreakState;
  ember: number;
  material: number;
}

/**
 * 修复连胜（v0.1 未开放）。
 *
 * 刻意返回 not_available_in_v01 而不是抛错：
 * 界面上的修复入口在 v0.2 才出现，这里保持纯函数、可安全调用。
 */
export function repairStreak(input: StreakRepairInput): StreakRepairResult {
  // v0.1 只回显入参，不做任何状态变更
  return {
    ok: false,
    reason: 'not_available_in_v01',
    state: input.state,
    ember: input.ember,
    material: input.material,
  };
}
