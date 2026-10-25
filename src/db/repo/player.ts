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
import { getDb } from '../client';
import { ATTRIBUTE_KEYS } from '../schema';

/** 单项属性点上限（转出给调用方用，值来自 domain/balance） */
export const ATTR_POINTS_CAP = ATTR_POINTS_MAX;

/**
 * 头像重掷计数的回绕点。
 * 取 10000：足够换到腻，又不至于让这个数在导出文件里长得难看。
 */
export const MAX_AVATAR_SEED = 10000;

/** player 表的一行，字段名与数据库列一一对应 */
export interface PlayerRow {
  id: string;
  display_name: string;
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
  onboarding_done: number;
  /** 头像的重掷计数：图案由 (id, avatar_seed) 算出来，本身不存 */
  avatar_seed: number;
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
  level: number;
  xpTotal: number;
  xpInLevel: number;
  highestLevel: number;
  /** 五维属性，key 固定为 body / mind / order / spirit / bond */
  attributes: AttributeMap;
  ember: number;
  material: number;
  onboardingDone: boolean;
  /** 头像重掷计数。界面把它传给 buildAvatar */
  avatarSeed: number;
  createdAt: number;
  updatedAt: number;
}

/** 可以直接覆盖的玩家字段（升级结算、改名等场景） */
export interface PlayerPatch {
  displayName?: string;
  level?: number;
  xpTotal?: number;
  xpInLevel?: number;
  highestLevel?: number;
  ember?: number;
  material?: number;
  onboardingDone?: boolean;
  avatarSeed?: number;
}

/** 驼峰字段 → 数据库列白名单 */
const PLAYER_COLUMN_MAP: Record<keyof PlayerPatch, string> = {
  displayName: 'display_name',
  level: 'level',
  xpTotal: 'xp_total',
  xpInLevel: 'xp_in_level',
  highestLevel: 'highest_level',
  ember: 'ember',
  material: 'material',
  onboardingDone: 'onboarding_done',
  avatarSeed: 'avatar_seed',
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
    `SELECT id, display_name, level, xp_total, xp_in_level, highest_level,
            attr_body_xp, attr_mind_xp, attr_order_xp, attr_spirit_xp, attr_bond_xp,
            attr_body_pts, attr_mind_pts, attr_order_pts, attr_spirit_pts, attr_bond_pts,
            ember, material, onboarding_done, avatar_seed, created_at, updated_at
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
    level: row.level,
    xpTotal: row.xp_total,
    xpInLevel: row.xp_in_level,
    highestLevel: row.highest_level,
    attributes: attributesFromRow(row),
    ember: row.ember,
    material: row.material,
    onboardingDone: row.onboarding_done === 1,
    avatarSeed: row.avatar_seed,
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
  const values: Array<string | number> = [];

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

/** 改名 */
export function updateDisplayName(name: string): void {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('名字还是空的');
  }
  updatePlayer({ displayName: trimmed });
}

/**
 * 换一个头像：把重掷计数 +1，返回新的计数。
 *
 * 为什么是 +1 而不是重新随机：图案完全由 (player.id, avatar_seed) 决定，
 * 计数存进库以后，导入、杀进程重开、换设备都会得到同一个头像。
 * 真正的随机数只会在导出导入之间丢掉「你选的其实是哪一个」。
 *
 * 上限 MAX_AVATAR_SEED 只是一个防溢出的上限，取不到也没关系。
 */
export function rerollAvatar(): number {
  const row = getPlayer();
  const next = (row.avatar_seed + 1) % MAX_AVATAR_SEED;
  updatePlayer({ avatarSeed: next });
  return next;
}

/** 读取头像重掷计数。界面首帧要它，单独给一个轻量函数，避免整行快照 */
export function getAvatarSeed(): number {
  const row = getDb().getFirstSync<{ avatar_seed: number }>(
    'SELECT avatar_seed FROM player LIMIT 1'
  );
  if (!row) {
    throw new Error('player 行不存在，数据库可能没有执行种子数据');
  }
  return row.avatar_seed;
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
