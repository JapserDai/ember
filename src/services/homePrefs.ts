/**
 * 首页偏好的读写（D62）。
 *
 * 纯规则在 `domain/homePrefs.ts`，这里只做两件事：
 * 从 `settings.home_prefs` 读出来、把改动写回去。
 *
 * ---- 为什么读要吞掉错误 ----
 *
 * 首页每次聚焦都会调它。库读不出来时（迁移没跑、连接没开）
 * 抛错会让整页白屏，而「首页偏好」只影响几个区块显不显示——
 * 它不该有让页面挂掉的权力。所以读失败一律退回默认值，
 * 与 `services/today.ts` 的 `getSafeDayStartHour` 同一个判断。
 */
import { getSettings, updateSettings } from '../db/repo/settings';
import {
  DEFAULT_HOME_PREFS,
  parseHomePrefs,
  serializeHomePrefs,
  type HomePrefs,
} from '../domain/homePrefs';

/** 读首页偏好。读库失败或内容坏了都退回默认值，不抛错 */
export function getHomePrefs(): HomePrefs {
  try {
    return parseHomePrefs(getSettings().home_prefs);
  } catch (err) {
    console.warn('[Ember] 读取首页偏好失败，本次按默认值显示', err);
    return DEFAULT_HOME_PREFS;
  }
}

/**
 * 写首页偏好。
 *
 * **先写库、再让调用方改内存态**（与 ThemeProvider 的 reduceMotion 同一个规矩）：
 * 反过来的话，写库失败时界面已经变了，用户会以为设置成功，
 * 下次打开却变回去——一个会自己忘事的设置比不能改更糟。
 *
 * 写失败时**抛错**（不像读那样吞掉）：这是一次用户主动的改动，
 * 他需要知道它没生效。
 */
export function saveHomePrefs(prefs: HomePrefs): void {
  updateSettings({ homePrefs: serializeHomePrefs(prefs) });
}
