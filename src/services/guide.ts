/**
 * D1–D7 引导的接线层。
 *
 * 规则在 `domain/guide.ts`（纯函数：第几天、该不该显示哪张卡）。
 * 这里只做三件事：
 *
 *   1. 读设置与玩家，算出「今天是第几天」；
 *   2. 老库第一次读时**补上起算日**（迁移只加列，不替用户定日期）；
 *   3. 把当前该显示的那张卡交给界面。
 *
 * ---- 补锚点为什么放在这一层，不放在迁移里 ----
 *
 * 迁移只改结构。如果 v12→v13 直接把 `guide_start_date` 填成「今天」，
 * 那这个「今天」是**迁移执行的那一刻**——也就是用户升级后第一次打开 App 的时刻。
 * 两者在这次恰好相同，但把它们混在一起会让迁移带上业务判断，
 * 以后想改规则就得再写一条迁移去改数据。放在这里，改规则只是改代码。
 *
 * ---- 为什么起算日是「第一次打开 App」而不是「第一条打卡」----
 *
 * 见 `domain/guide.ts` 文件头。简单说：D2/D3/D5 都可能发生在第一次打卡之前，
 * 而「首次打卡日」可以被撤销，那时已经看过的卡会重播。
 */
import { getPlayerSnapshot, updatePlayer } from '../db/repo/player';
import { getSettings } from '../db/repo/settings';
import { effectiveToday } from '../domain/date';
import { cardOfDay, guideDayOf, shouldShowCard, type GuideCard } from '../domain/guide';

/** 引导的当前状态 */
export interface GuideState {
  /** 今天的业务日 */
  today: string;
  /** 第几天（1–7）。null = 引导期已经过去 */
  day: number | null;
  /** 今天该显示的卡。null = 今天不显示 */
  card: GuideCard | null;
}

/**
 * 读当前该显示的引导卡。
 *
 * `shownDay` 是界面自己维护的「这次会话已经展示过第几天」，
 * 传 null 表示这次还没展示过。它不存库——理由见 domain/guide.ts 文件头。
 *
 * 读库失败时返回「今天不显示」，而不是抛错：
 * 一张引导卡坏掉不该让首页变成「数据读不出来」。
 */
export function getGuideState(
  shownDay: number | null,
  nowMs: number = Date.now()
): GuideState {
  try {
    const settings = getSettings();
    const { today } = effectiveToday(
      nowMs,
      settings.day_start_hour,
      settings.last_settled_date
    );

    const player = getPlayerSnapshot();

    // 老库刚升上来：没有起算日。把今天定成第一天，写回去。
    // 写失败不影响这一次显示（下一次读还会再试）。
    let startDate = player.guideStartDate;
    if (!startDate) {
      try {
        updatePlayer({ guideStartDate: today });
        startDate = today;
      } catch (err) {
        console.warn('[Ember] 补引导起算日失败，本次按第 1 天显示', err);
        startDate = today;
      }
    }

    const day = guideDayOf(startDate, today);

    const show = shouldShowCard({
      day,
      onboardingDone: player.onboardingDone,
      shownDay,
    });

    return { today, day, card: show ? cardOfDay(day) : null };
  } catch (err) {
    console.warn('[Ember] 读取引导状态失败，本次不显示引导', err);
    return { today: '', day: null, card: null };
  }
}

/**
 * 把起算日设成今天。
 *
 * 只在**引导页刚做完**的那一刻调用一次。为什么需要：
 * 用户可能装完 App 之后隔了三天才走完引导三屏，而 `guide_start_date`
 * 是迁移/首次读库时补的——那时他还没看到「今天只要这一件也算数」。
 * 让 D1 从他真正进入 App 的那天开始，比让他一进来就跳到 D4 合理。
 *
 * 幂等：只在还没有起算日、或起算日在未来（时钟回拨过）时写。
 * 已经有起算日就不动它——否则重走一遍引导会把 D1 重播。
 */
export function anchorGuideStart(nowMs: number = Date.now()): void {
  try {
    const settings = getSettings();
    const { today } = effectiveToday(
      nowMs,
      settings.day_start_hour,
      settings.last_settled_date
    );

    const player = getPlayerSnapshot();
    if (player.guideStartDate && player.guideStartDate <= today) return;

    updatePlayer({ guideStartDate: today });
  } catch (err) {
    console.warn('[Ember] 设定引导起算日失败', err);
  }
}
