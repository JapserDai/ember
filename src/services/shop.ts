/**
 * 商店与材料合成（阶段 4 第 5、6 条）的编排层。
 *
 * 规则在 `domain/shop.ts`（商品、价格、配方、买完剩多少）。
 * 这里负责：读余额 → 检查 → 写库（事务）→ 回报。
 *
 * ---- 为什么全部包在事务里 ----
 *
 * 购买是「扣余烬 + 加材料」两件事。只扣不加是白花；只加不扣是白拿。
 * 与打卡、修复同一条规矩。
 *
 * ---- 为什么不做订单表 ----
 *
 * 这一版的商店没有退款、没有限购、没有有效期，所以订单表只会是一份
 * 「买了什么」的日志。而这份日志的价值全部在**当下**：用户买完就看到
 * 材料多了。等阶段 5 有了活动与限定，那时再开表（要记的是「哪一次活动掉的」，
 * 那是另一套字段）。
 */
import { runInTransaction } from '../db/client';
import { getPlayerSnapshot, updatePlayer } from '../db/repo/player';
import { createTask, listRewards, updateTaskStatus, type Task } from '../db/repo/tasks';
import {
  applyPurchase,
  applyRefine,
  checkPurchase,
  checkRefine,
  checkRedeem,
  checkRewardDraft,
  getShopItem,
  REFINE_RECIPE,
  type ShopBalances,
  type ShopItem,
} from '../domain/shop';

/** 购买结果 */
export type BuyResult =
  | {
      ok: true;
      item: ShopItem;
      /** 买完之后的余额 */
      ember: number;
      material: number;
      refinedMaterial: number;
      graceTickets: number;
      streakShields: number;
      restoreTokens: number;
      message: string;
    }
  | {
      ok: false;
      reason: 'UNKNOWN_ITEM' | 'INSUFFICIENT_EMBER' | 'AT_CAP' | 'FAILED';
      /** 还差多少余烬（只有 INSUFFICIENT_EMBER 时有意义） */
      shortfall: number;
      message: string;
    };

/** 合成结果 */
export type RefineResult =
  | {
      ok: true;
      /** 这一次合成了几个 */
      times: number;
      material: number;
      refinedMaterial: number;
      message: string;
    }
  | { ok: false; reason: 'INSUFFICIENT_MATERIAL' | 'FAILED'; shortfall: number; message: string };

/**
 * 买一件东西。
 *
 * 顺序：先算清楚（够不够钱、商品在不在）→ 再写库。
 * 检查不通过时事务里什么都不写（空提交）。
 */
export function buyItem(itemId: string): BuyResult {
  return runInTransaction(() => {
    const player = getPlayerSnapshot();
    const balances: ShopBalances = {
      ember: player.ember,
      material: player.material,
      refinedMaterial: player.refinedMaterial,
      graceTickets: player.graceTickets,
      streakShields: player.streakShields,
      restoreTokens: player.restoreTokens,
    };
    const check = checkPurchase(itemId, balances);

    if (!check.ok) {
      if (check.reason === 'UNKNOWN_ITEM') {
        return {
          ok: false as const,
          reason: 'UNKNOWN_ITEM' as const,
          shortfall: 0,
          message: '没有这件东西。',
        };
      }
      if (check.reason === 'AT_CAP') {
        return {
          ok: false as const,
          reason: 'AT_CAP' as const,
          shortfall: check.shortfall,
          message: `最多只能持有 ${check.shortfall} 张了——先用掉一些再来。`,
        };
      }
      return {
        ok: false as const,
        reason: 'INSUFFICIENT_EMBER' as const,
        shortfall: check.shortfall,
        message: `余烬还差 ${check.shortfall}。`,
      };
    }

    const item = getShopItem(itemId);
    if (!item) {
      return {
        ok: false as const,
        reason: 'UNKNOWN_ITEM' as const,
        shortfall: 0,
        message: '没有这件东西。',
      };
    }

    const next = applyPurchase(item, balances);

    updatePlayer({
      ember: next.ember,
      material: next.material,
      refinedMaterial: next.refinedMaterial,
      graceTickets: next.graceTickets,
      streakShields: next.streakShields,
      restoreTokens: next.restoreTokens,
    });

    return {
      ok: true as const,
      item,
      ember: next.ember,
      material: next.material,
      refinedMaterial: next.refinedMaterial,
      graceTickets: next.graceTickets,
      streakShields: next.streakShields,
      restoreTokens: next.restoreTokens,
      message: `换到了${item.name}。`,
    };
  });
}

/**
 * 合成：3 个普通材料 → 1 个精炼材料。
 *
 * 不看余烬：合成是材料的转换，不是消费。
 */
export function refineMaterial(): RefineResult {
  return runInTransaction(() => {
    const player = getPlayerSnapshot();
    const check = checkRefine(player.material);

    if (!check.ok) {
      return {
        ok: false as const,
        reason: 'INSUFFICIENT_MATERIAL' as const,
        shortfall: check.shortfall,
        message: `材料还差 ${check.shortfall} 个。`,
      };
    }

    // 一次合到底：攒了 9 个材料不该点三次（同一次动作、同一句提示）
    const next = applyRefine(
      { material: player.material, refinedMaterial: player.refinedMaterial },
      check.times
    );

    updatePlayer({
      material: next.material,
      refinedMaterial: next.refinedMaterial,
    });

    return {
      ok: true as const,
      material: next.material,
      refinedMaterial: next.refinedMaterial,
      times: check.times,
      message:
        check.times === 1
          ? `合成了 1 个精炼材料（用了 ${REFINE_RECIPE.input} 个材料）。`
          : `合成了 ${check.times} 个精炼材料（用了 ${REFINE_RECIPE.input * check.times} 个材料）。`,
    };
  });
}

