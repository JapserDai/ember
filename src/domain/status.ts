/**
 * 状态页的读数（domain 层：纯函数，不碰 React、不碰数据库、不读系统时间）
 *
 * ---- 这一页是什么 ----
 *
 * D48 照抄人升（LifeUp）的「状态」页版式：**人生等级** → **属性** → **称号**。
 * 内容全部来自 Ember 已有的数据，一个字段都没新增。
 *
 * 为什么要从 `app/(tabs)/status.tsx` 挪到这里：这段装配是**纯计算**
 * （只吃玩家快照与一个累计次数），留在页面里意味着要验证它就得连带拉进
 * react-native 与 expo-router——仓库外那套 Node 测试就测不到。
 * 第一版就是因为这个漏了一个真 bug（见下面的「分母」）。
 *
 * ---- 两个最容易读错的口径 ----
 *
 * **① 人生等级的分母是「本级总需」，不是「还差多少」。**
 * `xpToNextLevel(level, inLevel)` 返回的是**剩余**（`balance.ts` 里
 * `XP_TABLE[level] - inLevel`）。把它当分母会算出「900 / 15」这种数——
 * 差 15 点升级时进度条画满，而本级一共要 915 点。
 * 所以这里分母一律用 `XP_TABLE[level]`（本级从 0 升到下一级需要的总量）。
 *
 * **② 属性等级 = `points + 1`，总分 = `points × 200 + xp`。**
 * Ember 的属性不是「一条可以往回走的经验条」，而是「点数 + 余数」两个数。
 * 这两条式子只是把人升的那套读法套到已有的两列上，**零迁移**。
 *
 * ---- D7：这些数字不参与任何计分 ----
 *
 * 这个模块不算奖励、不写库、也不 import `score.ts`。
 * 加属性点只发生在打卡与撤销里（`services/checkin.ts`），这里**只读**。
 * 以后若有人想「让属性加成影响经验」，先读 D7 与 D48。
 */
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABEL,
  ATTR_POINTS_MAX,
  ATTR_XP_PER_POINT,
  MAX_LEVEL,
  XP_TABLE,
  type AttributeKey,
} from './balance';
import {
  JOURNEY_TITLES,
  highestTitles,
  nextJourneyTitle,
  nextTitles,
  titleProgress,
  unlockedJourneyTitles,
} from './titles';

/** 属性行的显示口径：攒满一级需要的属性经验（就是每点换算率） */
export const ATTR_LEVEL_XP = ATTR_XP_PER_POINT;

/**
 * 状态页要读的那部分玩家数据。
 *
 * 刻意写成**结构类型**而不是 import `PlayerSnapshot`：domain 不该依赖数据层。
 * `repo/player.ts` 的快照字段更多，结构上自然满足这个类型，页面直接传进来就行；
 * 以后给快照加字段，这里也不会莫名被牵着改。
 */
export interface StatusPlayerInput {
  level: number;
  xpInLevel: number;
  attributes: Record<AttributeKey, { xp: number; points: number }>;
}

/** 一个「点数 / 余数」对 */
export interface AttributePoints {
  xp: number;
  points: number;
}

/** 属性行要的全部数据 */
export interface AttributeRow {
  key: AttributeKey;
  label: string;
  /** 这一维的等级。0 点 = 1 级 */
  level: number;
  /** 不够一级的余数 */
  xp: number;
  /** 已攒够的整点数（0–99） */
  points: number;
  /** 这一维的总属性经验 = points × 200 + xp（脏数据已钳好） */
  totalXp: number;
  /** 进度条：余数 / 一级所需 */
  progress: number;
}

/** 状态页需要的全部数据 */
export interface StatusView {
  /** 显示用的等级，钳到 1–MAX_LEVEL */
  level: number;
  /** 本级已积累的经验 */
  xpInLevel: number;
  /** 本级升到下一级**一共**需要多少（口径 ①）。满级是 0 */
  xpLevelTotal: number;
  /** 进度条：xpInLevel / xpLevelTotal */
  xpProgress: number;
  /** 累计记录次数。只数有效打卡——撤销掉的 status 是 'reversed'，不算「记过」 */
  totalRecords: number;
  attributes: AttributeRow[];
  /** 已拿到的属性称号名（每维只取最高的那一档） */
  earnedTitles: string[];
  /** 下一档属性称号的提示。全都拿满时是空数组 */
  nextTitleHints: Array<{ label: string; remaining: number }>;
  /** 最近一个旅程称号（等级那条轴）。一个都没拿到时是 null */
  journeyTitle: string | null;
  /** 下一个旅程称号还差几级。已经到顶（LV.50）时是 null */
  nextJourneyHint: { name: string; remaining: number } | null;
  /** 已解锁 / 总数（属性 + 旅程，D51 起是 20），只用于页尾一行小字 */
  unlockedTitles: number;
  totalTitles: number;
}

