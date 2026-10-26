/**
 * 商店与材料合成（阶段 4 第 5、6 条；D53 起扩成四类）。
 *
 * ---- 商店是什么、不是什么 ----
 *
 * 它是**余烬的消耗出口**（docs/04 §4.6：月收入约 700，月支出约 270，
 * 留存 60%——不给出出口，余烬会一直涨，涨到「反正花不完」）。
 *
 * 不是：数值加成（D7：五维纯展示）、抽卡（D5：可变奖励只用于探索，不用于消费）、
 * 限时/折扣/「超值」（那是电商语言，目的是让人买得比想买的多）。
 *
 * ---- D53：从「只卖材料」扩成四类 ----
 *
 * 原来只有材料一件东西，理由是「装饰要美术资源、数值加成被 D7 禁」。
 * 那个理由仍然成立，但它推出的是**「不卖装饰、不卖数值」**，
 * 不是「只能卖材料」。余烬的出口太窄会带来两个真实问题：
 *
 *   1. 月收入 700、材料只用来修连胜（轻松档修复要 0 材料），
 *      于是温和档的玩家**没有任何东西可买**；
 *   2. 「攒着不知道干嘛」比「攒着修连胜」更让人放弃。
 *
 * 所以扩成四类，每一类都有**真实用途**，且都不碰 D7：
 *
 *   material  材料      修连胜要它（标准/硬核档）
 *   refined   精炼材料  硬核档修复要 3 个；3 个普通材料能合成 1 个
 *   shield    连胜护盾  一天的自动保护，与宽限券同类但**要手动用**
 *   ticket    宽限券补货 补一张本月的券（有上限，见 SHIELD_LIMITS）
 *   restore   回看券     把断掉的连胜接回来
 *
 * 第五类不是我们卖的：**用户自己写的奖励**（`tasks.type = 'reward'`）。
 * 这是 docs/01 采纳人升的那一条——「把现有奖励任务类型显性化成一页：
 * 列出你自己定的奖励，标价余烬，点兑换即完成」。数据层早就支持
 * （`ember_cost` 列 + score.ts 的扣减），D53 才把界面接上。
 *
 * ---- 为什么补货有上限 ----
 *
 * 宽限券是**月度配给**（轻松 3 / 标准 2 / 硬核 0），它的意义是
 * 「这个月你可以漏几天」。如果商店能无限补，那配给就没有意义了，
 * 而「花钱就能无限不漏」会让连胜变成一件买得到的东西。
 * 所以补货封顶在 `SHIELD_LIMITS`，且**买不到配给上限以上**。
 *
 * 本文件是纯规则：商品清单、价格、上限、配方。读写库在 services/shop.ts。
 */
import type { ShopMarkKey } from './shopMarks';

/** 商品的四种类别。决定了图形、分组与「怎么用」 */
export type ShopCategory = 'material' | 'refined' | 'shield' | 'ticket' | 'restore';

/** 一件商品 */
export interface ShopItem {
  /** 稳定 id，写进订单记录与导出 */
  id: string;
  /** 名称 */
  name: string;
  /** 一句说明。说清它做什么，不说「超值」 */
  note: string;
  /** 价格（余烬） */
  price: number;
  /** 类别（决定图形与分组） */
  category: ShopCategory;
  /** 买一次得到什么 */
  grant: {
    material?: number;
    refinedMaterial?: number;
    graceTickets?: number;
    streakShields?: number;
    restoreTokens?: number;
  };
  /**
   * 买完之后的持有上限。不传 = 不限。
   *
   * 只有 `ticket` 用得上：宽限券是月度配给，能买到超过配给就没意义了。
   * 其余三类不限——它们是消耗品，多买只意味着多用。
   */
  holdCap?: number;
}

/**
 * 商品清单。价格拉开三档，每档都对应一种「什么时候买得起」：
 *
 *   60–150    一周内能买（日常补给）
 *   240–320   一个月能买一两次（有分量的东西）
 *   900       攒很久（一次性的大事）
 *
 * 为什么数量大多是 1：材料是「攒」出来的，不是「刷」出来的。
 * 一次卖 10 个会让价格失去意义（用户只要看单价就行，而单价又是我们定的）。
 * 唯一例外是「三个材料」——它是「买一次，够修三次」的打包，单价略低。
 */
