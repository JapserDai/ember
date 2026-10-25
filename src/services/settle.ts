/**
 * 惰性日结算的接线层。
 *
 * 规则在 `domain/settle.ts`（纯函数，能脱离数据库验），这里只负责
 * 「读设置 → 问 domain 该不该结算 → 写回」。写回只有两处：
 * `last_settled_date` 与 `max_seen_utc`。
 *
 * ---- 什么时候调用 ----
 *
 * 1. App 冷启动，`initDatabase()` 之后（`app/_layout.tsx` 的 bootstrap）
 * 2. 从后台回到前台（这一版没做：`AppState` 监听在阶段 2 的通知部分一起加）
 * 3. 导入数据完成后（导入还没做）
 *
 * 冷启动这一次最重要：它保证「隔了一周再打开」时，
 * `last_settled_date` 能正确推进，撤销保护（`canUndoCheckin`）不会误放行一周前的记录。
 *
 * ---- 为什么结算要单独成一个事务 ----
 *
 * 它写两张表（settings 的 last_settled_date 与 max_seen_utc 其实同一行，
 * 但读取了 checkins）。用事务是为了「算的时候看到的打卡数」与
 * 「写回的结算日」是同一时刻的快照——虽然单线程 UI 下几乎不可能撞上，
 * 但结算写错的代价是「一整天的记录被锁死不能再撤销」，值得包一层。
 */
import { runInTransaction } from '../db/client';
import { hasAnyCheckinOnDate } from '../db/repo/checkins';
import { bumpMaxSeenUtc, getSettings, updateLastSettledDate } from '../db/repo/settings';
import { planSettlement, type SettleResult } from '../domain/settle';

/** 结算结果 + 一句可以直接给界面看的话（没有话时为 null） */
export interface SettleOutcome {
  result: SettleResult;
  /** 给界面的一句话。null 表示不需要说什么 */
  message: string | null;
  /** 系统时间被调回过去过。界面可以据此做一次静默的提示（这一版只说给日志） */
  clockBack: boolean;
}

/**
 * 结算到「现在」。
 *
 * 失败时返回一个「什么都没发生」的结果，不抛错：结算不该阻止 App 启动。
 * 调用方（`bootstrap()`）本来就在 try/catch 里，但这里自己兜住更好——
 * 结算失败与数据库打不开是两件事，前者不该让后者也被判定为失败。
 */
export function settleUpTo(nowMs: number = Date.now()): SettleOutcome {
  try {
    return runInTransaction(() => {
      const settings = getSettings();

      // 记下见过的最大时间戳。这一步**无论在不在结算都要做**：
      // 它是「时钟被调回去过」的唯一证据，只在结算日才有记录就太晚了。
      bumpMaxSeenUtc(nowMs);

      const result = planSettlement({
        nowMs,
        dayStartHour: settings.day_start_hour,
        lastSettledDate: settings.last_settled_date,
        // 只在真的要结算时才读库：planSettlement 保证 first_run / same_day /
        // clock_back 三种情况不会调用它
        hasRecordOn: (localDate) => hasAnyCheckinOnDate(localDate),
      });

      if (result.settled) {
        updateLastSettledDate(result.nextSettledDate);
      } else if (result.reason === 'first_run') {
        // 首次启动：把今天写进去。种子数据本来就会写，但老安装（v1 建库、
        // 在种子还是 NULL 的时候用过）可能真的是 NULL，这里补上
        updateLastSettledDate(result.nextSettledDate);
      }

      return {
        result,
        message: buildMessage(result),
        clockBack: result.reason === 'clock_back',
      };
    });
  } catch (err) {
    console.warn('[Ember] 日结算失败，本次跳过', err);
    return {
      result: {
        settled: false,
        reason: 'same_day',
        settledDate: null,
        gapDays: 0,
        hadRecord: false,
        previousSettledDate: null,
        nextSettledDate: '',
      },
      message: null,
      clockBack: false,
    };
  }
}

/**
 * 结算结果 → 一句人话。
 *
 * 单独抽出来而不是直接转调 `domain/settle.ts` 的 `settlementMessage`：
 * 这里还要处理「时钟回拨」那种 domain 不该知道的情况。
 * 回拨**不给用户看**——用户没有做错任何事，也没有任何可操作的补救，
 * 告诉他「你的手机时间不对」只会增加困惑。只写日志。
 */
function buildMessage(result: SettleResult): string | null {
  if (result.reason === 'clock_back') {
    console.warn('[Ember] 系统时间早于上次结算日，本次不结算', {
      previous: result.previousSettledDate,
      raw: result.nextSettledDate,
    });
    return null;
  }

  if (result.reason === 'first_run') {
    return null;
  }

  if (!result.settled) return null;

  if (result.hadRecord) return null;

  if (result.gapDays >= 7) return '回来就好。今天想从哪一件小事开始？';
  if (result.gapDays > 0) return '中间空了一阵子。今天还是这个时候，坐下来就好。';
  return '昨天空了一天。习惯不会因为一天就消失，今天想从哪一件小事重新开始？';
}
