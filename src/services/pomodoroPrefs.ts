/**
 * 番茄钟偏好的读写（D68）。
 *
 * 与 `services/journalPrefs.ts` 同一个形态：读吞掉错误、写抛错。
 */
import { getSettings, updateSettings } from '../db/repo/settings';
import {
  DEFAULT_POMODORO_PREFS,
  parsePomodoroPrefs,
  serializePomodoroPrefs,
  type PomodoroPrefs,
} from '../domain/pomodoroPrefs';

/** 读番茄钟偏好。读库失败或内容坏了都退回默认值，不抛错 */
export function getPomodoroPrefs(): PomodoroPrefs {
  try {
    return parsePomodoroPrefs(getSettings().pomodoro_prefs);
  } catch (err) {
    console.warn('[Ember] 读取番茄钟偏好失败，本次按默认值显示', err);
    return DEFAULT_POMODORO_PREFS;
  }
}

/**
 * 写番茄钟偏好。
 *
 * 写失败时**抛错**：这是用户主动的改动，他需要知道它没生效。
 */
export function savePomodoroPrefs(prefs: PomodoroPrefs): void {
  updateSettings({ pomodoroPrefs: serializePomodoroPrefs(prefs) });
}