/**
 * 把等级钳到 1–MAX_LEVEL。
 *
 * `player.level` 正常由 score 维护、必然在范围内，但库里存的是裸整数：
 * 手改过库或导入过坏备份的话，越界的等级不该把进度条算成负数或 Infinity。
 */
function clampLevel(level: number): number {
  const l = Number.isFinite(level) ? Math.floor(level) : 1;
  return Math.min(MAX_LEVEL, Math.max(1, l));
}

/**
 * 本级升到下一级**一共**需要多少 XP（口径 ①）。满级是 0。
 *
 * 注意与 `xpToNextLevel` 的区别：那个返回的是「还差多少」，
 * 是这里减掉已积累经验之后的结果。显示用总量、结算用剩余，两者不能混。
 */
export function xpLevelTotal(level: number): number {
  const l = clampLevel(level);
  if (l >= MAX_LEVEL) return 0;
  return XP_TABLE[l] ?? 0;
}

/** 一个「点数 + 余数」的总属性经验（脏数据先钳，免得进度条撑出 100%） */
export function attributeTotalXp(attr: AttributePoints): number {
  const points = Math.min(ATTR_POINTS_MAX, Math.max(0, Math.trunc(attr.points ?? 0)));
  const xp = Math.min(ATTR_LEVEL_XP - 1, Math.max(0, Math.trunc(attr.xp ?? 0)));
  return points * ATTR_LEVEL_XP + xp;
}

/** 属性等级（口径 ②）。0 点 = 1 级，99 点封顶 = 100 级 */
export function attributeLevel(attr: AttributePoints): number {
  return Math.min(ATTR_POINTS_MAX, Math.max(0, Math.trunc(attr.points ?? 0))) + 1;
}

/** 属性行：把一维的「点数 + 余数」读成人升那套显示 */
export function buildAttributeRow(key: AttributeKey, attr: AttributePoints): AttributeRow {
  const points = Math.min(ATTR_POINTS_MAX, Math.max(0, Math.trunc(attr.points ?? 0)));
  const xp = Math.min(ATTR_LEVEL_XP - 1, Math.max(0, Math.trunc(attr.xp ?? 0)));
  const total = points * ATTR_LEVEL_XP + xp;
  return {
    key,
    label: ATTRIBUTE_LABEL[key],
    level: points + 1,
    xp,
    points,
    totalXp: total,
    progress: Math.min(1, xp / ATTR_LEVEL_XP),
  };
}

/**
 * 从玩家数据装配整个状态页。
 *
 * 纯读，没有任何写操作。`totalRecords` 由调用方数好传进来
 * ——domain 不碰库，「有效打卡有多少次」是数据层的事。
 */
export function buildStatusView(player: StatusPlayerInput, totalRecords: number): StatusView {
  const attributes: AttributeRow[] = ATTRIBUTE_KEYS.map((key) =>
    buildAttributeRow(key, player.attributes[key])
  );

  const pointsMap = {} as Record<AttributeKey, number>;
  for (const key of ATTRIBUTE_KEYS) {
    pointsMap[key] = Math.min(ATTR_POINTS_MAX, Math.max(0, player.attributes[key].points ?? 0));
  }

  const level = clampLevel(player.level);
  const xpTotal = xpLevelTotal(level);
  const xpInLevel = Math.max(0, Math.trunc(player.xpInLevel ?? 0));

  // 旅程称号：最近拿到的那一个 + 下一个还差几级（D51）
  const journeyIds = unlockedJourneyTitles(level);
  const latestJourneyTitle =
    journeyIds.length > 0 ? (JOURNEY_TITLES.find((t) => t.id === journeyIds[journeyIds.length - 1]) ?? null) : null;
  const nextJourney = nextJourneyTitle(level);
  const progress = titleProgress(pointsMap, level);

  return {
    level,
    xpInLevel,
    xpLevelTotal: xpTotal,
    // 满级没有进度条可言，画满；未满级时若本级经验异常超出总量，钳到 1 而不是溢出
    xpProgress: xpTotal > 0 ? Math.min(1, xpInLevel / xpTotal) : 1,
    totalRecords: Math.max(0, Math.trunc(totalRecords)),
    attributes,
    earnedTitles: highestTitles(pointsMap).map((title) => title.name),
    nextTitleHints: nextTitles(pointsMap)
      .slice(0, 3)
      // 属性称号表里每一项的 attribute 都非 null；`?? ''` 只是为了让类型收窄通过
      .map((item) => ({
        label: item.title.attribute ? ATTRIBUTE_LABEL[item.title.attribute] : '',
        remaining: item.remaining,
      })),
    // 旅程称号走等级那条轴（D51）。到顶之后 `nextJourneyTitle` 返回 null
    journeyTitle: latestJourneyTitle?.name ?? null,
    nextJourneyHint: nextJourney
      ? { name: nextJourney.title.name, remaining: nextJourney.remaining }
      : null,
    unlockedTitles: progress.unlocked,
    totalTitles: progress.total,
  };
}
