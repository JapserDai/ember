/**
 * 惰性日结算。
 *
 * ---- 为什么是「惰性」 ----
 *
 * 这个 App 不联网、不做常驻后台，所以它**不可能知道**用户在哪一刻跨过了日界。
 * 唯一可靠的时机是「用户打开 App 的那一刻」——那就在这里补算。这叫惰性结算。
 *
 * 好处是「一周没打开，数据也不会错」：打开时一次补上。
 * 代价是「当天过完的那一刻不会有任何事发生」——没有推送、没有徽章。
 * 这是可接受的：这个 App 本来就不该在用户不看它的时候发出声音。
 *
 * ---- 结算到底做了什么（v0.2 的诚实版本）----
 *
 * 这里**不惩罚、不扣分、不掉级**。结算只做三件事：
 *
 * 1. 把 `last_settled_date` 推到今天——它是「哪些记录还能撤销」的分界线；
 * 2. 算出「中间断了几段」，把结论交给界面去说一句温和的话；
 * 3. 记录见过的最大时间戳，用来发现系统时间被调回过去。
 *
 * 早先的规划里这里还有「连胜状态机」（宽限券、48h 修复期、断签罚款）。
 * 现在按 D21 不做了：连胜从 `checkins` 现算，事实变了它自己就变，
 * 不需要一个「状态」去维护。所以 `advanceStreak` 这个函数在这里没有出现——
 * 不是漏了，是它要解决的问题已经不存在了。
 *
 * D38 后来把宽限券与修复加了回来，但**不在这里**：它们落在
 * `services/streak.ts`（applyGraceIfNeeded / repairStreak），
 * 而且只存「哪一天被桥接」而不存连胜值。结算与宽恕是两件事：
 * 结算推进时间轴，宽恕修改「哪一天算数」。分开的好处是
 * 关掉宽限券时结算依然正确，反之亦然。
 *
 * ---- 为什么 diff > 1 只结算一天 ----
 *
 * 断签 10 天和断签 1 天，在习惯养成上的实际影响几乎一样（Lally 2010）。
 * 逐日结算只会产生大量无意义的记录，还会让用户觉得自己被「追着罚」。
 * 所以中间隔了多久都只算「昨天这一天」，`gapDays` 如实报出来给界面参考。
 */

import { addDays, diffDays, businessDate, isDateKey } from './date';

/** 结算结论。`reason` 说明「为什么没有真的结算」，界面据此决定要不要说话 */
export type SettleReason = 'settled' | 'first_run' | 'same_day' | 'clock_back';

export interface SettleResult {
  /** 真的推进了 last_settled_date 吗 */
  settled: boolean;
  /** 没推进时的原因；推进时是 settled */
  reason: SettleReason;
  /** 结算的是哪一天（YYYY-MM-DD）。没推进时为 null */
  settledDate: string | null;
  /**
   * 中间空过去的天数。0 表示「昨天结算的是紧邻的那一天」。
   *
   * 注意：这个数字**不参与任何惩罚计算**，只是给界面用来说一句话。
   */
  gapDays: number;
  /** 结算的那一天有没有记录。没有记录时界面可以温和地提一句 */
  hadRecord: boolean;
  /** 结算前的 last_settled_date（用于日志与调试） */
  previousSettledDate: string | null;
  /** 现在的 last_settled_date（结算后应当等于今天的业务日） */
  nextSettledDate: string;
}

/** 结算需要的输入。全部由调用方从 settings 与 checkins 读出，本函数不碰数据库 */
export interface SettleInput {
  /** 当前时间（毫秒） */
  nowMs: number;
  /** 日界小时，0–23 */
  dayStartHour: number;
  /** settings.last_settled_date */
  lastSettledDate: string | null;
  /** 结算目标日（通常是昨天）有没有 active 打卡。只在真要结算时才会被读 */
  hasRecordOn: (localDate: string) => boolean;
}

/**
 * 判断需不需要结算，需要的话结算哪一天。
 *
 * 这是个**纯函数**：不读库、不写库、不读系统时间。所有输入都从参数进来。
 * 分开的理由和 domain 其它文件一样——规则要能脱离数据库单独验，
 * 而「写回 settings」只有一行，留在 services 里更好读。
 *
 * 返回 `settled: false` 时，调用方**不要**写库（除了 `maxSeenUtc`，见 services/settle.ts）。
 */
export function planSettlement(input: SettleInput): SettleResult {
  const rawToday = businessDate(input.nowMs, input.dayStartHour);
  const previous = input.lastSettledDate;

  // ---------- 1. 首次启动：只记下今天，不补算任何历史 ----------
  //
  // 「补算历史」在这里没有意义：结算不惩罚，补算只会写一堆空记录。
  // 而且新用户第一次打开时，历史上本来就不该有任何数据。
  if (!previous || !isDateKey(previous)) {
    return {
      settled: false,
      reason: 'first_run',
      settledDate: null,
      gapDays: 0,
      hadRecord: false,
      previousSettledDate: previous,
      nextSettledDate: rawToday,
    };
  }

  // ---------- 2. 时钟回拨：业务日不倒退 ----------
  //
  // diffDays(previous, rawToday) < 0 表示 rawToday 比 previous 更早，
  // 也就是系统时间被调回了过去（或者跨时区飞到了更早的一天）。
  // 不结算、不惩罚，只是**不推进**——把 lastSettledDate 原样留着。
  //
  // 为什么不用 max_seen_utc 判断：那个字段记的是毫秒时间戳，
  // 只能说明「见过更大的数」，不能说明「业务日退了一天」。
  // 业务日的事交给业务日的函数判断。
  if (diffDays(previous, rawToday) < 0) {
    return {
      settled: false,
      reason: 'clock_back',
      settledDate: null,
      gapDays: 0,
      hadRecord: false,
      previousSettledDate: previous,
      nextSettledDate: previous,
    };
  }

  // ---------- 3. 今天已经处理过 ----------
  if (previous === rawToday) {
    return {
      settled: false,
      reason: 'same_day',
      settledDate: null,
      gapDays: 0,
      hadRecord: false,
      previousSettledDate: previous,
      nextSettledDate: rawToday,
    };
  }

  // ---------- 4. 结算昨天（无论中间隔了几天，都只算一天）----------
  const target = addDays(rawToday, -1);
  const gap = Math.max(0, diffDays(previous, rawToday) - 1);

  return {
    settled: true,
    reason: 'settled',
    settledDate: target,
    gapDays: gap,
    hadRecord: input.hasRecordOn(target),
    previousSettledDate: previous,
    nextSettledDate: rawToday,
  };
}

/**
 * 结算后人话。
 *
 * 三条规则（docs/02 §8、§2.4）：
 * - 不出现「失败 / 惩罚 / 归零 / 前功尽弃」；
 * - 没有记录的那一天**不指责**，只说事实，并把注意力放到今天；
 * - 隔了很多天回来时，不提「你多久没来了」——那是账，不是关心。
 *
 * 返回 null 表示「不需要说什么」（正常的一天、首次启动、同一天）。
 */
export function settlementMessage(result: SettleResult): string | null {
  if (!result.settled) return null;

  if (result.hadRecord) {
    // 昨天记过：什么都不用说。界面自己会显示连胜
    return null;
  }

  if (result.gapDays >= 7) {
    return '回来就好。今天想从哪一件小事开始？';
  }

  if (result.gapDays > 0) {
    return '中间空了一阵子。今天还是这个时候，坐下来就好。';
  }

  return '昨天空了一天。习惯不会因为一天就消失，今天想从哪一件小事重新开始？';
}
