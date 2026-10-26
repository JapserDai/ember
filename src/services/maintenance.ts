/**
 * 「日常维护」：打开 App 时该跑的那三件事，加上它们要说的那几句话。
 *
 * ---- 为什么要把三件事收进一个函数 ----
 *
 * `settleUpTo()`（惰性日结算）、`applyGraceIfNeeded()`（宽限券）、
 * `grantMonthlyEventReward()`（月度奖励）**必须按这个顺序跑**，
 * 而且三者都靠「用户现在打开了 App」这个时机——我们不可能在他不开 App 时
 * 知道他断签了、也不可能在他不开 App 时发奖励。
 *
 * 早先这三行散在 `app/_layout.tsx` 的 bootstrap 里。散着写的代价是：
 * **从后台切回前台时没人再跑一遍**，于是隔夜切回来（进程没被杀）时
 * `last_settled_date` 还是昨天，撤销保护会放行昨天的记录。
 * 收进一个函数之后，冷启动与前台恢复走的是同一条路，不会再漏。
 *
 * ---- 顺序为什么不能变 ----
 *
 * 1. **结算必须在宽限券之前**：结算先把 `last_settled_date` 推到今天，
 *    而 `applyGraceIfNeeded` 要用「今天」去反推「昨天」。反过来的话，
 *    跨日打开时昨天会被算错一天。
 * 2. **月度奖励放最后**：它发的是上个月的材料，与结算日无关，
 *    但它要读 player 的余额——放在结算之后读到的才是最终值。
 *
 * ---- 那几句话为什么要经过队列 ----
 *
 * 这三件事各自会返回一句给用户看的话（「昨天空着，自动用了一张宽限券」）。
 * 同一时刻最多可能有三句（结算说「中间空了一阵子」+ 宽限券说「用了一张」
 * + 月度奖励说「收到了 2 个材料」）。首页只有一个提示位置，
 * 所以这里把它们排成队列交给首页逐条说完，而不是让最后一句话盖掉前两句。
 *
 * 根布局没有界面，也不会一直挂着，所以「攒着的话」放在模块级的队列里：
 * 冷启动时维护先于任何界面发生，首页挂载后再把队列里的句子取走。
 */
import { grantMonthlyEventReward } from './narrative';
import { settleUpTo, type SettleOutcome } from './settle';
import { applyGraceIfNeeded, type GraceOutcome } from './streak';

/** 一次维护跑完之后的全部结果 */
export interface MaintenanceOutcome {
  settle: SettleOutcome;
  grace: GraceOutcome;
  reward: { granted: number; month: string | null; message: string | null };
  /** 这一轮要对用户说的话（可能为空）。已经按「先说什么后说什么」排好序 */
  notices: string[];
  /** 系统时间被调回过去过。只写日志，不给用户看（见 services/settle.ts） */
  clockBack: boolean;
}

/** 还没有订阅者时攒下来的话 */
const pendingNotices: string[] = [];
/** 当前订阅者（现在只有首页） */
const listeners = new Set<(notice: string) => void>();

/**
 * 把几句话发给订阅者。
 *
 * 没有订阅者就先攒着——冷启动时维护跑在首帧之前，那时首页还没挂载。
 */
function publish(notices: readonly string[]): void {
  if (notices.length === 0) return;

  if (listeners.size === 0) {
    pendingNotices.push(...notices);
    return;
  }

  for (const notice of notices) {
    for (const listener of listeners) listener(notice);
  }
}

/**
 * 订阅「回来之后发生了什么」。
 *
 * 挂上时会**立刻**把启动阶段攒下的句子交出去，所以首页不需要再单独
 * 读一次什么状态。返回的函数用于取消订阅（页面卸载时调用）。
 */
export function subscribeMaintenanceNotices(onNotice: (notice: string) => void): () => void {
  listeners.add(onNotice);

  // 启动阶段攒下的那几句：交给第一个订阅者之后就从队列里拿走。
  // 只有首页会订阅，所以不存在「被谁抢走」的问题；万一将来有第二个订阅者，
  // 它拿不到这几句历史（只接新消息），这是有意的——同一条提示说两遍比漏说更糟。
  const backlog = pendingNotices.splice(0, pendingNotices.length);
  for (const notice of backlog) onNotice(notice);

  return () => {
    listeners.delete(onNotice);
  };
}

/**
 * 跑一遍日常维护，返回这一轮的结果，并把要说的话发给界面。
 *
 * 三件事各自内部都有 try/catch（失败只写日志、不抛错），
 * 所以这里不需要再包一层：任何一件失败都不该阻止另外两件。
 */
export function runDailyMaintenance(nowMs: number = Date.now()): MaintenanceOutcome {
  const settle = settleUpTo(nowMs);
  const grace = applyGraceIfNeeded(nowMs);
  const reward = grantMonthlyEventReward(nowMs);

  /*
   * 说话的顺序 = 发生的顺序。
   *
   * 结算那句在最前：它说的是「这几天/昨天怎么过的」，
   * 是这一轮里最需要被读到的背景；宽限券与月度奖励都是在这之后的动作。
   */
  const notices: string[] = [];
  if (settle.message) notices.push(settle.message);
  if (grace.message) notices.push(grace.message);
  if (reward.message) notices.push(reward.message);

  publish(notices);

  return { settle, grace, reward, notices, clockBack: settle.clockBack };
}
