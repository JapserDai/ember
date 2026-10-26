/**
 * 日记偏好（D65）。
 *
 * 与 `homePrefs.ts` 同一个形态：纯解析 / 序列化在这里，读写走 services。
 *
 * ---- 为什么单独一列，不并进 `home_prefs` ----
 *
 * `home_prefs` 的语义是「**首页**长什么样」。日记的三项（字数上限、
 * 历史显示几条、是否显示字数计数）说的是「**日记页**怎么工作」，
 * 其中「字数上限」甚至影响写进库的内容——它不是外观偏好。
 * 混进 `home_prefs` 会让那一列的名字开始说谎。
 *
 * ---- 为什么三项都不影响已有数据 ----
 *
 * 字数上限只影响**之后**写的内容：已经存下的长日记不会被截断
 * （它们是用户写过的事实）。历史显示几条只影响读多少行。
 * 这两条都要在设置页上写清楚，否则用户会以为「我调到 500，
 * 以前写的 2000 字会变成 500」。
 */

/** 字数上限三档。`JOURNAL_MAX_HARD` 是 domain 里的硬上限 */
export type JournalLimit = 500 | 2000 | 5000;

/** 历史列表显示几条。`null` = 全部 */
export type JournalHistoryLimit = 30 | 60 | null;

export interface JournalPrefs {
  /** 一天的日记最多多少字。默认 2000（与 D65 之前一致） */
  bodyLimit: JournalLimit;
  /** 日记页历史列表显示几条。默认 60 */
  historyLimit: JournalHistoryLimit;
  /** 是否显示「120 / 2000」那个字数计数。默认显示 */
  showCounter: boolean;
}

/**
 * 默认值 = D65 之前的实际行为。
 *
 * 与 `DEFAULT_HOME_PREFS` 同一个规矩：老库升级上来看到的东西
 * 必须与升级前逐像素一致。改默认值是另一件事，要单独决定。
 */
export const DEFAULT_JOURNAL_PREFS: JournalPrefs = {
  bodyLimit: 2000,
  historyLimit: 60,
  showCounter: true,
};

/** 字数上限的三个选项，给设置页渲染用 */
export const JOURNAL_LIMIT_OPTIONS: ReadonlyArray<{ value: JournalLimit; label: string }> = [
  { value: 500, label: '500 字' },
  { value: 2000, label: '2000 字' },
  { value: 5000, label: '5000 字' },
];

/** 历史条数的三个选项 */
export const JOURNAL_HISTORY_OPTIONS: ReadonlyArray<{
  value: JournalHistoryLimit;
  label: string;
}> = [
  { value: 30, label: '30 条' },
  { value: 60, label: '60 条' },
  { value: null, label: '全部' },
];

function normalizeLimit(value: unknown): JournalLimit {
  if (value === 500 || value === 2000 || value === 5000) return value;
  return DEFAULT_JOURNAL_PREFS.bodyLimit;
}

function normalizeHistory(value: unknown): JournalHistoryLimit {
  if (value === null) return null;
  if (value === 30 || value === 60) return value;
  return DEFAULT_JOURNAL_PREFS.historyLimit;
}

/**
 * 解析 `settings.journal_prefs`。
 *
 * 与 `parseHomePrefs` 同一套兜底规则：**字段级**回退，坏一个字段
 * 不拖累同一行里别的正确设置；整列不是合法 JSON 时才整列回默认。
 */
export function parseJournalPrefs(raw: string | null | undefined): JournalPrefs {
  if (typeof raw !== 'string' || raw.trim().length === 0) return DEFAULT_JOURNAL_PREFS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_JOURNAL_PREFS;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return DEFAULT_JOURNAL_PREFS;
  }

  const obj = parsed as Record<string, unknown>;

  return {
    bodyLimit: normalizeLimit(obj.bodyLimit),
    historyLimit: normalizeHistory(obj.historyLimit),
    showCounter:
      typeof obj.showCounter === 'boolean'
        ? obj.showCounter
        : DEFAULT_JOURNAL_PREFS.showCounter,
  };
}

/**
 * 序列化：**只写与默认值不同的字段**。
 *
 * 理由与 `serializeHomePrefs` 完全相同——`{}` 的语义是「全用代码默认」，
 * 这样将来改默认值时，没有主动设置过的人会跟着新默认走。
 */
export function serializeJournalPrefs(prefs: JournalPrefs): string {
  const out: Record<string, unknown> = {};
  if (prefs.bodyLimit !== DEFAULT_JOURNAL_PREFS.bodyLimit) out.bodyLimit = prefs.bodyLimit;
  if (prefs.historyLimit !== DEFAULT_JOURNAL_PREFS.historyLimit) {
    out.historyLimit = prefs.historyLimit;
  }
  if (prefs.showCounter !== DEFAULT_JOURNAL_PREFS.showCounter) out.showCounter = prefs.showCounter;
  return JSON.stringify(out);
}

/** 两份偏好是否完全相同 */
export function sameJournalPrefs(a: JournalPrefs, b: JournalPrefs): boolean {
  return (
    a.bodyLimit === b.bodyLimit &&
    a.historyLimit === b.historyLimit &&
    a.showCounter === b.showCounter
  );
}

/**
 * 历史条数 → `getJournalView` 要的 `historyLimit` 参数。
 *
 * `null`（全部）映射成一个足够大的数而不是 `Infinity`：
 * `listJournalEntries` 里会做 `Math.trunc(limit)`，`Infinity` 会让
 * SQL 的 `LIMIT ?` 收到一个不可绑定的值。
 *
 * 10000 是「实际上等于全部」的那个数——一个人的日记一天一条，
 * 写 27 年才到 10000 条，而到那时这条查询本身已经不是问题。
 */
export function historyLimitToNumber(limit: JournalHistoryLimit): number {
  return limit === null ? 10000 : limit;
}
