/**
 * 周报导出（阶段 3 第 4 条）。
 *
 * ---- 为什么是文本，不是图片 ----
 *
 * docs/05 写的是「周报可导出为图片」，而验收标准是「周报图片能正常导出
 * 且中文不截断」。做这一条时遇到一个具体障碍：图片导出要
 * `react-native-view-shot`，而它**没有装**，装它要跑
 * `npx expo install react-native-view-shot`。
 *
 * 这个决定分两步走（D39）：
 *
 *   1. **现在做文本版。** 用已经装着的 `expo-sharing` 把周报当纯文本分享出去
 *      （微信、备忘录、邮件都能收）。零新依赖、零新权限，
 *      而「把这周小结发给自己」这件事本身已经成立。
 *   2. **图片版等那一条 install。** 代码里已经留好 `exportWeekReportAsImage`
 *      的形状，装上包之后只需要把渲染与截图补上，不用改调用方。
 *
 * ---- 为什么不做「先渲染成 SVG 再存文件」这类绕路 ----
 *
 * 试过在脑子里绕过依赖：把周报画成 SVG 字符串、写成 .svg 文件分享出去。
 * 但多数聊天软件不接受 .svg，用户拿到一个打不开的文件比拿到一段文字更糟。
 * 文字在**所有**能接收分享的地方都能读——这是它比图片更稳的地方。
 *
 * ---- 文本版长什么样 ----
 *
 * 一份周报就是一段人能直接读的话，不是一份 JSON：
 *
 *   这一周（10 月 19 日 – 25 日）
 *   有 4 天动过，记了 11 次。
 *   最常记的是「喝水」。
 *   时间花在：体魄、心智。
 *
 *   这周有哪件事想留着？
 *   周三晚上那顿慢慢吃完的饭。
 *
 * 不写「完成率」，不写「比上周」，与复盘页同一个立场。
 */
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { getSettings } from '../db/repo/settings';
import { effectiveToday } from '../domain/date';
import {
  REVIEW_QUESTIONS,
  formatWeekRange,
  weekKeyOf,
} from '../domain/review';
import { getReviewView } from './review';
import { getStatsData } from './stats';

/** 导出结果。ok=false 时 message 可以直接给用户看 */
export interface WeekReportExportResult {
  ok: boolean;
  message: string;
  /** 成功时的文件位置（文本版也写成文件再分享，这样接收方能存下来） */
  uri?: string;
}

/** 三个固定问题 → 中文提示。与 domain/review.ts 的 key 对应 */
const PROMPT_BY_KEY: Record<string, string> = {
  keep: REVIEW_QUESTIONS[0].prompt,
  stuck: REVIEW_QUESTIONS[1].prompt,
  next: REVIEW_QUESTIONS[2].prompt,
};

/**
 * 把周报拼成一段纯文本。
 *
 * 单独拆出来是为了**能在没有原生模块的环境里验**：
 * 「周报说什么」是一个纯字符串问题，不该需要一台手机才能回答。
 */
export function buildWeekReportText(nowMs: number = Date.now()): string {
  const settings = getSettings();
  const { today } = effectiveToday(
    nowMs,
    settings.day_start_hour,
    settings.last_settled_date
  );

  const view = getReviewView(nowMs);
  // 没有待写的周时（最近两周都写过了），导出「上一周」而不是空白
  const weekKey = view.weekKey ?? weekKeyOf(today);

  const lines: string[] = [];
  lines.push(`这一周（${formatWeekRange(weekKey)}）`);

  /*
   * 统计用周复盘那一份（view.stats），不用统计页的 30 天窗口：
   * 周报说的是「这一周」，而统计页说的是「最近 30 天」，两者口径不同，
   * 混用会让用户看到两个对不上的数字。
   *
   * 但如果导出的那一周不是 view 正在编辑的那一周（两者都写过的情形），
   * view.stats 就是空的了——那种情况下只写答案，不写数字。
   */
  if (view.weekKey === weekKey && view.stats.checkins > 0) {
    lines.push(`有 ${view.stats.activeDays} 天动过，记了 ${view.stats.checkins} 次。`);
    if (view.stats.steadiest) lines.push(`最常记的是「${view.stats.steadiest}」。`);
    if (view.stats.attributes.length > 0) {
      lines.push(`时间花在：${view.stats.attributes.join('、')}。`);
    }
  } else if (view.weekKey === weekKey) {
    lines.push('这一周没有记录。');
  }

  // 答案部分。只写有内容的那些，空着的问题不占一行
  const answers: Array<[string, string]> = [
    ['keep', view.answers.keep],
    ['stuck', view.answers.stuck],
    ['next', view.answers.next],
    ['free', view.answers.free],
  ];

  let wroteAny = false;
  for (const [key, answer] of answers) {
    if (!answer || answer.length === 0) continue;
    if (!wroteAny) {
      lines.push('');
      wroteAny = true;
    }
    lines.push(PROMPT_BY_KEY[key] ?? '还想说的');
    lines.push(answer);
    lines.push('');
  }

  // 结尾不带签名、不带「由 Ember 生成」：这是用户自己的记录，
  // 不是一份由 App 署名的报表。
  return lines.join('\n').trim();
}

