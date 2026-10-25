/**
 * 连胜的宽限券与修复（D38）。
 *
 * ---- 这一层负责什么 ----
 *
 * 规则在 `domain/streak.ts`（纯函数：找缺口、判断能不能修、算期限）。
 * 这里只做编排：
 *
 *   读设置与玩家 → 问 domain 缺口在哪 → 扣钱 → 写桥接行 → 回报结果
 *
 * 全部写操作在同一个事务里：**扣了余烬却没写桥接行**，等于白扣一次钱；
 * 反过来则是白送一次修复。两种都不能接受。
 *
 * ---- 为什么修复要一次补整段缺口 ----
 *
 * 断签 5 天，用户看到的是一条「有一段空档」。如果修复只能补 1 天，
 * 那第 2 天到第 5 天仍然是空的，连胜照样断——用户花了钱却什么都没修好。
 * 所以一次修复覆盖 `gapDates` 里的每一天（docs/04 §7.3）。
 *
 * ---- 宽限券为什么是「自动」的 ----
 *
 * 轻松档每月 3 张。如果要求用户手动点「用一张券」，那它就变成了
 * 「一个需要你记得去用的东西」，而断签往往发生在最没空的时候。
 * 所以结算时自动桥接，**并且告诉用户**（docs/05「静默生效并告知」）。
 *
 * 这一版把「自动」落在打开 App 的那一刻（惰性结算，与 `services/settle.ts` 同一个时机）：
 * 我们不可能在用户不打开 App 时知道他断签了。
 */
import { runInTransaction } from '../db/client';
import { getPlayerSnapshot, updatePlayer } from '../db/repo/player';
import { getSettings } from '../db/repo/settings';
import {
  getBridge,
  insertRepairGap,
  listBridgeDays,
  listGraceDates,
  upsertBridge,
} from '../db/repo/streak';
import { listActiveCheckinDates } from '../db/repo/checkins';
import { DIFFICULTY, getDifficulty } from '../domain/balance';
import { addDays, businessDayEndMs, effectiveToday } from '../domain/date';
import {
  checkRepairableGap,
  graceRemaining,
  monthKeyOf,
  type BridgeDay,
  type GapCheck,
} from '../domain/streak';

/** 修复的结果 */
export type RepairOutcome =
  | {
      ok: true;
      /** 补掉了几天 */
      daysRepaired: number;
      /** 实际花掉的 */
      cost: { ember: number; material: number };
      /** 修复之后的余烬，界面可以直接显示新值 */
      ember: number;
      /** 一句可以直接给用户看的话 */
      message: string;
    }
  | {
      ok: false;
      reason: GapCheck['reason'];
      /** 一句中性的话。说清事实，不说「失败」 */
      message: string;
      /** 差多少（余烬/材料），界面可以提示「还差 X」 */
      shortfall?: { ember: number; material: number };
    };

/** 不能修时的一句话。全部避开禁用词表 */
const REPAIR_MESSAGE: Record<Exclude<GapCheck['reason'], 'ok'>, string> = {
  nothing_to_repair: '这一段连着，没有要修的地方。',
  deadline_passed: '这一段的修复时间已经过去了。连胜从这里重新数也可以，历史都还在。',
  insufficient_ember: '余烬还不够买这一次修复。',
  insufficient_material: '材料还不够买这一次修复。',
};

/**
 * 读出当前的缺口，并判断能不能修。
 *
 * 界面用它决定「要不要显示修复入口」与「显示什么价」。
 * 它**不写库**，可以随便调（比如每次进「我的」页）。
 */
