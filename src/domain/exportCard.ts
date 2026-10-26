/**
 * 导出卡片的**内容**（纯数据）。
 *
 * ---- 为什么内容和画法要分开 ----
 *
 * 一张导出图片有两半：说哪些话（这里），和怎么排（`components/ExportCardView`）。
 * 分开写有一个很实际的好处：**「这张卡说什么」可以在没有手机的机器上验**
 * （纯字符串，跑断言就行），而「中文有没有被截断」只能在真机上看。
 * 混在一起的话，前者也跟着只能靠眼睛。
 *
 * ---- 卡片上不说什么 ----
 *
 * 1. **不写完成率、不写分母。** 与统计页（D33）、复盘页同一个立场：
 *    「7 天里 4 天」是评判，「有 4 天动过」是同一件事实的中性说法。
 * 2. **不写「由 Ember 生成」。** 这是用户自己的记录，不是一份 App 署名的报表。
 *    只在末尾写一句「只存在这台手机上」——那是这个产品唯一值得写上去的说明。
 * 3. **不写任何禁用词**（`domain/text-rules.ts`）。动态拼出来的句子尤其要过一遍。
 *
 * ---- 尺寸为什么写在这里 ----
 *
 * 验收标准是「中文不截断」，而截断与否取决于**板式宽度与字号的关系**，
 * 不取决于手机屏幕。所以卡片按一个固定的 540dp 宽排版（导出时 ×2 成 1080px）：
 * 同一个内容在任何手机上导出，字都不会因为屏幕窄而被挤掉。
 */

/** 卡片排版宽度（dp）。导出时乘 `CARD_PIXEL_SCALE` 得到像素宽 */
export const CARD_WIDTH = 540;

/**
 * 导出倍数。540dp × 2 = 1080px，正好是常见的分享尺寸。
 *
 * 为什么不跟着设备像素密度走：那会让同一张卡在不同手机上宽度不同，
 * 而「不截断」这件事是要按最窄的版面验的。固定 2 倍最省心。
 */
export const CARD_PIXEL_SCALE = 2;

/** 卡片上的一段内容 */
export type ExportCardBlock =
  | {
      /** 事实行：一句中性描述，正文 */
      kind: 'fact';
      text: string;
    }
  | {
      /** 用户自己写的：小字提示 + 正文答案 */
      kind: 'quote';
      prompt: string;
      answer: string;
    }
  | {
      /** 五维的变化：左边名字、右边「+12 点」。做成两列，不用条形图 */
      kind: 'pair';
      label: string;
      value: string;
    };

/** 一张导出卡的全部内容 */
export interface ExportCardData {
  /** 卡片左上角的小字，例如「这一周」 */
  label: string;
  /** 主标题，例如「10 月 19 日 – 25 日」 */
  title: string;
  /** 内容块，按显示顺序 */
  blocks: ExportCardBlock[];
  /** 页脚。null 表示不写 */
  footer: string | null;
}

/**
 * 卡片固定的一句页脚。
 *
 * 只写这一句：它同时回答了「数据在哪」和「会不会传出去」，
 * 而且是一句可以验证的事实（没有网络权限），不是一句承诺。
 */
export const CARD_FOOTER = '这是你自己的记录，只存在这台手机上。';

/**
 * 把周复盘的统计拼成几句事实。
 *
 * 只有一条记录都没有时不写数字——那时写「0 天」是一句指责。
 */
export function weekFactLines(stats: {
  activeDays: number;
  checkins: number;
  steadiest: string | null;
  attributes: readonly string[];
}): string[] {
  if (stats.checkins === 0) {
    return ['这一周没有记录。空着的周也是周。'];
  }

  const lines = [`有 ${stats.activeDays} 天动过，记了 ${stats.checkins} 次。`];
  if (stats.steadiest) lines.push(`最常记的是「${stats.steadiest}」。`);
  if (stats.attributes.length > 0) {
    lines.push(`时间花在：${stats.attributes.join('、')}。`);
  }
  return lines;
}

/** 把月复盘的统计拼成几句事实 */
export function monthFactLines(stats: {
  activeDays: number;
  checkins: number;
  steadiest: string | null;
  goalsActive: number;
  goalsDoneThisMonth: number;
}): string[] {
  const lines: string[] = [];

  if (stats.checkins === 0) {
    lines.push('这个月没有记录。空着的月份也是月份。');
  } else {
    lines.push(`有 ${stats.activeDays} 天动过，记了 ${stats.checkins} 次。`);
    if (stats.steadiest) lines.push(`最常记的是「${stats.steadiest}」。`);
  }

  // 目标：两个数，不做达成率
  if (stats.goalsDoneThisMonth > 0) {
    lines.push(`这个月收起了 ${stats.goalsDoneThisMonth} 个目标，还有 ${stats.goalsActive} 个在进行。`);
  } else if (stats.goalsActive > 0) {
    lines.push(`还有 ${stats.goalsActive} 个目标在进行。`);
  }

  return lines;
}

/** 一条复盘答案 → 一个内容块。答案为空时返回 null（空着的不占版面） */
export function quoteBlock(prompt: string, answer: string): ExportCardBlock | null {
  const text = (answer ?? '').trim();
  if (text.length === 0) return null;
  return { kind: 'quote', prompt, answer: text };
}

/**
 * 导出文件的扩展名与文件名前缀。
 *
 * 文件名只用 ASCII 与短横线：中文文件名在某些聊天软件里会变成一串问号，
 * 而用户在文件管理器里找的时候，`ember-week-2026-W43` 比「周报」更好定位
 * （它带着是哪一周）。标题本身在卡片里，不靠文件名传达。
 */
export function cardFileName(prefix: 'week' | 'month' | 'memory', key: string): string {
  const safe = key.replace(/[^0-9A-Za-z-]/g, '-');
  return `ember-${prefix}-${safe}.png`;
}