/** 商店页要的余额。类型在 domain（纯数据的形状归 domain），这里只重导出方便界面引用 */
export type { ShopBalances };

/**
 * 读余额。
 *
 * 读失败时返回全 0 而不是抛错：这一页的每个按钮都会自己再检查一次余额，
 * 而「显示 0」至少不会让用户点下一个买不起的东西。
 */
export function getShopBalances(): ShopBalances {
  try {
    const player = getPlayerSnapshot();
    return {
      ember: player.ember,
      material: player.material,
      refinedMaterial: player.refinedMaterial,
      graceTickets: player.graceTickets,
      streakShields: player.streakShields,
      restoreTokens: player.restoreTokens,
    };
  } catch (err) {
    console.warn('[Ember] 读取余额失败', err);
    return {
      ember: 0,
      material: 0,
      refinedMaterial: 0,
      graceTickets: 0,
      streakShields: 0,
      restoreTokens: 0,
    };
  }
}

// ---------------------------------------------------------------
// 自定义奖励（D53：docs/01 采纳人升的那一条，界面终于接上）
// ---------------------------------------------------------------

/**
 * 用户自己写的奖励。
 *
 * 数据层一直有（`tasks.type = 'reward'` + `ember_cost`），
 * `score.ts` 也早就会扣余烬，只是从来没有界面能创建与兑换。
 *
 * ---- 为什么兑换走打卡那条路，而不是直接扣钱 ----
 *
 * 兑换 = 写一条 `checkins` 行（`score.ts` 里 reward 类型：0 XP、0 余烬、
 * 0 属性，只扣 `ember_cost`）+ 把任务置为 done。
 * 走同一条路的好处：
 *   1. **撤销天然可用**——虽然 `undoCheckin` 对 reward 返回 UNSUPPORTED，
 *      但事实行在，以后要支持退还只是补一段逻辑，不用改数据结构；
 *   2. 月度奖励、统计、导出都已经在数 checkins，兑换不需要另开一条链路；
 *      而「奖励兑换」在统计里显示成一次记录，也是对的（它是你做过的事）。
 *
 * ---- 为什么不给奖励加次数上限 ----
 *
 * 奖励是用户自己定价的。如果他自己不想多兑，就不该由我们拦——
 * 拦下来就变成了「App 在教育他怎么花自己的余烬」。
 */
export interface CustomReward {
  id: string;
  title: string;
  /** 标价（余烬） */
  emberCost: number;
}

/** 列出全部自定义奖励（未完成、未归档的） */
export function listCustomRewards(): CustomReward[] {
  try {
    return listRewards().map((task: Task) => ({
      id: task.id,
      title: task.title,
      emberCost: task.emberCost,
    }));
  } catch (err) {
    console.warn('[Ember] 读取奖励失败', err);
    return [];
  }
}

/** 新建一条自定义奖励的结果 */
export type CreateRewardResult =
  | { ok: true; reward: CustomReward; message: string }
  | { ok: false; reason: 'EMPTY_TITLE' | 'TITLE_TOO_LONG' | 'BAD_COST' | 'FAILED'; message: string };

/**
 * 新建一条自定义奖励。
 *
 * 校验在 `domain/shop.ts` 的 `checkRewardDraft`（纯函数），这里只写库。
 */
export function createCustomReward(draft: {
  title: string;
  emberCost: number;
  todayKey: string;
}): CreateRewardResult {
  const check = checkRewardDraft({ title: draft.title, emberCost: draft.emberCost });
  if (!check.ok) {
    const message =
      check.reason === 'EMPTY_TITLE'
        ? '给它起个名字吧。'
        : check.reason === 'TITLE_TOO_LONG'
          ? '名字短一点，40 字以内。'
          : '标价要在 1 到 99999 之间。';
    return { ok: false, reason: check.reason, message };
  }

  try {
    const task = createTask({
      type: 'reward',
      title: check.value.title,
      attribute: 'spirit',
      startDate: draft.todayKey,
      emberCost: check.value.emberCost,
    });
    return {
      ok: true,
      reward: { id: task.id, title: task.title, emberCost: task.emberCost },
      message: `加上了「${task.title}」。`,
    };
  } catch (err) {
    console.warn('[Ember] 新建奖励失败', err);
    return { ok: false, reason: 'FAILED', message: '刚才没加上，再试一次。' };
  }
}

/**
 * 兑换一条奖励：扣余烬 + 把它标记为完成。
 *
 * 只做这两件事，不写 checkins 行——理由见本段开头的注释：
 * 这一版没有「退还」，写事实行只会多一条要维护的记录。
 * 等要做退还时，那时再补。
 */
export type RedeemResult =
  | { ok: true; ember: number; message: string }
  | { ok: false; reason: 'INSUFFICIENT_EMBER' | 'NOT_FOUND' | 'FAILED'; message: string };

export function redeemCustomReward(rewardId: string, emberCost: number): RedeemResult {
  return runInTransaction(() => {
    const player = getPlayerSnapshot();
    const check = checkRedeem(emberCost, player.ember);
    if (!check.ok) {
      return {
        ok: false as const,
        reason: 'INSUFFICIENT_EMBER' as const,
        message: `余烬还差 ${check.shortfall}。`,
      };
    }

    try {
      const nextEmber = Math.max(0, Math.floor(player.ember) - Math.floor(emberCost));
      updatePlayer({ ember: nextEmber });
      updateTaskStatus(rewardId, 'done');
      return {
        ok: true as const,
        ember: nextEmber,
        message: '兑换了。好好享受。',
      };
    } catch (err) {
      console.warn('[Ember] 兑换奖励失败', err);
      return { ok: false as const, reason: 'FAILED' as const, message: '刚才没换成，再试一次。' };
    }
  });
}