export function getRepairStatus(nowMs: number = Date.now()): GapCheck {
  const settings = getSettings();
  const { today } = effectiveToday(nowMs, settings.day_start_hour, settings.last_settled_date);
  const player = getPlayerSnapshot();

  const pairs = listActiveCheckinDates(today);
  const validDates = pairs.map((pair) => pair.localDate);

  let bridges: BridgeDay[] = [];
  try {
    bridges = listBridgeDays();
  } catch (err) {
    console.warn('[Ember] 读取桥接日失败，本次按没有桥接计算', err);
  }
  for (const bridge of bridges) validDates.push(bridge.date);

  const profile = getDifficulty(settings.difficulty);

  return checkRepairableGap({
    today,
    validDates,
    ember: player.ember,
    material: player.material,
    repairEmber: profile.repairEmber,
    repairMaterial: profile.repairMaterial,
    nowMs,
    dayStartHour: settings.day_start_hour,
    // domain 不读系统时间，也不该读本地时区，所以把「某天几点结束」这个函数传进去
    dayEndMs: (dateKey) => businessDayEndMs(dateKey, settings.day_start_hour),
  });
}

/**
 * 花钱修复当前的断签缺口。
 *
 * 顺序很重要：**先算清楚再动手**。缺口、成本、余额都在写库之前算完，
 * 任何一项不满足就什么都不写（事务里空提交）。
 *
 * 扣钱与写桥接行在同一个事务里：只扣钱不写行，用户花了钱连胜还是断的；
 * 只写行不扣钱，等于免费修复，而且下次还能再修一次。
 */
export function repairStreak(nowMs: number = Date.now()): RepairOutcome {
  return runInTransaction(() => {
    const status = getRepairStatus(nowMs);

    if (!status.broken) {
      return {
        ok: false as const,
        reason: 'nothing_to_repair' as const,
        message: REPAIR_MESSAGE.nothing_to_repair,
      };
    }

    if (!status.repairable) {
      // 差多少钱要说清楚：只说「不够」等于让用户自己猜
      if (status.reason === 'insufficient_ember' || status.reason === 'insufficient_material') {
        const player = getPlayerSnapshot();
        return {
          ok: false as const,
          reason: status.reason,
          message: REPAIR_MESSAGE[status.reason],
          shortfall: {
            ember: Math.max(0, status.cost.ember - player.ember),
            material: Math.max(0, status.cost.material - player.material),
          },
        };
      }
      return {
        ok: false as const,
        reason: status.reason,
        message: REPAIR_MESSAGE[status.reason],
      };
    }

    // ---------- 扣钱 ----------
    const player = getPlayerSnapshot();
    const emberAfter = Math.max(0, player.ember - status.cost.ember);
    const materialAfter = Math.max(0, player.material - status.cost.material);

    updatePlayer({
      ember: emberAfter,
      // 材料在 v0.4 之前没有别的来源，但它是真实存在的余额，照实扣
      material: materialAfter,
    });

    // ---------- 写桥接行 ----------
    const days = insertRepairGap(status.gapDates, status.cost);

    return {
      ok: true as const,
      daysRepaired: days,
      cost: status.cost,
      ember: emberAfter,
      message:
        days > 1
          ? `修好了。这 ${days} 天算作连着，连胜接上了。`
          : '修好了。这一段接上了。',
    };
  });
}

/**
 * 惰性补宽限券。
 *
 * ---- 什么时候跑 ----
 *
 * 与 `settleUpTo()` 同一个时机（App 冷启动、导入之后）：那是我们唯一
 * 确定「用户现在打开了 App」的时刻。不打开就不知道他断签了，也就无从宽限。
 *
 * ---- 它做什么 ----
 *
 * 如果昨天没有算数的日子（既没打卡、也没被桥接），而本月还有宽限券，
 * 就自动把昨天桥接掉，并返回一句话让界面去说。
 *
 * **只补一天**（昨天）：宽限券是「一券桥接一天」，不是「一券跳过一整段空档」。
 * 空档中间那几天仍然没有算数的日子，连胜在那里确实断了——
 * 这是有意的：宽限券的作用是「偶尔漏一天不至于前功尽弃」，
 * 而不是「休假两周也当没事发生」。
 *
 * ---- 为什么返回一句话而不是静默 ----
 *
 * docs/05 写的是「静默生效并告知」。用户需要知道「昨天那张券被用掉了」，
 * 否则他会以为券还在，月底想用的时候发现没了。
 */
