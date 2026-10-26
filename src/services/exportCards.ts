/**
 * 月报图与回忆卡的数据（D39 第二步）。
 *
 * 与 `weekReport.ts` 的 `buildWeekCard` 同一个套路：把库里的事实拼成
 * `ExportCardData`，画法交给 `components/ExportCardView`，截图交给
 * `services/exportImage.tsx`。三张卡共用一套版式，所以它们看起来是一家人。
 *
 * ---- 回忆卡是什么 ----
 *
 * 「回忆页」原本只列周复盘与月复盘的原文。回忆卡把同一份内容拍成图，
 * 让它可以发给别人或者存进相册。**不是新数据**，只是同一份记录的另一种形态。
 *
 * 一张回忆卡对应**一条**记录（一周复盘或一个月复盘），而不是全部：
 * 全部放在一张图里会变成一份很长的报表，而卡片的价值在于「一张一张翻」。
 */
import { CARD_FOOTER, quoteBlock, monthFactLines, type ExportCardData } from '../domain/exportCard';
import { formatWeekRange } from '../domain/review';
import { formatMonthLabel } from '../domain/monthReview';
import { getMonthReviewView, listMonthReviewHistory, type MonthHistoryItem } from './monthReview';
import { listReviewHistory, type ReviewHistoryItem } from './review';

/**
 * 月报卡：这一个月摆出来 + 用户写的那一句。
 *
 * 与月复盘页同一个顺序：先说数字，再说五维变化，再写用户的话。
 * 五维用 `pair` 块（两列），不用条形图——条形图会被读成完成度。
 */
export function buildMonthCard(nowMs: number = Date.now()): {
  card: ExportCardData;
  monthKey: string | null;
} {
  const view = getMonthReviewView(nowMs);

  if (!view.monthKey) {
    return {
      monthKey: null,
      card: {
        label: '这一个月',
        title: '最近两个月都写过了',
        blocks: [{ kind: 'fact', text: '下个月过完之后，这里会再出现一份。' }],
        footer: CARD_FOOTER,
      },
    };
  }

  const blocks: ExportCardData['blocks'] = [];

  for (const line of monthFactLines(view.stats)) {
    blocks.push({ kind: 'fact', text: line });
  }

  // 五维涨了多少：点数为 0 的不列（列出来是一排零）
  if (view.stats.attributeGains.length > 0) {
    for (const item of view.stats.attributeGains) {
      blocks.push({ kind: 'pair', label: item.label, value: `+${item.gained} 点` });
    }
  }

  const note = quoteBlock('这个月想说的', view.note);
  if (note) blocks.push(note);

  return {
    monthKey: view.monthKey,
    card: {
      label: '这一个月',
      title: view.label || formatMonthLabel(view.monthKey),
      blocks,
      footer: CARD_FOOTER,
    },
  };
}

/** 回忆卡的三种来源 */
export type MemoryCardSource =
  | { kind: 'week'; item: ReviewHistoryItem }
  | { kind: 'month'; item: MonthHistoryItem };

/**
 * 一张回忆卡。
 *
 * 周复盘卡：日期范围 + 三个问题里写了的那些。
 * 月复盘卡：月份 + 用户写的那一句。
 *
 * 统计数字**不进回忆卡**。回忆卡是「那一次我写了什么」，
 * 数字属于月报卡与统计页；把它们混在一起会让一次回顾变成一份评估。
 */
export function buildMemoryCard(source: MemoryCardSource): ExportCardData {
  if (source.kind === 'week') {
    const item = source.item;
    const blocks: ExportCardData['blocks'] = [];

    /*
     * 周复盘历史里存的已经是「提示语 + 答案」对，直接转成 quote 块。
     * 不重新按 key 排一遍：历史条目里的顺序就是保存时的顺序（keep/stuck/next/free），
     * 再排一次反而可能与用户当时读到的顺序不一致。
     */
    for (const entry of item.entries) {
      const block = quoteBlock(entry.prompt, entry.answer);
      if (block) blocks.push(block);
    }

    if (blocks.length === 0) {
      blocks.push({ kind: 'fact', text: '这一周没有写下的字。' });
    }

    return {
      label: '那一周',
      title: item.rangeLabel || formatWeekRange(item.weekKey),
      blocks,
      footer: CARD_FOOTER,
    };
  }

  const item = source.item;
  const blocks: ExportCardData['blocks'] = [];
  const note = quoteBlock('那时候想说的', item.note);
  if (note) blocks.push(note);
  if (blocks.length === 0) {
    blocks.push({ kind: 'fact', text: '这个月没有写下的字。' });
  }

  return {
    label: '那一个月',
    title: item.label || formatMonthLabel(item.monthKey),
    blocks,
    footer: CARD_FOOTER,
  };
}

/**
 * 回忆页要的全部卡片来源，按时间倒序混排。
 *
 * 早先回忆页是「周一张表、月一张表」两块分开列。做成卡片之后，
 * 用户想的是「我最近写了什么」，而不是「我写过几周几月」，
 * 所以混成一条时间线更合语义。
 *
 * 排序键用 `updatedAt`（都写过的取最近写的那一次）。同一时刻的稳定排序
 * 靠 kind + key 串，避免每次渲染顺序抖动。
 */
export function listMemoryCards(): Array<{
  /** 稳定 id，React key 用它 */
  id: string;
  source: MemoryCardSource;
  updatedAt: number;
}> {
  const out: Array<{ id: string; source: MemoryCardSource; updatedAt: number }> = [];

  try {
    for (const item of listReviewHistory()) {
      out.push({ id: `week-${item.weekKey}`, source: { kind: 'week', item }, updatedAt: item.updatedAt });
    }
  } catch (err) {
    console.warn('[Ember] 读取周复盘历史失败', err);
  }

  try {
    for (const item of listMonthReviewHistory()) {
      out.push({ id: `month-${item.monthKey}`, source: { kind: 'month', item }, updatedAt: item.updatedAt });
    }
  } catch (err) {
    console.warn('[Ember] 读取月复盘历史失败', err);
  }

  out.sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return out;
}