export const SHOP_ITEMS: readonly ShopItem[] = [
  // ---- 材料 ----
  {
    id: 'material-1',
    name: '一个材料',
    note: '标准档修一次连胜要 1 个。',
    price: 60,
    category: 'material',
    grant: { material: 1 },
  },
  {
    id: 'material-3',
    name: '三个材料',
    note: '攒着用，比一个一个买便宜一点。',
    price: 150,
    category: 'material',
    grant: { material: 3 },
  },
  {
    id: 'refined-1',
    name: '一个精炼材料',
    note: '硬核档修一次要 3 个。三个材料也能合成一个。',
    price: 900,
    category: 'refined',
    grant: { refinedMaterial: 1 },
  },

  // ---- 保护 ----
  {
    id: 'shield-1',
    name: '一张连胜护盾',
    note: '用掉之后，那一天不算断。什么时候用由你决定。',
    price: 240,
    category: 'shield',
    grant: { streakShields: 1 },
  },
  {
    id: 'ticket-1',
    name: '补一张宽限券',
    note: '宽限券每月按难度配给，这里能补一张。',
    price: 320,
    category: 'ticket',
    grant: { graceTickets: 1 },
    // 上限 5：比最高配给（轻松 3）多一点，但不至于把「月度配给」买成无限
    holdCap: 5,
  },

  // ---- 回看 ----
  {
    id: 'restore-1',
    name: '一张回看券',
    note: '把一段断掉的连胜接回来。不用重算历史。',
    price: 260,
    category: 'restore',
    grant: { restoreTokens: 1 },
  },
];

/**
 * 持有上限表。
 *
 * 只列有上限的：宽限券补货 5 张。
 * 其余三类（材料 / 精炼 / 护盾 / 回看）**故意不限**——
 * 它们是消耗品，多买只意味着多用，而限购会制造一种这个 App 不需要的稀缺感。
 */
export const SHOP_HOLD_CAPS = {
  graceTickets: 5,
} as const;

/** 按 id 取商品。不认识时返回 null（导入的旧订单可能有陌生 id） */
export function getShopItem(id: string): ShopItem | null {
  return SHOP_ITEMS.find((item) => item.id === id) ?? null;
}

/** 按类别分组（界面按这个顺序渲染分组） */
export const SHOP_GROUPS: ReadonlyArray<{ category: ShopCategory; title: string; note: string }> = [
  { category: 'material', title: '材料', note: '修连胜要用的东西。' },
  { category: 'refined', title: '精炼材料', note: '更硬的那种修复才用得上。' },
  { category: 'shield', title: '保护', note: '断一天不算断——但要用得其所。' },
  { category: 'restore', title: '回看', note: '把断掉的那一段接回来。' },
];

/**
 * 某个类别下的商品。
 *
 * `ticket` 与 `shield` 同属「保护」组，所以这里按组取时要展开。
 */
export function itemsOfGroup(category: ShopCategory): ShopItem[] {
  const members: ShopCategory[] =
    category === 'shield' ? ['shield', 'ticket'] : [category];
  return SHOP_ITEMS.filter((item) => members.includes(item.category));
}

/** 商品的图形键（`domain/shopMarks.ts`）。类别直接就是键，除了 ticket 用 ticket */
export function markOf(item: ShopItem): ShopMarkKey {
  return item.category as ShopMarkKey;
}

/** 余额快照。买与合成都要看它 */
export interface ShopBalances {
  ember: number;
  material: number;
  refinedMaterial: number;
  graceTickets: number;
  streakShields: number;
  restoreTokens: number;
}

/**
 * 能不能买。
 *
 * 三种拒绝：商品不存在、余烬不够、**持有量已到上限**。
 *
 * 为什么不设「每天限购」：限购是稀缺感的制造，而余烬本来就是靠做事赚的。
 * 唯一的上限是**持有上限**（宽限券），它限制的不是「买几次」，
 * 而是「攒到多少就不该再攒了」——那是配给的语义，不是促销的语义。
 */
export type PurchaseCheck =
  | { ok: true }
  | { ok: false; reason: 'UNKNOWN_ITEM' | 'INSUFFICIENT_EMBER' | 'AT_CAP'; shortfall: number };

