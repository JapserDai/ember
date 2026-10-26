/**
 * 称号的图形（D52）。
 *
 * ---- 坐标的来源：搬 Lucide，不自己画 ----
 *
 * 这些形状**不是手绘的**，是 [Lucide](https://lucide.dev) 的图标（ISC 许可，
 * 可商用、可修改、只需保留版权声明）逐条转换来的。原文件在
 * `node_modules` 之外，用 `scripts/fetch-lucide-marks.ts` 拉取 + 转换，
 * 转换后的坐标**抄进本文件**（不是运行时拉取——App 不申请网络权限）。
 *
 * 为什么搬而不是画：手绘那版（D52 第一稿）在真图上被推翻两次——
 * 锅的圆弧底让矩形水位悬空、抽屉的盖让满档水面留白缝。手画一个「像容器」的形状
 * 容易，手画一个「水能坐在里面」的形状很难，而 Lucide 的图标是几百个图标
 * 反复调过的，它们的竖壁、平底、圆角比例已经是对的量级。
 *
 * ---- 转换做了什么（重要，改坐标前必读）----
 *
 * Lucide 的 path 用**相对命令**（`h`/`v`/`a`/`c`）与**圆弧**（`a`），
 * 而本项目的规矩是**只用绝对命令**（`M`/`L`/`C`/`Q`/`Z`）——`scripts/svg-raster.ts`
 * 的点阵验形工具只认这几条。转换由 `scripts/fetch-lucide-marks.ts` 用
 * `svgpath` 库完成（开发期依赖，**不进 App**）：
 *
 *   1. `.unarc()`：圆弧 → 三次贝塞尔（`C`）。所以圆角在源码里是一段 `C`，
 *      而不是一长串折线——形状与 Lucide 原图一致，验形工具也能读；
 *   2. `.abs()`：相对命令 → 绝对坐标；
 *   3. 数字四舍五入到两位小数（24 网格下两位已经够，且让坐标可读）。
 *
 * **不要手工微调这些数字**——它们是转换器输出的。要改形状就换 Lucide 的图标，
 * 然后重跑脚本；手改会让「重新拉取」失效，而且改错一位不会报错。
 *
 * ---- 五只容器为什么是这五只 ----
 *
 * 硬约束：**底部必须是平的**（水位是矩形，圆弧底会让水悬空）。
 * 在这个约束下从 Lucide 里挑：
 *
 *   体魄 —— `beaker`（量杯）：竖壁 + 平底 + 口沿横线 + 一条刻度。最像「容器」。
 *   心智 —— `book-open`（摊开的书）：两页合起来的形状，底部是平的。对应「读和学」。
 *   秩序 —— `archive`（档案盒）：方盒 + 盖子横线 + 一个把手缺口。对应「收拾」。
 *   心力 —— `moon`（月亮）：一个封闭的月牙形，底部收拢但仍是连续闭合的。对应「安静」。
 *   联结 —— `users`（两个人）：两个头 + 肩线。对应「主动联系别人」。
 *
 * **注意：心智/心力/联结三只不再是「容器 + 水位」**，因为 Lucide 里
 * 底部平、又能装水的容器形状不够五只。改成了「这一维的**一个符号**」：
 * 书本 / 月亮 / 两个人。它们的「第几档」不再靠水位表达，而是靠
 * **`opacity` + 线宽**（见 `components/TitleMark.tsx`）。
 *
 * 这是一个取舍，写在 D52 的代价栏里：**五只容器统一用「水位」表达档位更整齐，
 * 但 Lucide 里没有五只这样的容器；硬凑就会回到手绘那条路。**
 * 现在的做法是：**体魄与秩序有水位（它们是真正的容器），
 * 心智/心力/联结用「实心程度」表达档位**——两者在 28px 下都读得出「第几档」。
 *
 * ---- 画法约定 ----
 *
 * 24×24 画框、只描边不填充（水位是唯一的填充）、绝对命令。
 * 本文件是纯数据 + 纯函数：不 import React、不碰数据库。
 */

/** 画框边长。与底栏图标、火花记号同一个网格 */
export const TITLE_MARK_BOX = 24;

