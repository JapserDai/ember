/**
 * D1–D7 引导（阶段 6 第 7 条）。
 *
 * ---- 它是什么 ----
 *
 * 装完之后的头七天，每天最多出现一张小卡，说的是「这个 App 还能怎么用」。
 * 第七天给一份本周小结，第八天起不再出现。
 *
 * ---- 为什么是「每天一张」而不是「一次说完」----
 *
 * 一次说完的做法（一个五屏教程）会把「使用说明」和「开始用」分开，
 * 而用户装这个 App 是为了记事情，不是为了看说明书。
 * 每天一张的好处是：那一张永远出现在**它说到的那件事刚刚有意义的时候**
 * （第一次记完之后、第一次进我的页时），而且它只占一块卡片，不挡路。
 *
 * ---- 三条硬规则 ----
 *
 * 1. **不催。** 每张卡都有一个「知道了 / 以后再说」，点了当天不再出现。
 *    不看也不会挡住任何功能——它不是浮层、没有遮罩、没有必须点的按钮。
 * 2. **不补课。** 第三天没打开 App，第四天不会把 D3 和 D4 一起弹出来。
 *    按「今天是第几天」只挑一张，漏掉的就漏掉了。
 * 3. **不重复。** 同一张卡只出现一次。看过之后记在
 *    `player.guide_start_date` 之外的**进度**里……这里没有那一列，
 *    所以用「当天是否已经展示过」这一层内存状态 + 「第几天」这两个数
 *    就够了：第 n 天只看第 n 张，n 过去了就再也不看。
 *
 * 第 3 条是这里唯一的设计取舍，值得写清楚：**不存「看过哪几张」**。
 * 存的话要多一列（或一张表）+ 一次迁移 + 备份白名单，
 * 而它换来的只是「同一天重开 App 不再看到那张卡」——
 * 这件事用一个模块级的「今天已经展示过第几张」就够了，
 * 进程被杀之后重看一次同一张卡，代价是用户多读一句话。
 * 与「多一列就要多一条迁移、多一处备份白名单、多一个可能漏的地方」相比，
 * 这个取舍明显更划算（见 HANDOFF §2.2 铁律二）。
 *
 * ---- 为什么 D7 是「本周小结」而不是「称号第一周」----
 *
 * docs/02 §5.2 里 D7 写的是「获得称号『第一周』」。这一版没有这个称号：
 * 称号是按五维属性点解锁的（domain/titles.ts，D41），
 * 而「第一周」是一个按时间解锁的东西，两者混在一起会让称号的语义变浑。
 * 所以 D7 只给本周的数字，不发任何东西。
 *
 * 本文件是纯函数：不 import React、不碰数据库、不读系统时间。
 * 「第几天」由调用方算好传进来。
 */

/** 引导卡最多做到第几天 */
export const GUIDE_DAYS = 7;

/**
 * 一张引导卡。
 *
 * `day` 是它出现的第几天（1–7）。同一天只有一张。
 */
export interface GuideCard {
  day: number;
  /** 卡片标题。一句话，不超过 16 字 */
  title: string;
  /** 正文。两句话以内 */
  body: string;
  /** 主按钮文案。null 表示这张卡只有一个「知道了」 */
  actionLabel: string | null;
  /** 主按钮要做什么。null 表示这张卡没有主操作 */
  action: GuideAction | null;
}

/**
 * 卡片的主动作。**不是字符串命令**，而是几个明确的枚举——
 * 界面拿它决定跳哪一页、开哪个表单。写成字符串的话，
 * 拼错一个字母不会报错，只会静默变成一个点了没反应的按钮。
 */
export type GuideAction =
  /** 打开新建待办（极简表单） */
  | 'new-todo'
  /** 打开新建目标 */
  | 'new-goal'
  /** 打开我的页（看等级 / 余烬 / 连胜） */
  | 'open-me'
  /** 打开状态页（看等级 / 五维 / 称号，D48 起五维在这里） */
  | 'open-status'
  /** 打开周复盘 */
  | 'open-review';

/**
 * 七张卡。
 *
 * 顺序与 docs/02 §5.2 一致，只有两处刻意不同：
 *   - D4 原文是「给我的习惯设一个最小版本」，而这一版没有「最小版本」这个字段。
 *     硬做一个「最小版本」要加列 + 迁移 + 新建界面，而它服务的需求
 *     （状态不好时做少一点）现在可以用「难度」与「只记一件」覆盖。
 *     所以 D4 改成一句关于难度的事实，**不给按钮**——不做一个点了会
 *     跳到一个不存在的功能的入口。
 *   - D7 见文件头：只给数字，不发称号。
 *
 * 文案全部逐条过 `domain/text-rules.ts` 的禁用词表（有断言）。
 */
