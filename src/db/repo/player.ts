/**
 * Ember 数据层 · player 仓库
 *
 * player 永远只有 1 行（单机、单玩家）。
 * 这一层只负责「把快照读出来 / 把算好的新值写回去」，
 * 升级、软上限、难度倍率等规则全部在 domain/score.ts 里算好再传进来。
 *
 * 唯一带一点规则的地方是五维属性的「满 200 转 1 点」：
 * 这是数据库 CHECK 约束（attr_xp 只能 0–199）逼出来的归一化，
 * 放在这里可以保证任何写入路径都不会撞约束。
 */
import {
  ATTR_POINTS_MAX,
  ATTR_XP_PER_POINT,
  growAttribute,
  type AttributeKey,
} from '../../domain/balance';
import { normalizeAvatarId, type AvatarId } from '../../domain/avatar';
import { getDb } from '../client';
import { ATTRIBUTE_KEYS } from '../schema';

/** 单项属性点上限（转出给调用方用，值来自 domain/balance） */
export const ATTR_POINTS_CAP = ATTR_POINTS_MAX;

/** player 表的一行，字段名与数据库列一一对应 */
export interface PlayerRow {
  id: string;
  display_name: string;
  /** 一句自我介绍。NULL = 从来没写过，'' = 写过又清空了 */
  bio: string | null;
  level: number;
  xp_total: number;
  xp_in_level: number;
  highest_level: number;
  attr_body_xp: number;
  attr_mind_xp: number;
  attr_order_xp: number;
  attr_spirit_xp: number;
  attr_bond_xp: number;
  attr_body_pts: number;
  attr_mind_pts: number;
  attr_order_pts: number;
  attr_spirit_pts: number;
  attr_bond_pts: number;
  ember: number;
  material: number;
  /** 精炼材料：3 个普通材料合成 1 个。阶段 4 第 6 条 */
  refined_material: number;
  /** 宽限券补货的持有量（D53，迁移 v14→v15）。月度配给之外的额外票 */
  grace_tickets: number;
  /** 连胜护盾的持有量（D53）。一天的保护，要手动用 */
  streak_shields: number;
  /** 回看券的持有量（D53）。把断掉的连胜接回来 */
  restore_tokens: number;
  /** 最近一次发过月度活动奖励的月份键。NULL = 从来没发过 */
  last_event_reward_month: string | null;
  /** D1–D7 引导的起算日（业务日 YYYY-MM-DD）。NULL = 还没定锚点（老库刚升级上来） */
  guide_start_date: string | null;
  onboarding_done: number;
  /** 挑中的头像 id（'fox' / 'cat' / …）。长相本身是代码里的常量，库里只存这一个词 */
  avatar_id: string;
  created_at: number;
  updated_at: number;
}

/** 单个维度的属性状态（给界面用，字段是驼峰） */
export interface AttributeProgress {
  /** 当前这一档里已积累的属性 XP（0–199） */
  xp: number;
  /** 已获得的属性点（0–99） */
  points: number;
}

/** 五维属性整体状态 */
export type AttributeMap = Record<AttributeKey, AttributeProgress>;

/**
 * 给界面与 domain 用的玩家快照（驼峰命名）。
 * domain/score.ts 的 ScorablePlayer 可以直接由它 + getAttributes() 拼出来。
 */
export interface PlayerSnapshot {
  id: string;
  displayName: string;
  /**
   * 一句自我介绍。null 表示没写过。
   *
   * 界面不区分 null 与 ''：两者都显示成「还没写」。
   * 但导出的 JSON 要区分，所以类型上保留 null 而不是一律折叠成 ''。
   */
  bio: string | null;
  level: number;
  xpTotal: number;
  xpInLevel: number;
  highestLevel: number;
  /** 五维属性，key 固定为 body / mind / order / spirit / bond */
  attributes: AttributeMap;
  ember: number;
  material: number;
  /** 精炼材料。与 material 一样只是一个数字，没有品质/绑定 */
  refinedMaterial: number;
  /** 宽限券补货持有量（D53）。0 是合法的：一个都没有 */
  graceTickets: number;
  /** 连胜护盾持有量（D53） */
  streakShields: number;
  /** 回看券持有量（D53） */
  restoreTokens: number;
  /** 最近一次发过月度活动奖励的月份键 YYYY-MM。null = 从来没发过 */
  lastEventRewardMonth: string | null;
  /**
   * D1–D7 引导的起算日（业务日）。
   *
   * null 表示还没定锚点——老库刚从 v12 升上来就是这种状态。
   * 界面**不要**自己判断 null，用 `services/guide.ts` 的 `getGuideDay()`，
   * 它会先把锚点补成今天再算第几天。
   */
  guideStartDate: string | null;
  onboardingDone: boolean;
  /** 挑中的头像 id。界面把它传给 PlayerAvatar */
  avatarId: AvatarId;
  createdAt: number;
  updatedAt: number;
}

