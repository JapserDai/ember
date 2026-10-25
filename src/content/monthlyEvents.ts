/**
 * 月度小活动（阶段 5 第 1 条）。
 *
 * ---- 它是什么 ----
 *
 * 每月 1 个主题 + 3 个目标 + 1 个材料奖励。内容写在本地常量里。
 *
 * ---- 它不是什么 ----
 *
 *   - **不是任务清单**。三个「目标」是三个**方向**，不是三件要做的事。
 *     它们不产生 checkin、不参与进度、不打卡。
 *   - **不是限时活动**。过了这个月它不会消失得「你错过了」——
 *     它只是下个月会换成另一组。
 *   - **不惩罚**。一个月一个都没碰，什么都不会发生。
 *
 * ---- 为什么「奖励 1 个材料」而不是余烬 ----
 *
 * 材料是硬货币，唯一用途是修连胜（标准/硬核档）。
 * 把它当活动奖励，等于「参与这件事，下次断签时能救一次」——
 * 那是一个有意义的兑换关系。而余烬是软的、日常就能攒，做奖励没有分量。
 *
 * 奖励怎么发：**不需要领**。这个月有记录 → 月末自动进账。
 * 「领取」是一个多余的动作，它会制造一个「我忘了领」的焦虑。
 *
 * 本文件是纯内容与纯函数：不碰数据库。
 */

/** 一个月的活动 */
export interface MonthlyEvent {
  /** 月份 1–12 */
  month: number;
  /** 主题。一句短话，不是标题 */
  theme: string;
  /** 三个方向。每个一句话，**不是任务** */
  goals: readonly string[];
  /** 这个月有记录就发几个材料 */
  rewardMaterial: number;
}

/**
 * 十二个月的活动。
 *
 * 主题都取「这个月本来就会发生的事」，而不是「这个月你该做什么」。
 * 前者是提醒你注意，后者是给你派活。
 */
export const MONTHLY_EVENTS: readonly MonthlyEvent[] = [
  {
    month: 1,
    theme: '一年里最安静的那个月',
    goals: ['把去年留下的一样东西处理掉', '给一个人打个电话', '有一整天什么都不安排'],
    rewardMaterial: 1,
  },
  {
    month: 2,
    theme: '短月，可以慢一点',
    goals: ['把一件拖了很久的小事做完', '早睡一次', '整理一个抽屉'],
    rewardMaterial: 1,
  },
  {
    month: 3,
    theme: '开始化开',
    goals: ['开一次窗，站一会儿', '把冬天的东西收起来', '开始一件新的事，很小的一件'],
    rewardMaterial: 1,
  },
  {
    month: 4,
    theme: '白天在变长',
    goals: ['在户外待满二十分钟', '把一件旧事重新捡起来', '给别人帮一个小忙'],
    rewardMaterial: 1,
  },
  {
    month: 5,
    theme: '最好的那几周',
    goals: ['去一个没去过的地方，很近也算', '把想做的事写下来', '和一个人好好吃一顿饭'],
    rewardMaterial: 1,
  },
  {
    month: 6,
    theme: '一年过半',
    goals: ['回头看一眼年初想的事', '把一件事收个尾', '给自己留一个空白的下午'],
    rewardMaterial: 1,
  },
  {
    month: 7,
    theme: '热的时候慢下来',
    goals: ['把一件每天做的事换个时间', '喝够水', '有一晚不开灯坐一会儿'],
    rewardMaterial: 1,
  },
  {
    month: 8,
    theme: '还在夏天里',
    goals: ['把一件没做完的事捡起来', '丢掉三样不再需要的东西', '给一个人写几句话'],
    rewardMaterial: 1,
  },
  {
    month: 9,
    theme: '开始有凉意',
    goals: ['把作息往回挪一点', '整理一次桌面', '开始记一件新的事'],
    rewardMaterial: 1,
  },
  {
    month: 10,
    theme: '收',
    goals: ['把今年做过的几件事列出来', '给一个很久没联系的人发条消息', '把一件该结束的事结束掉'],
    rewardMaterial: 1,
  },
  {
    month: 11,
    theme: '天黑得早了',
    goals: ['把灯开早一点', '把一件小事做成习惯', '给自己留一个什么都不做的晚上'],
    rewardMaterial: 1,
  },
  {
    month: 12,
    theme: '一年快过完了',
    goals: ['把这一年看一遍', '把没做完的事留着，不用现在做', '和一个人好好过一天'],
    rewardMaterial: 1,
  },
];

/** 按月份取活动。月份非法时返回 null */
export function eventOfMonth(month: number): MonthlyEvent | null {
  if (!Number.isFinite(month)) return null;
  const m = Math.floor(month);
  if (m < 1 || m > 12) return null;
  return MONTHLY_EVENTS.find((event) => event.month === m) ?? null;
}

/**
 * 这个月能不能拿到奖励。
 *
 * 规则只有一条：**这个月至少有一条记录**。
 *
 * 为什么门槛这么低：活动的目的是「让你注意到这个月」，
 * 不是「让你完成三件事」。三个方向是给你看的，不是给你交的。
 * 如果要求完成它们，那就变成了一张月度的任务清单——
 * 而那正是这个 App 反复要避开的东西。
 */
export function qualifiesForReward(checkinsThisMonth: number): boolean {
  return Math.max(0, Math.floor(checkinsThisMonth)) > 0;
}
