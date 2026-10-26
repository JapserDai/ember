/**
 * 番茄钟偏好（D68）。
 *
 * 与 `homePrefs.ts` / `journalPrefs.ts` 同一个形态：
 * 纯解析 / 序列化在这里，读写走 services，解析失败字段级退回默认值。
 *
 * ---- 为什么三项并成一列 JSON，而事实走新表 ----
 *
 * 见 schema.ts 迁移 18 的注释：偏好是**一行**（这个番茄钟默认开哪档），
 * 事实是**多行**（完成了哪些番茄），形状不同，不进同一个存储。
 */

/** 默认从哪一档开始。与 domain/pomodoro.ts 的常量同一个类型源 */
export type PomodoroPhaseKey = 'focus' | 'break' | 'bpm';

export interface PomodoroPrefs {
  /** 打开页面时默认选中的档。默认专注 25 分钟 */
  defaultPhase: PomodoroPhaseKey;
  /** 完成时是否响一声（用系统音，不引入音频库）。默认关 */
  soundEnabled: boolean;
  /** 一档走完是否自动开始下一档（专注→休息→专注）。默认关 */
  autoStartNext: boolean;
}

/**
 * 默认值 = D68 之前不存在这个功能的「中性开局」。
 *
 * 声音默认**关**：这个 App 的提醒刻意无声（D36——声音与横幅在说「你该做了」），
 * 番茄钟的完成音性质不同（它报的是「时间到了」，不是「你该做了」），
 * 但「默认出声」仍然违背这套基调，所以让它是一个用户主动的选择。
 */
export const DEFAULT_POMODORO_PREFS: PomodoroPrefs = {
  defaultPhase: 'focus',
  soundEnabled: false,
  autoStartNext: false,
};

/** 三个档位的选项，给设置页与番茄钟页渲染用 */
export const POMODORO_PHASE_OPTIONS: ReadonlyArray<{
  value: PomodoroPhaseKey;
  label: string;
}> = [
  { value: 'focus', label: '专注 25 分钟' },
  { value: 'break', label: '休息 5 分钟' },
  { value: 'bpm', label: '起搏 1 分钟' },
];

function normalizePhase(value: unknown): PomodoroPhaseKey {
  if (value === 'focus' || value === 'break' || value === 'bpm') return value;
  return DEFAULT_POMODORO_PREFS.defaultPhase;
}

/**
 * 解析 `settings.pomodoro_prefs`。
 *
 * 与 `parseHomePrefs` 同一套兜底：字段级回退，坏一个字段不拖累别的；
 * 整列不是合法 JSON 时才整列回默认。
 */
export function parsePomodoroPrefs(raw: string | null | undefined): PomodoroPrefs {
  if (typeof raw !== 'string' || raw.trim().length === 0) return DEFAULT_POMODORO_PREFS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_POMODORO_PREFS;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_POMODORO_PREFS;
  }

  const obj = parsed as Record<string, unknown>;

  return {
    defaultPhase: normalizePhase(obj.defaultPhase),
    soundEnabled:
      typeof obj.soundEnabled === 'boolean' ? obj.soundEnabled : DEFAULT_POMODORO_PREFS.soundEnabled,
    autoStartNext:
      typeof obj.autoStartNext === 'boolean'
        ? obj.autoStartNext
        : DEFAULT_POMODORO_PREFS.autoStartNext,
  };
}

/**
 * 序列化：**只写与默认值不同的字段**。
 *
 * 理由与 `serializeHomePrefs` 完全相同——`{}` 的语义是「全用代码默认」，
 * 将来改默认值时，没有主动设置过的人跟着新默认走。
 */
export function serializePomodoroPrefs(prefs: PomodoroPrefs): string {
  const out: Record<string, unknown> = {};
  if (prefs.defaultPhase !== DEFAULT_POMODORO_PREFS.defaultPhase) {
    out.defaultPhase = prefs.defaultPhase;
  }
  if (prefs.soundEnabled !== DEFAULT_POMODORO_PREFS.soundEnabled) {
    out.soundEnabled = prefs.soundEnabled;
  }
  if (prefs.autoStartNext !== DEFAULT_POMODORO_PREFS.autoStartNext) {
    out.autoStartNext = prefs.autoStartNext;
  }
  return JSON.stringify(out);
}

/** 两份偏好是否完全相同 */
export function samePomodoroPrefs(a: PomodoroPrefs, b: PomodoroPrefs): boolean {
  return (
    a.defaultPhase === b.defaultPhase &&
    a.soundEnabled === b.soundEnabled &&
    a.autoStartNext === b.autoStartNext
  );
}