/** 可以直接覆盖的玩家字段（升级结算、改名等场景） */
export interface PlayerPatch {
  displayName?: string;
  /** 传 null 表示「清空」，传 '' 也一样；两者的区别只在导出时可读性上 */
  bio?: string | null;
  level?: number;
  xpTotal?: number;
  xpInLevel?: number;
  highestLevel?: number;
  ember?: number;
  material?: number;
  /** 精炼材料。合成与商店都会改它 */
  refinedMaterial?: number;
  /** 宽限券补货持有量（D53）。只有商店写 */
  graceTickets?: number;
  /** 连胜护盾持有量（D53）。商店写，用掉时 UI 层调 */
  streakShields?: number;
  /** 回看券持有量（D53）。商店写，用掉时 UI 层调 */
  restoreTokens?: number;
  /** 记录「哪个月的月度奖励已经发过了」。只由 narrative 服务写 */
  lastEventRewardMonth?: string | null;
  /** D1–D7 的起算日。只由 guide 服务写（老库补锚点那一刻） */
  guideStartDate?: string | null;
  onboardingDone?: boolean;
  /** 换头像。只存一个 id，长相是代码里的常量 */
  avatarId?: AvatarId;
}

/** 驼峰字段 → 数据库列白名单 */
const PLAYER_COLUMN_MAP: Record<keyof PlayerPatch, string> = {
  displayName: 'display_name',
  bio: 'bio',
  level: 'level',
  xpTotal: 'xp_total',
  xpInLevel: 'xp_in_level',
  highestLevel: 'highest_level',
  ember: 'ember',
  material: 'material',
  refinedMaterial: 'refined_material',
  graceTickets: 'grace_tickets',
  streakShields: 'streak_shields',
  restoreTokens: 'restore_tokens',
  lastEventRewardMonth: 'last_event_reward_month',
  guideStartDate: 'guide_start_date',
  onboardingDone: 'onboarding_done',
  avatarId: 'avatar_id',
};

/** 属性键 → 数据库列名后缀，例如 body → attr_body_xp / attr_body_pts */
function attrXpColumn(attr: AttributeKey): string {
  return `attr_${attr}_xp`;
}

function attrPtsColumn(attr: AttributeKey): string {
  return `attr_${attr}_pts`;
}

/** 读取玩家快照。种子数据保证一定存在。 */
export function getPlayer(): PlayerRow {
  const row = getDb().getFirstSync<PlayerRow>(
    `SELECT id, display_name, bio, level, xp_total, xp_in_level, highest_level,
            attr_body_xp, attr_mind_xp, attr_order_xp, attr_spirit_xp, attr_bond_xp,
            attr_body_pts, attr_mind_pts, attr_order_pts, attr_spirit_pts, attr_bond_pts,
            ember, material, refined_material,
            grace_tickets, streak_shields, restore_tokens,
            last_event_reward_month,
            guide_start_date, onboarding_done, avatar_id, created_at, updated_at
       FROM player
      LIMIT 1`
  );

  if (!row) {
    throw new Error('player 行不存在，数据库可能没有执行种子数据');
  }
  return row;
}

/** 只取玩家 id，打卡与任务写入时都要用 */
export function getPlayerId(): string {
  const row = getDb().getFirstSync<{ id: string }>('SELECT id FROM player LIMIT 1');
  if (!row) {
    throw new Error('player 行不存在，数据库可能没有执行种子数据');
  }
  return row.id;
}

/**
 * 读取玩家快照（驼峰命名），界面与 domain 都直接用这个。
 * 比 getPlayer() 多做了列名转换与属性整理。
 */