export function checkPurchase(itemId: string, balances: ShopBalances): PurchaseCheck {
  const item = getShopItem(itemId);
  if (!item) return { ok: false, reason: 'UNKNOWN_ITEM', shortfall: 0 };

  const ember = Math.max(0, Math.floor(balances.ember));
  if (ember < item.price) {
    return { ok: false, reason: 'INSUFFICIENT_EMBER', shortfall: item.price - ember };
  }

  // 持有上限（目前只有宽限券有）
  if (item.holdCap !== undefined && item.grant.graceTickets) {
    const have = Math.max(0, Math.floor(balances.graceTickets));
    if (have + item.grant.graceTickets > item.holdCap) {
      return { ok: false, reason: 'AT_CAP', shortfall: item.holdCap - have };
    }
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

/**
 * 合成检查结果。
 *
 * `ok: true` 时带一个 `times`：**能合几次**（一次点完，不用点三次）。
 * 为什么给「几次」而不是让用户一次一次点：3 个材料换 1 个，攒了 9 个
 * 要点三次，每一次都是同一个动作与同一句提示——那是无意义的重复。
 */
export type RefineCheck =
  | { ok: true; times: number }
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
  return { ok: true, times: Math.floor(have / REFINE_RECIPE.input) };
}

/**
 * 买完之后的新余额。
 *
 * 纯函数：输入旧余额与商品，输出新余额。写库在 services 层。
 * 分开的理由与 score.ts 一样——「买完剩多少」这个问题不该需要一台手机才能回答。
 */
export function applyPurchase(item: ShopItem, balances: ShopBalances): ShopBalances {
  return {
    ember: Math.max(0, Math.floor(balances.ember) - item.price),
    material: Math.max(0, Math.floor(balances.material) + (item.grant.material ?? 0)),
    refinedMaterial: Math.max(
      0,
      Math.floor(balances.refinedMaterial) + (item.grant.refinedMaterial ?? 0)
    ),
    graceTickets: Math.max(
      0,
      Math.floor(balances.graceTickets) + (item.grant.graceTickets ?? 0)
    ),
    streakShields: Math.max(
      0,
      Math.floor(balances.streakShields) + (item.grant.streakShields ?? 0)
    ),
    restoreTokens: Math.max(
      0,
      Math.floor(balances.restoreTokens) + (item.grant.restoreTokens ?? 0)
    ),
  };
}

/**
 * 合成之后的新余额。
 *
 * @param times 合几次（默认 1）。由 `checkRefine` 给出的 `times` 决定。
 */
export function applyRefine(
  balances: Pick<ShopBalances, 'material' | 'refinedMaterial'>,
  times = 1
): Pick<ShopBalances, 'material' | 'refinedMaterial'> {
  // 不能合成超过现有材料能支撑的次数：调用方传大了也只是白算，不该负下去
  const maxTimes = Math.floor(Math.max(0, Math.floor(balances.material)) / REFINE_RECIPE.input);
  const t = Math.min(Math.max(0, Math.floor(times)), maxTimes);
  return {
    material: Math.max(0, Math.floor(balances.material) - REFINE_RECIPE.input * t),
    refinedMaterial: Math.max(
      0,
      Math.floor(balances.refinedMaterial) + REFINE_RECIPE.output * t
    ),
  };
}

// ---------------------------------------------------------------
// 自定义奖励（用户自己写的，不是我们卖的）
// ---------------------------------------------------------------

/**
 * 用户自己写的奖励。
 *
 * 数据层早就有（`tasks.type = 'reward'` + `ember_cost`），D53 才接界面。
 * 与商店商品的区别：
 *   - 商品是我们定价，奖励是**用户自己定价**；
 *   - 商品买到就进余额，奖励买到就**完成一次**（写一条 checkin，扣余烬，不加 XP）。
 *
 * 为什么奖励不加 XP：`score.ts` 里 reward 类型返回 0 XP / 0 余烬 / 0 属性。
 * 这与「写日记不加分」同一条理由——兑换是消费，不是做事。
 */
export interface RewardDraft {
  /** 名字。必填 */
  title: string;
  /** 标价（余烬）。必填，1–99999 */
  emberCost: number;
}

/** 奖励名字的长度上限。与 tasks.title 的 CHECK（1–80）一致 */
export const REWARD_TITLE_MAX = 40;
/** 奖励标价的上下限 */
export const REWARD_COST_MIN = 1;
export const REWARD_COST_MAX = 99999;

/**
 * 校验一个奖励草稿。
 *
 * 返回规范化之后的值（去掉首尾空白、价格取整）。
 * 与 `saveProfile` / `saveJournalEntry` 的「先规范化再判空」同一套顺序。
 */
export type RewardDraftCheck =
  | { ok: true; value: RewardDraft }
  | { ok: false; reason: 'EMPTY_TITLE' | 'TITLE_TOO_LONG' | 'BAD_COST' };

export function checkRewardDraft(draft: { title: string; emberCost: number }): RewardDraftCheck {
  const title = draft.title.trim().replace(/\s+/g, ' ');
  if (title.length === 0) return { ok: false, reason: 'EMPTY_TITLE' };
  if (title.length > REWARD_TITLE_MAX) return { ok: false, reason: 'TITLE_TOO_LONG' };
  const cost = Math.floor(draft.emberCost);
  if (!Number.isFinite(cost) || cost < REWARD_COST_MIN || cost > REWARD_COST_MAX) {
    return { ok: false, reason: 'BAD_COST' };
  }
  return { ok: true, value: { title, emberCost: cost } };
}

/**
 * 能不能兑换一个自定义奖励。
 *
 * 只有一种拒绝：余烬不够。**不设每日次数上限**——
 * 用户自己定的奖励，如果他自己不想多兑，就不该由我们拦。
 */
export type RedeemCheck =
  | { ok: true }
  | { ok: false; reason: 'INSUFFICIENT_EMBER'; shortfall: number };

export function checkRedeem(emberCost: number, ember: number): RedeemCheck {
  const cost = Math.max(0, Math.floor(emberCost));
  const have = Math.max(0, Math.floor(ember));
  if (have < cost) return { ok: false, reason: 'INSUFFICIENT_EMBER', shortfall: cost - have };
  return { ok: true };
}
