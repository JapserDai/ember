/**
 * 首页偏好（D62）。
 *
 * ---- 为什么它不是一个 domain 文件 ----
 *
 * 它要**读库**（`settings.home_prefs`），而 domain 层不许碰数据库。
 * 纯的那一半（解析、钳制、默认值）在下面，可以单独测；
 * 读与写各自只有一个函数，走的是仓库层。
 *
 * ---- 为什么是一列 JSON，不是五列 ----
 *
 * 这五项全是「首页长什么样」：月历要不要显示、火带要不要显示、
 * 「左滑可以删」那行提示要不要显示、待办最多几条。它们没有一列参与
 * 结算、查询条件或索引——一个从不被 WHERE 引用的列，拆细没有收益。
 * 而拆成五列意味着加第六项时要再改一次 CHECK + 迁移 + 备份白名单三处，
 * 每一处漏了都不会报错。
 *
 * ---- 兜底的口径 ----
 *
 * 解析失败、字段类型不对、数值越界——**一律退回默认值，不抛错**。
 * 理由与 `getSafeDayStartHour` 相同：首页偏好只影响「长什么样」，
 * 不影响任何数值，而一个坏掉的偏好串不该让首页白屏。
 *
 * 反过来的代价要说清：**用户手改坏了这一列，他不会看到任何报错**，
 * 只会发现首页回到了默认的样子。这是可接受的，因为他本来就没有
 * 任何入口能改这一列（只有设置页的开关）。
 */

/** 待办最多显示几条。`null` 表示「全部」 */
export type TodoLimit = 3 | 5 | null;

export interface HomePrefs {
  /** 首页是否显示月历（D57） */
  showCalendar: boolean;
  /** 首页是否显示火带（今日进度） */
  showHearth: boolean;
  /**
   * 首页是否显示「左滑可以删」那行提示。
   *
   * 默认 true：左滑是隐藏手势，没有这句提示新用户不会发现。
   * 但用熟了之后它是一句占位的噪音，所以给一个开关。
   */
  showSwipeHint: boolean;
  /** 首页最多显示几条待办。默认 3（与 D55 之前的行为一致） */
  todoLimit: TodoLimit;
}

/**
 * 默认值。
 *
 * 全部取「D62 之前的实际行为」：
 *   - 月历显示（上一轮刚加）
 *   - 火带显示
 *   - 左滑提示显示
 *   - 待办 3 条
 *
 * 这样老库升级上来（`home_prefs = '{}'`）看到的首页与升级前**逐像素一致**。
 * 任何「升级顺手改个默认」的念头都要在这里被挡住：用户没要求过的事，
 * 不该因为一次升级而变样。
 */
export const DEFAULT_HOME_PREFS: HomePrefs = {
  showCalendar: true,
  showHearth: true,
  showSwipeHint: true,
  todoLimit: 3,
};

/** 待办条数的三个选项，给设置页渲染用 */
export const TODO_LIMIT_OPTIONS: ReadonlyArray<{ value: TodoLimit; label: string }> = [
  { value: 3, label: '3 条' },
  { value: 5, label: '5 条' },
  { value: null, label: '全部' },
];

/** 只接受这三种取值，其余一律退回默认 */
function normalizeTodoLimit(value: unknown): TodoLimit {
  if (value === null) return null;
  if (value === 3 || value === 5) return value;
  return DEFAULT_HOME_PREFS.todoLimit;
}

/**
 * 解析 `settings.home_prefs` 里的 JSON 串。
 *
 * 纯函数，不读库——所以这一整套规则可以在没有 SQLite 的环境里测。
 *
 * 字段级兜底而不是整体兜底：一个用户手改坏了 `todoLimit`，
 * 不该把 `showCalendar: false` 也一起丢掉。
 */
export function parseHomePrefs(raw: string | null | undefined): HomePrefs {
  if (typeof raw !== 'string' || raw.trim().length === 0) return DEFAULT_HOME_PREFS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 不是合法 JSON：整列当作「没设置过」。
    // 不尝试修复——猜一个用户想写什么，比直接用默认值更容易出错
    return DEFAULT_HOME_PREFS;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_HOME_PREFS;
  }

  const obj = parsed as Record<string, unknown>;

  return {
    showCalendar:
      typeof obj.showCalendar === 'boolean' ? obj.showCalendar : DEFAULT_HOME_PREFS.showCalendar,
    showHearth: typeof obj.showHearth === 'boolean' ? obj.showHearth : DEFAULT_HOME_PREFS.showHearth,
    showSwipeHint:
      typeof obj.showSwipeHint === 'boolean'
        ? obj.showSwipeHint
        : DEFAULT_HOME_PREFS.showSwipeHint,
    todoLimit: normalizeTodoLimit(obj.todoLimit),
  };
}

/**
 * 把偏好序列化回库里的形状。
 *
 * 只写**与默认值不同**的字段。
 *
 * 为什么：`{}` 的语义是「全用代码默认」，所以用户把开关拨回默认之后，
 * 库里应该回到 `{}` 而不是 `{"showCalendar":true,...}`。
 * 好处是**将来改默认值**时，没有主动设置过的人会跟着新默认走；
 * 而那些明确关掉过月历的人，库里留着 `{"showCalendar":false}`，不会被改掉。
 * 这是一条很容易被写反的细节：全量序列化会让「升级后的新默认」永远影响不到老用户。
 */
export function serializeHomePrefs(prefs: HomePrefs): string {
  const out: Record<string, unknown> = {};
  if (prefs.showCalendar !== DEFAULT_HOME_PREFS.showCalendar) out.showCalendar = prefs.showCalendar;
  if (prefs.showHearth !== DEFAULT_HOME_PREFS.showHearth) out.showHearth = prefs.showHearth;
  if (prefs.showSwipeHint !== DEFAULT_HOME_PREFS.showSwipeHint) out.showSwipeHint = prefs.showSwipeHint;
  if (prefs.todoLimit !== DEFAULT_HOME_PREFS.todoLimit) out.todoLimit = prefs.todoLimit;
  return JSON.stringify(out);
}

/** 两份偏好是否完全相同。设置页用它决定「这一项是不是当前选中」 */
export function samePrefs(a: HomePrefs, b: HomePrefs): boolean {
  return (
    a.showCalendar === b.showCalendar &&
    a.showHearth === b.showHearth &&
    a.showSwipeHint === b.showSwipeHint &&
    a.todoLimit === b.todoLimit
  );
}