export function getPlayerSnapshot(): PlayerSnapshot {
  const row = getPlayer();
  return {
    id: row.id,
    displayName: row.display_name,
    bio: row.bio,
    level: row.level,
    xpTotal: row.xp_total,
    xpInLevel: row.xp_in_level,
    highestLevel: row.highest_level,
    attributes: attributesFromRow(row),
    ember: row.ember,
    material: row.material,
    refinedMaterial: row.refined_material,
    graceTickets: row.grace_tickets,
    streakShields: row.streak_shields,
    restoreTokens: row.restore_tokens,
    lastEventRewardMonth: row.last_event_reward_month,
    guideStartDate: row.guide_start_date,
    onboardingDone: row.onboarding_done === 1,
    // 库里可能存着一个不认识的 id（手改过、或来自别的版本）。
    // 在这里就规范化成七个之一，界面拿到的永远是能画出来的东西。
    avatarId: normalizeAvatarId(row.avatar_id),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** 从 player 行里把五维属性整理成驼峰对象（内部用，避免重复查库） */
function attributesFromRow(row: PlayerRow): AttributeMap {
  const result = {} as AttributeMap;

  for (const key of ATTRIBUTE_KEYS) {
    const xpKey = `attr_${key}_xp` as keyof PlayerRow;
    const ptsKey = `attr_${key}_pts` as keyof PlayerRow;
    result[key] = {
      xp: row[xpKey] as number,
      points: row[ptsKey] as number,
    };
  }
  return result;
}

/** 读取五维属性，返回驼峰命名的对象，方便界面直接用 */
export function getAttributes(): AttributeMap {
  return attributesFromRow(getPlayer());
}

/** 读取单个维度的属性状态 */
export function getAttribute(attr: AttributeKey): AttributeProgress {
  const row = getPlayer();
  const xpKey = `attr_${attr}_xp` as keyof PlayerRow;
  const ptsKey = `attr_${attr}_pts` as keyof PlayerRow;
  return {
    xp: row[xpKey] as number,
    points: row[ptsKey] as number,
  };
}

/**
 * 覆盖式更新玩家字段。只写传进来的键。
 *
 * 注意：调用方需要保证 level 在 1–50、各计数非负，
 * 否则会撞数据库 CHECK 约束并抛错 —— 这是有意的，宁可早报错也不写坏数据。
 */
export function updatePlayer(patch: PlayerPatch): void {
  const sets: string[] = [];
  // null 是合法值：bio = null 表示「清空自我介绍」，不是「不改这个字段」。
  // 所以这里的判断必须是 `=== undefined`，不能写成 `if (!value)`——
  // 后者会把 null 悄悄跳过，用户清空了简介，界面看起来没变，重开却又变回去。
  // （avatar_id 不会有 null：它是一枚举 id，不是可空字段。）
  const values: Array<string | number | null> = [];

  for (const key of Object.keys(patch) as Array<keyof PlayerPatch>) {
    const column = PLAYER_COLUMN_MAP[key];
    if (!column) continue;
    const value = patch[key];
    if (value === undefined) continue;

    sets.push(`${column} = ?`);
    values.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
  }

  if (sets.length === 0) return;

  sets.push('updated_at = ?');
  values.push(Date.now());

  getDb().runSync(`UPDATE player SET ${sets.join(', ')} WHERE id = ?`, [
    ...values,
    getPlayerId(),
  ]);
}

/**
 * 改名字。
 *
 * 只做「非空」这一道检查，**不在这里做长度与禁用词校验**：
 * 那套规则在 domain/profile.ts，需要同时服务输入框的实时提示与保存前的校验。
 * 写两遍规则就一定会有一天只改了一处。
 * 调用方请走 services/profile.ts 的 saveProfile()，它会把两边串起来。
 */
export function updateDisplayName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('名字还是空的');
  }
  updatePlayer({ displayName: trimmed });
}

/**
 * 改自我介绍。
 *
 * 传空字符串表示清空——会写成 NULL 而不是 ''，
 * 因为「从来没写过」和「写过又删了」在这一版里是同一件事，
 * 统一成 NULL 少一种状态要判断。
 */
export function updateBio(bio: string): void {
  const trimmed = bio.trim();
  updatePlayer({ bio: trimmed.length === 0 ? null : trimmed });
}