export const GUIDE_CARDS: readonly GuideCard[] = [
  {
    day: 1,
    title: '今天只要这一件也算数。',
    body: '不用把每一件都做完。火是按「今天动过没有」往前走的，不是按比例。',
    actionLabel: null,
    action: null,
  },
  {
    day: 2,
    title: '有些事只做一次。',
    body: '待办和习惯不一样：做完就划掉，不会每天出现。要不要放一件进来？',
    actionLabel: '放一件',
    action: 'new-todo',
  },
  {
    day: 3,
    title: '有些事要做很久。',
    body: '目标是一句话，任务挂在它下面。比如「把睡眠找回来」——它不需要今天就完成。',
    actionLabel: '写一个',
    action: 'new-goal',
  },
  {
    day: 4,
    title: '状态不好的日子，做少一点也可以。',
    body: '设置 → 节奏 → 难度，可以调成更温和的。它只影响每次记录拿多少，不影响记录本身。',
    actionLabel: null,
    action: null,
  },
  {
    day: 5,
    title: '这些是你走到今天的样子。',
    body: '等级、五维、连胜都只是读数。它们不评价你，只记录你把时间花在哪儿了。',
    actionLabel: '去看看',
    /*
     * D48：五维从「我的」页搬到了「状态」页，所以这个按钮也改跳那边。
     * 卡片仍然挂在「我的」页（GUIDE_HOST.me）——那句话说的是「这些」，
     * 而「这些」就是「我的」页上的等级、余烬与连胜；按钮才是去状态页的下一步。
     */
    action: 'open-status',
  },
  {
    day: 6,
    title: '明天给你看这一周的样子。',
    body: '一周的记录会攒成一份小结。什么都不用做，明天打开就有。',
    actionLabel: null,
    action: null,
  },
  {
    day: 7,
    title: '第一周过完了。',
    body: '这一周记下的次数、最常记的那一件，都在日记页里。以后每周过完都会有一份。',
    actionLabel: '看一眼',
    action: 'open-review',
  },
];

/**
 * 算「今天是第几天」。
 *
 * 入参：
 *   - `startDate` 起算日（业务日）。null 表示还没定锚点；
 *   - `today` 今天的业务日。
 *
 * 返回 1–7；超过 7 天返回 null（不再有引导）；起算日在未来（时钟回拨）
 * 也返回 null——那不是一个可解释的「第几天」，给 1 会让卡片倒着重播。
 *
 * **这一天算不算已经过完**不重要：D1 是「第一次记录之后」，
 * 而第 1 天与「第一次记录」在同一天里总是同时成立的。
 */
export function guideDayOf(startDate: string | null, today: string): number | null {
  if (!startDate) return null;
  if (!isDateKey(startDate) || !isDateKey(today)) return null;

  // 按日历天算，不用毫秒：业务日已经是 YYYY-MM-DD，直接算差
  const diff = dayDiff(startDate, today);
  if (diff < 0) return null;

  const day = diff + 1;
  if (day > GUIDE_DAYS) return null;
  return day;
}

/** 取第 n 天那张卡。超出范围返回 null */
export function cardOfDay(day: number | null): GuideCard | null {
  if (day === null) return null;
  return GUIDE_CARDS.find((card) => card.day === day) ?? null;
}

/**
 * 这一天该不该显示引导卡。
 *
 * 除了「在第 1–7 天里」，还要满足两个条件：
 *   1. 引导做完了（`onboardingDone`）——没做完时用户在引导页里，
 *      弹一张 D1 卡是两层引导叠在一起；
 *   2. 这张卡在这一天还没被展示过（`shownDay` 是上次展示的那一天）。
 *
 * `shownDay` 由调用方（界面的内存状态）维护，不存库——理由见文件头。
 */
export function shouldShowCard(input: {
  day: number | null;
  onboardingDone: boolean;
  /** 上一次已经展示过的「第几天」。null 表示这次会话还没展示过 */
  shownDay: number | null;
}): boolean {
  if (!input.onboardingDone) return false;
  if (input.day === null) return false;
  if (input.shownDay !== null && input.shownDay >= input.day) return false;
  return true;
}

/**
 * 两个业务日之间差几天（`b - a`）。
 *
 * 与 `domain/date.ts` 的 `diffDays` 同方向（返回 b - a），
 * 但这里不 import 它：domain 内部模块互相依赖会让循环 import 变得可能，
 * 而这三行实现完全独立、不需要任何日期库。
 */
function dayDiff(a: string, b: string): number {
  const ma = Date.UTC(
    Number(a.slice(0, 4)),
    Number(a.slice(5, 7)) - 1,
    Number(a.slice(8, 10))
  );
  const mb = Date.UTC(
    Number(b.slice(0, 4)),
    Number(b.slice(5, 7)) - 1,
    Number(b.slice(8, 10))
  );
  return Math.round((mb - ma) / 86_400_000);
}

/** 业务日格式校验（与 domain/date.ts 的 isDateKey 同一口径，不 import） */
function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || value.length !== 10) return false;
  if (value[4] !== '-' || value[7] !== '-') return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  return true;
}