/**
 * 导出周报（文本版）。
 *
 * 写成 `.txt` 再走系统分享面板：
 *   - 微信 / QQ / 备忘录 / 邮件都能直接收文本文件；
 *   - 文件形式让接收方可以「保存到文件」，而纯文本分享在某些 App 里会被截断。
 *
 * 失败不抛错：导出是「拿出去」的动作，失败时给一句话就够了。
 */
export async function exportWeekReport(nowMs: number = Date.now()): Promise<WeekReportExportResult> {
  let text: string;
  try {
    text = buildWeekReportText(nowMs);
  } catch (err) {
    console.warn('[Ember] 生成周报失败', err);
    return { ok: false, message: '这一周的记录暂时读不出来，稍后再试一次。' };
  }

  try {
    const settings = getSettings();
    const { today } = effectiveToday(
      nowMs,
      settings.day_start_hour,
      settings.last_settled_date
    );
    const weekKey = weekKeyOf(today);

    const file = new File(Paths.cache, `ember-week-${weekKey}.txt`);
    if (file.exists) file.delete();
    file.writeSync(text);

    let canShare = false;
    try {
      canShare = await Sharing.isAvailableAsync();
    } catch {
      canShare = false;
    }

    if (!canShare) {
      return {
        ok: false,
        message: `已经写好了，但这台手机没有可以接收文件的 App，所以它还在缓存里。`,
        uri: file.uri,
      };
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/plain',
      dialogTitle: '保存这一周的周报',
    });

    return { ok: true, message: '周报已经写好了。', uri: file.uri };
  } catch (err) {
    console.warn('[Ember] 导出周报失败', err);
    return {
      ok: false,
      message: err instanceof Error ? err.message : '没能写出来，稍后再试一次。',
    };
  }
}

/**
 * 图片版周报 —— **尚未实现，等一条 install**（D39）。
 *
 * 形状先定下来，这样装上 `react-native-view-shot` 之后只需要改这里，
 * 界面那边调用 `exportWeekReport()` 的地方不用动。
 *
 * 实现时要做的事（写在这里免得下次重新想）：
 *   1. 在周报页外面包一层 `ViewShot`，ref 拿住它；
 *   2. `captureRef` 出 PNG，写到缓存目录；
 *   3. 走 `Sharing.shareAsync`，mimeType 改成 `image/png`；
 *   4. **中文不截断**的关键是给容器足够宽度（导出时用一个固定的 1080 宽布局，
 *      而不是屏幕宽），因为验收标准就是这一条。
 *
 * 为什么现在不写一个「假装能用」的版本：一个点了没反应的按钮比没有按钮更糟。
 */
export async function exportWeekReportAsImage(): Promise<WeekReportExportResult> {
  return {
    ok: false,
    message: '图片版还没做，现在可以导出文字版。',
  };
}

/** 统计页的 30 天窗口是否已经攒够数据（周报页用它决定要不要提示「再等等」） */
export function hasEnoughHistory(nowMs: number = Date.now()): boolean {
  try {
    return getStatsData(nowMs).totalCheckins > 0;
  } catch {
    return false;
  }
}