/**
 * 换头像：存下挑中的那一只，返回写进去的 id。
 *
 * 只存一个词（'fox' / 'cat' / …），长相是 domain/avatar.ts 里的常量。
 * 所以导入导出只多一个字符串，且「同一个 id = 同一个头像」在任何设备上成立。
 *
 * 传进来的值先规范化：不认识的 id 写成默认的狐狸，而不是把非法值写进库——
 * 否则下次读出来还得再规范化一次，而那两个地方迟早会不一致。
 */
export function updateAvatar(id: string): AvatarId {
  const next = normalizeAvatarId(id);
  updatePlayer({ avatarId: next });
  return next;
}

/** 读取当前头像 id。界面首帧要它，单独给一个轻量函数，避免整行快照 */
export function getAvatarId(): AvatarId {
  const row = getDb().getFirstSync<{ avatar_id: string }>(
    'SELECT avatar_id FROM player LIMIT 1'
  );
  if (!row) {
    throw new Error('player 行不存在，数据库可能没有执行种子数据');
  }
  return normalizeAvatarId(row.avatar_id);
}

/** 标记引导已完成 */
export function markOnboardingDone(): void {
  updatePlayer({ onboardingDone: true });
}

/**
 * 增加余烬。传入负数时按 0 处理，避免撞 ember >= 0 的 CHECK 约束。
 * 返回实际写入后的余烬值。
 */
export function addEmber(delta: number): number {
  const player = getPlayer();
  const next = Math.max(0, player.ember + Math.trunc(delta));
  updatePlayer({ ember: next });
  return next;
}

/** 增加材料，规则同上 */
export function addMaterial(delta: number): number {
  const player = getPlayer();
  const next = Math.max(0, player.material + Math.trunc(delta));
  updatePlayer({ material: next });
  return next;
}

/**
 * 给某个维度加属性 XP，满 200 自动转 1 点。
 *
 * 返回值里的 pointsGained 是这次新获得的属性点，
 * 界面可以用它来播放「属性提升」的提示。
 * 属性点封顶 99 后，溢出的 XP 仍然保留（不超 199），不会丢。
 */
export function addAttributeXp(
  attr: AttributeKey,
  amount: number
): { xp: number; points: number; pointsGained: number } {
  const player = getPlayer();
  const xpKey = `attr_${attr}_xp` as keyof PlayerRow;
  const ptsKey = `attr_${attr}_pts` as keyof PlayerRow;

  // 换算规则只在 domain/balance 的 growAttribute 里写一份，这里直接复用
  const growth = growAttribute(
    player[xpKey] as number,
    player[ptsKey] as number,
    amount
  );

  getDb().runSync(
    `UPDATE player SET ${attrXpColumn(attr)} = ?, ${attrPtsColumn(attr)} = ?, updated_at = ? WHERE id = ?`,
    [growth.xp, growth.points, Date.now(), player.id]
  );

  return {
    xp: growth.xp,
    points: growth.points,
    pointsGained: growth.pointsGained,
  };
}

/**
 * 把五维属性整体覆盖写入。
 * 用于「从 checkins 重建快照」这类场景，调用方已经算好完整结果。
 */
export function replaceAttributes(attrs: AttributeMap): void {
  const sets: string[] = [];
  const values: Array<number | string> = [];

  for (const key of ATTRIBUTE_KEYS) {
    const state = attrs[key];
    // 先做归一化，保证不会撞 CHECK 约束
    const xp = Math.min(ATTR_XP_PER_POINT - 1, Math.max(0, Math.trunc(state.xp)));
    const pts = Math.min(ATTR_POINTS_CAP, Math.max(0, Math.trunc(state.points)));

    sets.push(`${attrXpColumn(key)} = ?`, `${attrPtsColumn(key)} = ?`);
    values.push(xp, pts);
  }

  sets.push('updated_at = ?');
  values.push(Date.now());
  values.push(getPlayerId());

  getDb().runSync(`UPDATE player SET ${sets.join(', ')} WHERE id = ?`, values);
}

/**
 * 直接设置玩家的等级与经验快照。
 * 升级结算在 domain/score.ts 里算好，这里只负责落库。
 */
export function setLevelState(level: number, xpInLevel: number, xpTotal: number): void {
  const player = getPlayer();
  const nextHighest = Math.max(player.highest_level, level);

  updatePlayer({
    level,
    xpInLevel,
    xpTotal,
    highestLevel: nextHighest,
  });
}