export interface GraceOutcome {
  /** 这一次有没有真的用掉一张券 */
  used: boolean;
  /** 被桥接的那一天 */
  date: string | null;
  /** 本月还剩几张（用完之后的数） */
  remaining: number;
  /** 给界面的一句话。null 表示不需要说什么 */
  message: string | null;
}

export function applyGraceIfNeeded(nowMs: number = Date.now()): GraceOutcome {
  try {
    return runInTransaction(() => {
      const settings = getSettings();
      const { today } = effectiveToday(
        nowMs,
        settings.day_start_hour,
        settings.last_settled_date
      );

      const profile = getDifficulty(settings.difficulty);
      const month = monthKeyOf(today);

      // 本月已经用掉的券
      let graceDates: string[] = [];
      try {
        graceDates = listGraceDates();
      } catch (err) {
        console.warn('[Ember] 读取宽限券使用记录失败，本次不补', err);
        return { used: false, date: null, remaining: 0, message: null };
      }

      const remainingBefore = graceRemaining(month, graceDates, profile.gracePerMonth);

      // 硬核档是 0 张：直接返回，连库都不用再读
      if (profile.gracePerMonth <= 0 || remainingBefore <= 0) {
        return { used: false, date: null, remaining: remainingBefore, message: null };
      }

      const yesterday = addDays(today, -1);

      // 昨天已经有桥接记录（被宽限或修复过）→ 什么都不做
      if (getBridge(yesterday)) {
        return { used: false, date: null, remaining: remainingBefore, message: null };
      }

      // 昨天有打卡 → 没断，不用券
      const pairs = listActiveCheckinDates(today);
      if (pairs.some((pair) => pair.localDate === yesterday)) {
        return { used: false, date: null, remaining: remainingBefore, message: null };
      }

      /*
       * 走到这里：昨天既没打卡也没被桥接。
       *
       * 但还有一个前提没查：**用户之前到底有没有开始过**。
       * 一个从没打过卡的新用户，昨天「没有记录」是正常的，
       * 不该在第二天就吃掉一张券——那会让「本月还剩 3 张」在第一次打开时
       * 就变成 2 张，而用户什么都没做。
       *
       * 判断方式：只要历史上有过任何一次打卡，就认为他「已经开始了」。
       */
      if (pairs.length === 0) {
        return { used: false, date: null, remaining: remainingBefore, message: null };
      }

      // ---------- 用掉一张 ----------
      upsertBridge({ localDate: yesterday, kind: 'grace' });

      const remainingAfter = remainingBefore - 1;

      return {
        used: true,
        date: yesterday,
        remaining: remainingAfter,
        message:
          remainingAfter > 0
            ? `昨天空着，自动用了一张宽限券。这个月还剩 ${remainingAfter} 张。`
            : '昨天空着，自动用了一张宽限券。这个月的券用完了，连胜接上了。',
      };
    });
  } catch (err) {
    console.warn('[Ember] 补宽限券失败，本次跳过', err);
    return { used: false, date: null, remaining: 0, message: null };
  }
}

/**
 * 本月宽限券还剩几张。设置页与「我的」页显示用。
 *
 * 读失败时返回 0 而不是抛错：这是一个展示用的数字，
 * 读不出来就说「没有」比整页崩掉好。
 */
export function getGraceRemaining(nowMs: number = Date.now()): {
  remaining: number;
  total: number;
} {
  try {
    const settings = getSettings();
    const { today } = effectiveToday(
      nowMs,
      settings.day_start_hour,
      settings.last_settled_date
    );
    const profile = getDifficulty(settings.difficulty);
    const used = listGraceDates();
    return {
      remaining: graceRemaining(monthKeyOf(today), used, profile.gracePerMonth),
      total: profile.gracePerMonth,
    };
  } catch (err) {
    console.warn('[Ember] 读取宽限券失败', err);
    return { remaining: 0, total: DIFFICULTY.easy.gracePerMonth };
  }
}