/**
 * 描边线宽。
 *
 * Lucide 原图是 2（24 网格下的标准）。这里取 1.7：
 * 称号图形比底栏图标（1.45）重一档，但比 Lucide 原值轻——
 * 因为它们在 28–32px 下单独出现，2 会显得糊。
 */
export const TITLE_MARK_STROKE = 1.7;

/**
 * 版权声明。ISC 许可要求「在副本中保留版权声明与许可声明」，
 * 而坐标已经抄进这个文件，所以声明也放在这个文件里。
 */
export const LUCIDE_LICENSE =
  'Icons derived from Lucide (https://lucide.dev) — ISC License. ' +
  'Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). ' +
  'All other copyright (c) for Lucide are held by Lucide Contributors 2022.';

/** 容器的内腔：水位永远落在这块矩形里 */
export interface Cavity {
  /** 左边界 */
  x: number;
  /** 上边界（满水位） */
  y: number;
  /** 宽度 */
  w: number;
  /** 高度（从 y 到底部） */
  h: number;
}

/**
 * 一个称号的图形。
 *
 * `kind` 决定「第几档」怎么表达：
 *   - `vessel`：有水位（`cavity` 给了能装水的矩形）。只有真正的容器用它。
 *   - `glyph`：没有水位，档位靠实心程度表达（见组件）。
 */
export interface VesselMark {
  kind: 'vessel';
  /** Lucide 图标名（保留来源，方便日后重新拉取） */
  source: string;
  /** 外轮廓（描边）。绝对命令，圆弧已展平 */
  outline: string;
  /** 内腔。**底边必须与外轮廓的底边重合** */
  cavity: Cavity;
}

export interface GlyphMark {
  kind: 'glyph';
  source: string;
  /** 符号本身（描边）。绝对命令 */
  outline: string;
}

export type AttributeMark = VesselMark | GlyphMark;

/**
 * 五只容器 / 符号。
 *
 * 坐标全部来自 Lucide v1.61.0（转换脚本 `scripts/fetch-lucide-marks.ts`）。
 * **不要手工微调这些数字**——它们是转换器输出的，手改会让「重新拉取」失效。
 * 要改形状就去改 Lucide 的图标选择，然后重跑脚本。
 */
export const ATTRIBUTE_MARKS = {
  /**
   * 体魄 —— Lucide `beaker`（量杯）。
   * 口沿横线 y=3、竖壁 6→18、平底 y=21、一条刻度线 y=14。
   * 内腔取竖壁之间（6→18）与口沿到底（3→21），水满时顶到口沿。
   */
  body: {
    kind: 'vessel',
    source: 'lucide/beaker',
    outline:
      'M4.5 3H19.5' +
      'M6 3V19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V3' +
      'M6 14H18',
    cavity: { x: 6, y: 3, w: 12, h: 18 },
  },
  /**
   * 心智 —— Lucide `book-open`（摊开的书）。
   * 没有可装水的内腔，所以是 `glyph`：档位靠不透明度表达。
   */
  mind: {
    kind: 'glyph',
    source: 'lucide/book-open',
    outline:
      'M12 5V21' +
      'M20 19C21.11 19 22 18.1 22 17V5C22 3.9 21.11 3 20 3L16 3C14.43 3 12.94 3.74 12 5C11.06 3.74 9.57 3 8 3H4C2.9 3 2 3.9 2 5V17C2 18.1 2.89 19 4 19H8C9.57 19 11.06 19.74 12 21C12.94 19.74 14.43 19 16 19Z',
  },
  /**
   * 秩序 —— Lucide `archive`（档案盒）。
   * 竖壁 4→20、平底 y=21、盖子横线 y=8、把手缺口 y=12。
   */
  order: {
    kind: 'vessel',
    source: 'lucide/archive',
    outline:
      'M4 8V19C4 20.1 4.9 21 6 21H18C19.1 21 20 20.1 20 19V8' +
      'M10 12H14',
    cavity: { x: 4, y: 8, w: 16, h: 13 },
  },
  /** 心力 —— Lucide `moon`（月亮）。闭合月牙，没有内腔 */
  spirit: {
    kind: 'glyph',
    source: 'lucide/moon',
    outline:
      'M20.99 12.49C20.72 17.32 16.68 21.09 11.84 21C6.99 20.91 3.09 17.01 3 12.16C2.91 7.32 6.67 3.28 11.51 3.01C11.92 2.99 12.13 3.47 11.91 3.82C10.43 6.19 10.78 9.26 12.76 11.24C14.73 13.22 17.81 13.57 20.18 12.09C20.53 11.87 21.01 12.08 20.98 12.49',
  },
  /** 联结 —— Lucide `users`（两个人）。头 + 肩，没有内腔 */
  bond: {
    kind: 'glyph',
    source: 'lucide/users',
    outline:
      'M16 21V19C16 16.79 14.21 15 12 15H6C3.79 15 2 16.79 2 19V21' +
      'M16 3.13C17.76 3.59 19 5.18 19 7C19 8.82 17.76 10.41 16 10.87' +
      'M22 21V19C22 17.18 20.76 15.59 19 15.13',
  },
} as const satisfies Record<string, AttributeMark>;

