/**
 * 番茄钟的编排层（D68）。
 *
 * ---- 与其他 service 的分工 ----
 *
 * 计时的实时状态（现在走到哪儿了）在 domain/pomodoro.ts（纯函数），
 * 组件自己拿 interval 驱动；这里只管两件要写库的事：
 *   1. 完成时落一行事实（带当日上限与校验）；
 *   2. 读数（今天完成了几个 / 专注了多久）。
 *
 * ---- 为什么不写「进行中」的番茄 ----
 *
 * 进行中的番茄活在组件的 state 里。存库意味着要处理
 * 「App 被杀后那行怎么办」——半途而废的专注不是用户做过的事，
 * 重启后「从零开始」比「还剩 18 分钟」诚实。代价明摆着：
 * 后台放 25 分钟再回来会白跑。这不是疏忽，是这个 App 对
 * 「记录 = 做过的事实」这条底线的延伸（与 checkins 同一条哲学）。
 */
import { getPlayerSnapshot } from '../db/repo/player';
import {
  getPomodoroDailyTotals,
  insertPomodoro,
} from '../db/repo/pomodoros';
import {
  POMODORO_DAILY_CAP,
  validateCompletedPomodoro,
  pomodoroTodaySummary,
  type CompletedPomodoroDraft,
} from '../domain/pomodoro';
import { runInTransaction } from '../db/client';

/** 落库结果 */
export type SavePomodoroResult =
  | { ok: true; count: number; minutes: number }
  | {
      ok: false;
      reason: 'AT_CAP' | 'BAD_ELAPSED' | 'BAD_TIME' | 'BAD_DATE' | 'FAILED';
      message: string;
    };

/**
 * 记一条完成的番茄。
 *
 * 事务里做两件事：读当日计数 → 插入。上限检查必须和插入在同一事务里，
 * 否则「最后一格被两个页面同时抢」这种事在理论上可能——虽然单线程 UI
 * 让它几乎不可能发生，但与打卡同一条规矩：写库的检查放事务里。
 */
export function saveCompletedPomodoro(
  draft: CompletedPomodoroDraft,
  pausedMs: number
): SavePomodoroResult {
  return runInTransaction(() => {
    // 先校验事实本身（时长 / 时间倒流 / 日期格式）
    const check = validateCompletedPomodoro(draft);
    if (!check.ok) {
      const message =
        check.reason === 'BAD_ELAPSED'
          ? '这段时长不对，没有记下来。'
          : check.reason === 'BAD_TIME'
            ? '时间倒流了，没有记下来。'
            : '日期不对，没有记下来。';
      return { ok: false as const, reason: check.reason, message };
    }

    try {
      const player = getPlayerSnapshot();
      const totals = getPomodoroDailyTotals(player.id, draft.localDate);

      // 当日上限：与提醒的 20 条同一条理由——给失控设天花板。
      // 30 个专注（约 12.5 小时）远超清醒时间的合理用法，到顶说明出了别的问题
      if (totals.count >= POMODORO_DAILY_CAP) {
        return {
          ok: false as const,
          reason: 'AT_CAP' as const,
          message: '今天记到上限了，去休息吧。',
        };
      }

      insertPomodoro({ playerId: player.id, draft, pausedMs });

      const next = getPomodoroDailyTotals(player.id, draft.localDate);
      const summary = pomodoroTodaySummary(next.count, next.totalMs);
      return { ok: true as const, count: summary.count, minutes: summary.minutes };
    } catch (err) {
      console.warn('[Ember] 保存番茄钟记录失败', err);
      return {
        ok: false as const,
        reason: 'FAILED' as const,
        message: '刚才没记下来，再试一次。',
      };
    }
  });
}

/** 读今天的完成情况。读失败退回全零（页面上还有别的东西要看，不能白屏） */
export function getPomodoroToday(localDate: string): {
  count: number;
  minutes: number;
  atCap: boolean;
} {
  try {
    const player = getPlayerSnapshot();
    const totals = getPomodoroDailyTotals(player.id, localDate);
    return pomodoroTodaySummary(totals.count, totals.totalMs);
  } catch (err) {
    console.warn('[Ember] 读取番茄钟今日统计失败', err);
    return { count: 0, minutes: 0, atCap: false };
  }
}
