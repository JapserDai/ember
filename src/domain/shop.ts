/**
 * 商店与材料合成（阶段 4 第 5、6 条）。
 *
 * ---- 商店是什么、不是什么 ----
 *
 * 它是**余烬的消耗出口**（docs/04 §4.6：月收入约 700，月支出约 270，
 * 留存 60%——不给出出口，余烬会一直涨，涨到「反正花不完」）。
 *
 * 不是：装饰品（那需要美术资源，而阶段 4 的降级方案是「全部用几何图形」，
 * 一个几何图形商店没有意义）、数值加成（D7：五维纯展示，不能影响数值）、
 * 抽卡（D5 的立场：可变奖励只用于探索，不用于消费）。
 *
 * 所以商店里只有一种东西：**材料**。
 * 材料是硬货币，目前唯一用途是标准/硬核档的连胜修复（repairMaterial）。
 * 于是余烬的出口变成了「为下一次修复做准备」——那是一个真实的需求，
 * 而不是一个为了消耗而存在的消耗。
 *
 * ---- 合成是什么 ----
 *
 * 3 个低级材料 → 1 个高级材料（固定配方，不做随机）。
 *
 * 为什么固定配方：随机合成（有概率失败 / 出别的）是赌博机制，
 * 它与「不惩罚、不评判」的底线冲突——赌输了的那一刻，用户会觉得自己被耍了。
 *
 * 为什么是 3:1：2:1 太便宜（材料没有稀缺感），5:1 太贵（攒一次要一个月）。
 * 3 是「攒三次能换一次」的手感，也与「三个一样的东西换一个更好的」这个
 * 直觉一致。
 *
 * ---- 这一版材料只有一档 ----
 *
 * docs/05 写的是「3 个低级材料 → 1 个高级材料」。而 player 表只有
 * 一个 `material` 列（没有分级）。所以这一版的做法是：
 *
 *   - 商店里卖的是**普通材料**，直接进 `player.material`；
 *   - 合成做的是「3 个普通材料 → 1 个**精炼材料**」，精炼材料存在
 *     `player.refined_material`（迁移 v10→v11 加列）。
 *
 * 为什么不直接把 3 个普通材料合成 1 个普通材料：那是净损失，没有意义。
 *
 * 本文件是纯规则：商品清单、价格、合成配方。读写库在 services/shop.ts。
 */

/** 一件商品 */
export interface ShopItem {
  /** 稳定 id，写进订单记录 */
  id: string;
  /** 名称 */
  name: string;
  /** 一句说明。说清它做什么，不说「超值」 */
  note: string;
  /** 价格（余烬） */
  price: number;
  /** 买一次得到什么 */
  grant: { material?: number; refinedMaterial?: number };
}

/**
 * 商品清单。
 *
 * 三件，价格拉开：
 *   - 60   一次普通修复的零头（轻松档修复要 15 余烬、0 材料）
 *   - 240  一个月能买一两次
 *   - 900  攒很久才买得起，但买了就真的有用
 *
 * 为什么数量都是 1：材料是「攒」出来的，不是「刷」出来的。
 * 一次卖 10 个会让价格失去意义（用户只要看单价就行，而单价又是我们定的）。
 */
export const SHOP_ITEMS: readonly ShopItem[] = [
  {
    id: 'material-1',
    name: '一个材料',
    note: '标准档修一次连胜要 1 个。',
    price: 60,
    grant: { material: 1 },
  },
  {
    id: 'material-3',
    name: '三个材料',
    note: '攒着用，比一个一个买便宜一点。',
    price: 150,
    grant: { material: 3 },
  },
  {
    id: 'refined-1',
    name: '一个精炼材料',
    note: '三个材料能合成一个，也可以直接买。',
    price: 900,
    grant: { refinedMaterial: 1 },
  },
];

/** 按 id 取商品。不认识时返回 null（导入的旧订单可能有陌生 id） */
export function getShopItem(id: string): ShopItem | null {
  return SHOP_ITEMS.find((item) => item.id === id) ?? null;
}

/**
 * 能不能买。
 *
 * 只判余额，不判别的。**不设限购**：限购是一种「稀缺感」的制造，
 * 而这个 App 不需要制造稀缺——余烬本来就是靠做事赚的。
 */
export type PurchaseCheck =
  | { ok: true }
  | { ok: false; reason: 'UNKNOWN_ITEM' | 'INSUFFICIENT_EMBER'; shortfall: number };

export function checkPurchase(itemId: string, ember: number): PurchaseCheck {
  const item = getShopItem(itemId);
  if (!item) return { ok: false, reason: 'UNKNOWN_ITEM', shortfall: 0 };
  const have = Math.max(0, Math.floor(ember));
  if (have < item.price) {
    return { ok: false, reason: 'INSUFFICIENT_EMBER', shortfall: item.price - have };
  }
  return { ok: true };
}

/** 合成配方：3 个普通材料 → 1 个精炼材料 */
export const REFINE_RECIPE = {
  /** 要几个普通材料 */
  input: 3,
  /** 得到几个精炼材料 */
  output: 1,
} as const;

/** 合成检查结果 */
export type RefineCheck =
  | { ok: true }
  | { ok: false; reason: 'INSUFFICIENT_MATERIAL'; shortfall: number };

/**
 * 能不能合成。
 *
 * 与购买不同，合成**不看余烬**：它是材料的转换，不是消费。
 * 这也意味着合成永远不会让用户的资产变少（3 个换 1 个更好的），
 * 只是「攒不动的时候有一个动作可做」。
 */
export function checkRefine(material: number): RefineCheck {
  const have = Math.max(0, Math.floor(material));
  if (have < REFINE_RECIPE.input) {
    return {
      ok: false,
      reason: 'INSUFFICIENT_MATERIAL',
      shortfall: REFINE_RECIPE.input - have,
    };
  }
  return { ok: true };
}

/**
 * 买完之后的新余额。
 *
 * 纯函数：输入旧余额与商品，输出新余额。写库在 services 层。
 * 分开的理由与 score.ts 一样——「买完剩多少」这个问题不该需要一台手机才能回答。
 */
export function applyPurchase(
  item: ShopItem,
  balances: { ember: number; material: number; refinedMaterial: number }
): { ember: number; material: number; refinedMaterial: number } {
  return {
    ember: Math.max(0, Math.floor(balances.ember) - item.price),
    material: Math.max(0, Math.floor(balances.material) + (item.grant.material ?? 0)),
    refinedMaterial: Math.max(
      0,
      Math.floor(balances.refinedMaterial) + (item.grant.refinedMaterial ?? 0)
    ),
  };
}

/** 合成之后的新余额 */
export function applyRefine(balances: {
  material: number;
  refinedMaterial: number;
}): { material: number; refinedMaterial: number } {
  return {
    material: Math.max(0, Math.floor(balances.material) - REFINE_RECIPE.input),
    refinedMaterial: Math.max(
      0,
      Math.floor(balances.refinedMaterial) + REFINE_RECIPE.output
    ),
  };
}