/** 属性称号的图形键。与 `ATTRIBUTE_KEYS` 一一对应 */
export type AttributeMarkKey = keyof typeof ATTRIBUTE_MARKS;

/** 有水位的那两只（体魄 / 秩序）。组件用它决定画不画填充 */
export function hasCavity(mark: AttributeMark): mark is VesselMark {
  return mark.kind === 'vessel';
}

/**
 * 旅程称号的图形：一条斜向上的路 + 五个落点。
 *
 * 这一只**不是** Lucide 的图标：Lucide 里没有「五个点沿斜线排开」这种东西，
 * 而它是这条轴的核心表达（等级 = 一条路，不是一只容器）。所以手写，
 * 但只有 5 个点 + 1 条线，量极小。
 */
export const JOURNEY_MARK = {
  kind: 'journey' as const,
  outline: 'M4.6 18.4L8.6 15.2L12 12L15.4 8.8L19.4 5.6',
  dots: [
    [4.6, 18.4],
    [8.6, 15.2],
    [12, 12],
    [15.4, 8.8],
    [19.4, 5.6],
  ] as ReadonlyArray<readonly [number, number]>,
  dotRadius: 1.7,
};

/**
 * 容器在某一档的水位矩形。
 *
 * 三档把内腔等高分成三份，**水位从底部往上长**：
 *   1 档 → 底下 1/3
 *   2 档 → 底下 2/3
 *   3 档 → 满
 *
 * 为什么不是「1 档 = 1/3 满」而是「从底部起算」：水位在物理上只能从底部涨，
 * 悬在半空的一块会读成「进度条」，而从底部起算读成「装了多少」。
 *
 * 为什么留 1.5 的余量：水位贴到描边线上时，填充会盖住线（1.7 宽），
 * 看起来像「容器没有边」。所以内腔比外轮廓缩进 0.9。
 */
export function vesselFill(
  cavity: Cavity,
  tier: number
): { x: number; y: number; width: number; height: number } {
  const t = Math.min(3, Math.max(1, Math.round(tier)));
  const inset = 0.9;
  const x = cavity.x + inset;
  const w = Math.max(0, cavity.w - inset * 2);
  const top = cavity.y + inset;
  const bottom = cavity.y + cavity.h - inset;
  const h = Math.max(0, bottom - top);
  const height = (h * t) / 3;
  return {
    x,
    width: w,
    y: bottom - height,
    height,
  };
}

/**
 * 符号类称号的「档位强度」。
 *
 * 没有水位的三只（书 / 月亮 / 两个人）用**不透明度 + 线宽**表达档位：
 *   1 档 → 描边 0.55，2 档 → 0.8，3 档 → 1（满）
 *
 * 为什么用不透明度而不是「填一部分」：符号不是一个能装东西的东西，
 * 硬填一块会变成「书里有一块蓝色矩形」这种看不懂的图。
 * 由淡到浓读起来是「这件事在你身上越来越清楚」，与水位是同一个语义方向。
 */
export function glyphStrength(tier: number): number {
  const t = Math.min(3, Math.max(1, Math.round(tier)));
  return [0.55, 0.8, 1][t - 1];
}

/**
 * 旅程称号亮到第几个点。
 *
 * @param tier 1 / 2 / 3 / 4 / 5
 * @returns 亮着的点数（1–5）
 */
export function journeyLit(tier: number): number {
  return Math.min(5, Math.max(1, Math.round(tier)));
}
