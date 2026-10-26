/**
 * 番茄钟的纯规则（D68）。不碰 React、不碰数据库、不读系统时间——
 * 「现在几号」由调用方算好传进来，仓库外的 Node 测试可以直接 import 这个文件。
 *
 * ---- 为什么把它从停车场拿出来 ----
 *
 * docs/05 §12 把「番茄钟」停在停车场。用户明确点名要这个功能，
 * 这就是那条规则里说的「当前阶段明确需要」——按规矩正式拿出来，
 * 并在 DECISIONS.md 记为 D68。
 *
 * ---- 与其他功能的边界 ----
 *
 * 番茄钟是**计时器**，不是**记录**：
 *   - 「今天专注了多久」这个事实，只有完成的番茄才有资格留下，
 *     而它自己存自己（`pomodoros` 表），**不碰 checkins / tasks / XP / 余烬**。
 *     一条 25 分钟的专注不等于一次打卡——前者是时间，后者是行动。
 *   - 不做任务绑定：绑了任务，番茄就会变成「给任务计时的打卡」，
 *     与打卡产生两套完成语义。D7（不评判）在计时上的读法是：
 *     计时器只说「过去了多久」，不说「你完成了什么」。
 *   - 不做白噪音、不做统计图表、不做跨天汇总。日汇总只有今天一个数。
 */

/** 一档番茄的配置 */
export interface PomodoroPhase {
  /** 档位标识 */
  key: PomodoroPhaseKey;
  /** 界面上显示的名字 */
  label: string;
  /** 时长（毫秒） */
  durationMs: number;
}

/** 三个档位。BPM = 「每分钟一次轻点」的起搏器档 */
export type PomodoroPhaseKey = 'focus' | 'break' | 'bpm';

/** 三档。常量给页面渲染用，`getPomodoroPhase` 给计算用 */
export const POMODORO_PHASES: readonly PomodoroPhase[] = [
  { key: 'focus', label: '专注 25 分钟', durationMs: 25 * 60 * 1000 },
  { key: 'break', label: '休息 5 分钟', durationMs: 5 * 60 * 1000 },
  { key: 'bpm', label: '起搏 1 分钟', durationMs: 60 * 1000 },
] as const;

/** 每档持续多久（毫秒）。给 domain 内部计算用 */
const PHASE_MS: Record<PomodoroPhaseKey, number> = {
  focus: POMODORO_PHASES[0].durationMs,
  break: POMODORO_PHASES[1].durationMs,
  bpm: POMODORO_PHASES[2].durationMs,
};

/** 默认档。番茄钟的常客是专注档 */
export const DEFAULT_POMODORO_PHASE: PomodoroPhaseKey = 'focus';

/** 每天最多记多少个完成的番茄。与提醒的 20 条同一条理由：给失控设天花板 */
export const POMODORO_DAILY_CAP = 30;

/**
 * 某一档从 `startAt` 起是否已经走完（并算了走到哪儿）。
 *
 * - `ended`：这一段已经到点（无论中间有没有暂停过）；
 * - `progress`（0–1）：已进行的比例，暂停时间不算「进行」。
 *   计算式：进度 = (走了的时间 - 暂停掉的时间) / 总时长。
 *   调用方把「暂停掉的时间」累进 `pausedMs` 传进来，这里不猜。
 */
export function phaseProgress(input: {
  phase: PomodoroPhaseKey;
  startAt: number;
  pausedMs: number;
  now: number;
}): { ended: boolean; progress: number; remainingMs: number } {
  const total = PHASE_MS[input.phase];
  const elapsed = Math.max(0, input.now - input.startAt) - Math.max(0, input.pausedMs);
  const clamped = Math.min(Math.max(elapsed, 0), total);
  return {
    ended: elapsed >= total,
    progress: clamped / total,
    remainingMs: Math.max(0, total - clamped),
  };
}

/**
 * 还原一个快照到「此刻」的实时状态。
 *
 * 快照存的是**事实**（起点、暂停了多久、暂停从何时开始），
 * 这里只做代数，不读时钟——`now` 由界面给，测试给固定值。
 */
