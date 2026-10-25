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
import {
  applyPurchase,
  applyRefine,
  checkPurchase,
  checkRefine,
  getShopItem,
  REFINE_RECIPE,
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
      message: string;
    }
  | {
      ok: false;
      reason: 'UNKNOWN_ITEM' | 'INSUFFICIENT_EMBER' | 'FAILED';
      /** 还差多少余烬（只有 INSUFFICIENT_EMBER 时有意义） */
      shortfall: number;
      message: string;
    };

/** 合成结果 */
export type RefineResult =
  | {
      ok: true;
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
    const check = checkPurchase(itemId, player.ember);

    if (!check.ok) {
      if (check.reason === 'UNKNOWN_ITEM') {
        return {
          ok: false as const,
          reason: 'UNKNOWN_ITEM' as const,
          shortfall: 0,
          message: '没有这件东西。',
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

    const next = applyPurchase(item, {
      ember: player.ember,
      material: player.material,
      refinedMaterial: player.refinedMaterial,
    });

    updatePlayer({
      ember: next.ember,
      material: next.material,
      refinedMaterial: next.refinedMaterial,
    });

    return {
      ok: true as const,
      item,
      ember: next.ember,
      material: next.material,
      refinedMaterial: next.refinedMaterial,
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

    const next = applyRefine({
      material: player.material,
      refinedMaterial: player.refinedMaterial,
    });

    updatePlayer({
      material: next.material,
      refinedMaterial: next.refinedMaterial,
    });

    return {
      ok: true as const,
      material: next.material,
      refinedMaterial: next.refinedMaterial,
      message: `合成了 1 个精炼材料（用了 ${REFINE_RECIPE.input} 个材料）。`,
    };
  });
}

/** 商店页要的余额 */
export interface ShopBalances {
  ember: number;
  material: number;
  refinedMaterial: number;
}

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
    };
  } catch (err) {
    console.warn('[Ember] 读取余额失败', err);
    return { ember: 0, material: 0, refinedMaterial: 0 };
  }
}
