/**
 * 日记偏好的读写（D65）。
 *
 * 与 `services/homePrefs.ts` 同一个形态：读吞掉错误、写抛错。
 */
import { getSettings, updateSettings } from '../db/repo/settings';
import {
  DEFAULT_JOURNAL_PREFS,
  parseJournalPrefs,
  serializeJournalPrefs,
  type JournalPrefs,
} from '../domain/journalPrefs';

/** 读日记偏好。读库失败或内容坏了都退回默认值，不抛错 */
export function getJournalPrefs(): JournalPrefs {
  try {
    return parseJournalPrefs(getSettings().journal_prefs);
  } catch (err) {
    console.warn('[Ember] 读取日记偏好失败，本次按默认值显示', err);
    return DEFAULT_JOURNAL_PREFS;
  }
}

/**
 * 写日记偏好。
 *
 * 写失败时**抛错**：这是用户主动的改动，他需要知道它没生效。
 */
export function saveJournalPrefs(prefs: JournalPrefs): void {
  updateSettings({ journalPrefs: serializeJournalPrefs(prefs) });
}