export function livePomodoroState(
  snapshot: PomodoroSnapshot | null,
  now: number
): LivePomodoro | null {
  if (!snapshot) return null;
  if (snapshot.pausedAt !== null) {
    // 暂停中：进度冻结在「暂停那一刻」。
    // 冻结点用的暂停时长是**已累计**的 pausedMs——不能把 now - pausedAt
    // 也算进去：那是「未来的暂停」，扣在过去的时刻上，进度会随 now 越走越少
    const p = phaseProgress({
      phase: snapshot.phase,
      startAt: snapshot.startAt,
      pausedMs: snapshot.pausedMs,
      now: snapshot.pausedAt,
    });
    return { phase: snapshot.phase, running: false, ...p };
  }
  const p = phaseProgress({
    phase: snapshot.phase,
    startAt: snapshot.startAt,
    pausedMs: snapshot.pausedMs,
    now,
  });
  return { phase: snapshot.phase, running: true, ...p };
}

/** 一条「正在跑/曾跑过」的番茄的事实快照（与 pomodoros 表的进行中行同构） */
export interface PomodoroSnapshot {
  id: string;
  phase: PomodoroPhaseKey;
  /** 这次番茄的业务日（开始那一刻的 today，跨日结算跟着它走） */
  localDate: string;
  startAt: number;
  /** 已累计的暂停时长（毫秒） */
  pausedMs: number;
  /** 暂停开始的那一刻。null = 正在走 */
  pausedAt: number | null;
}

/** 界面要的实时状态：livePomodoroState 的返回 */
export interface LivePomodoro {
  phase: PomodoroPhaseKey;
  running: boolean;
  ended: boolean;
  /** 0–1 */
  progress: number;
  remainingMs: number;
}

/**
 * 一次番茄完成时的落库草稿。
 *
 * `elapsedMs` 在调用方算：完成那一刻 `now - startAt - pausedMs`
 * 减去暂停尾巴（`now - pausedAt`）。这里不替调用方算，
 * 因为「完成」这个判断发生在界面（interval 的 tick）， domain 只收结果。
 */
export interface CompletedPomodoroDraft {
  phase: PomodoroPhaseKey;
  localDate: string;
  startAt: number;
  completedAt: number;
  /** 实际专注的毫秒数（扣掉全部暂停） */
  elapsedMs: number;
}

/**
 * 校验一条完成记录。
 *
 * 三条硬规矩：
 *   1. `elapsedMs` 必须落在 (0, 档位时长 × 1.2]——比额定还长出两成以上
 *      只可能是数据坏了（暂停没记上），按坏数据处理；
 *   2. `completedAt >= startAt`，时间不能倒流；
 *   3. 业务日格式必须对（与 journal_entries 同一个 GLOB 口径，在表上也有 CHECK）。
 */
export function validateCompletedPomodoro(
  draft: CompletedPomodoroDraft
): { ok: true } | { ok: false; reason: 'BAD_ELAPSED' | 'BAD_TIME' | 'BAD_DATE' } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.localDate)) return { ok: false, reason: 'BAD_DATE' };
  if (draft.completedAt < draft.startAt) return { ok: false, reason: 'BAD_TIME' };
  const max = PHASE_MS[draft.phase] * 1.2;
  if (!(draft.elapsedMs > 0 && draft.elapsedMs <= max)) {
    return { ok: false, reason: 'BAD_ELAPSED' };
  }
  return { ok: true };
}

/**
 * 「今天 N / M」的分母：今天实际走完的番茄数。
 *
 * 这是展示层的口径，不是数据的——数据层只报事实（几条、总毫秒），
 * 「今天专注了 N 个」怎么读出来是这里的事。
 */
export function pomodoroTodaySummary(count: number, totalMs: number): {
  count: number;
  /** 四舍五入到整分钟（低于 1 分钟报 0——它太小，不值得为它骗人） */
  minutes: number;
  /** 是否顶到了当日上限（顶到就不许再记了） */
  atCap: boolean;
} {
  return {
    count,
    // 低于 1 分钟报 0：半分钟的专注报「1 分钟」是在替人凑数。
    // 1 分钟以上按最近的一分钟算（四舍五入）
    minutes: totalMs >= 60000 ? Math.round(totalMs / 60000) : 0,
    atCap: count >= POMODORO_DAILY_CAP,
  };
}
