/**
 * 单人 Boss（阶段 5 第 3 条）。
 *
 * ---- 它是什么 ----
 *
 * 每季一个 Boss，血量 = 本季任务完成数的映射，打卡即造成伤害。
 *
 * ---- 它不是什么（这几条决定了它能成立）----
 *
 *   - **没有死亡**。Boss 血量掉到 0 就结束了，但没有任何东西会因此失去。
 *   - **没有失败惩罚**。一季没打完，Boss 就留在那儿——下个季度换一个，
 *     旧的那个不会变成「你输过」的记录。
 *   - **没有战斗操作**。不去按技能、不选装备、不算属性。打卡就是伤害，
 *     因为「你已经在做的那件事」就是唯一的战斗。
 *
 * 它存在的理由只有一个：把「打卡」这件事在季度尺度上**看见**。
 * 一天一次打卡的反馈是「+26 XP」，一季打完一个 Boss 的反馈是
 * 「这个季度我做了一百多次」。后者是前者看不出来的东西。
 *
 * ---- 为什么血量按「本季完成数」而不是「连续天数」----
 *
 * 连续天数会把断更变成「Boss 回血」。而断更是常态，
 * 让常态产生负反馈正是这个 App 要避免的。
 *
 * 本文件是纯函数：不碰数据库、不读系统时间。
 */
import type { Season } from './stories';
import { SEASONS, seasonOfMonth } from './stories';

/** 一个 Boss */
export interface Boss {
  /** 稳定 id */
  id: string;
  /** 属于哪一季 */
  season: Season;
  /** 名字。名词，不是敌人名 */
  name: string;
  /** 一句话说它在等什么 */
  note: string;
  /**
   * 血量 = 这一季要完成多少次记录才能「打完」。
   *
   * 数值来源：一季约 13 周。每天 1 件事 = 91 次。
   * 所以 60 是「每天都做一件」的七成——那个量级在一季里是可达的，
   * 又不至于轻轻松松。
   */
  hp: number;
}

/**
 * 四季的 Boss。
 *
 * 名字都取自季节本身，而不是「魔物」「巨龙」——这一版没有幻想设定，
 * 它的隐喻是「季节在等你」。
 */
export const BOSSES: readonly Boss[] = [
  {
    id: 'boss-spring',
    season: 'spring',
    name: '解冻的土',
    note: '它要的是一点一点被翻动。',
    hp: 60,
  },
  {
    id: 'boss-summer',
    season: 'summer',
    name: '正午的石头',
    note: '它要的是每天同一时刻的一点耐心。',
    hp: 60,
  },
  {
    id: 'boss-autumn',
    season: 'autumn',
    name: '满桌的东西',
    note: '它要的是一样一样收好。',
    hp: 60,
  },
  {
    id: 'boss-winter',
    season: 'winter',
    name: '很长的夜',
    note: '它要的是你还在。',
    hp: 60,
  },
];

/** 按季取 Boss */
export function bossOf(season: Season): Boss | null {
  return BOSSES.find((boss) => boss.season === season) ?? null;
}

/** 按月份取当前季的 Boss */
export function currentBoss(month: number): Boss | null {
  return bossOf(seasonOfMonth(month));
}

/**
 * Boss 的当前状态。
 *
 * 三个数就够：打了多少、还剩多少、打完了没有。
 * **没有「伤害排名」「暴击」「连击加成」**——那些是把打卡变成游戏数值的第一步，
 * 而这一步一旦走出去，五维的「纯展示」原则（D7）就保不住了。
 */
export interface BossState {
  boss: Boss;
  /** 本季已造成的伤害 = 本季的记录次数 */
  damage: number;
  /** 剩余血量。不会小于 0 */
  remaining: number;
  /** 打完了没有 */
  cleared: boolean;
  /** 进度 0–1，用于画血条 */
  ratio: number;
}

/**
 * 算一个 Boss 的当前状态。
 *
 * 入参是「本季的记录次数」，由 services 层从 checkins 里数出来。
 * 超过血量时 remaining 钳到 0，ratio 钳到 1——**不显示「溢出伤害」**：
 * 那会让人想「多打一点」，而这里的上限本来就是「打完了」。
 */
export function bossState(boss: Boss, damage: number): BossState {
  const dealt = Math.max(0, Math.floor(damage));
  const remaining = Math.max(0, boss.hp - dealt);
  return {
    boss,
    damage: dealt,
    remaining,
    cleared: remaining === 0,
    ratio: boss.hp > 0 ? Math.min(1, dealt / boss.hp) : 0,
  };
}

/**
 * 打完之后说什么。
 *
 * 只说事实（「这一季打完了」），不庆祝、不发奖。
 * 返回 null 表示还没打完，不需要说什么。
 */
export function describeBoss(state: BossState): string | null {
  if (!state.cleared) return null;
  return `这一季的「${state.boss.name}」打完了。`;
}

/**
 * 一季的范围：哪几个月。
 *
 * 给「本季的记录次数」查询用。
 */
export function seasonMonths(season: Season): readonly number[] {
  return SEASONS.find((item) => item.id === season)?.months ?? [];
}
