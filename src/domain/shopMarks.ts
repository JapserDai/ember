/**
 * 商店的图形（D53）。
 *
 * 与称号图形（`titleMarks.ts`）同一条路：**坐标搬 Lucide**（ISC 许可，可商用），
 * 由 `scripts/fetch-lucide-marks.ts` 转换后抄进源码，版权声明在下面。
 *
 * ---- 商品为什么需要图形 ----
 *
 * 商店原来是一列「名字 + 一句说明 + 价格」，三件商品全是材料，
 * 读起来像一张价目表。扩成四类之后（材料 / 护盾 / 补货 / 回看），
 * 只靠名字分不出它们是四种**不同性质**的东西——
 * 「一个材料」和「一张护盾」在文字上都是「一个…」。
 * 一个 26 的图形能在扫视时立刻分开它们，而文字要读完才知道。
 *
 * ---- 为什么这些图标 ----
 *
 * 每个都直接说「这是什么东西」，不用隐喻：
 *   material  `package`        一个包裹 —— 材料
 *   refined   `package-open`   拆开的包裹 —— 精炼材料（更好的那种）
 *   shield    `shield-check`   带勾的盾 —— 一天的自动保护
 *   ticket    `ticket`         票 —— 补一张宽限券
 *   restore   `rotate-ccw`     回转箭头 —— 把断掉的连胜接回来
 *   custom    `gift`           礼物 —— 用户自己写的奖励
 *
 * 24×24 画框、只描边、绝对命令（与 `TabBarIcon` / `spark` / `titleMarks` 同一套规矩），
 * 所以 `scripts/svg-raster.ts` 的点阵验形工具能读它。
 *
 * 本文件是纯数据：不 import React、不碰数据库。
 */

/** 画框边长 */
export const SHOP_MARK_BOX = 24;

/** 描边线宽。与称号图形同值：两者会在同一页出现（商店 vs 称号图鉴），粗细要一致 */
export const SHOP_MARK_STROKE = 1.7;

/** 版权声明。ISC 许可要求在副本中保留，而坐标已经抄进这个文件 */
export const LUCIDE_LICENSE =
  'Icons derived from Lucide (https://lucide.dev) — ISC License. ' +
  'Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). ' +
  'All other copyright (c) for Lucide are held by Lucide Contributors 2022.';

/** 一个商品的图形。只存 path，颜色由组件按主题给 */
export interface ShopMark {
  /** Lucide 图标名（保留来源，方便日后重新拉取） */
  source: string;
  /** 描边路径。绝对命令（M/L/C/Q/Z 与 H/V），不含圆弧 */
  outline: string;
}

/**
 * 商品图形表。
 *
 * 键与 `domain/shop.ts` 的 `ShopCategory` 一一对应，外加 `custom`
 * （用户自己写的奖励，不是我们卖的）。
 *
 * **不要手工微调这些数字**：它们是 `scripts/fetch-lucide-marks.ts` 输出的。
 * 要换形状就改那边的图标名，重跑，再粘一次。
 */
export const SHOP_MARKS = {
  /** 材料（普通）—— 一个封着的包裹 */
  material: {
    source: 'lucide/package',
    outline:
      'M11 21.73C11.62 22.09 12.38 22.09 13 21.73L20 17.73C20.62 17.37 21 16.71 21 16V8C21 7.29 20.62 6.63 20 6.27L13 2.27C12.38 1.91 11.62 1.91 11 2.27L4 6.27C3.38 6.63 3 7.29 3 8V16C3 16.71 3.38 17.37 4 17.73Z' +
      'M12 22V12' +
      'M7.5 4.27L16.5 9.42',
  },
  /** 精炼材料 —— 拆开的包裹（同一个东西，更里面那一层） */
  refined: {
    source: 'lucide/package-open',
    outline:
      'M12 22V13' +
      'M15.17 2.21C15.68 1.93 16.29 1.93 16.8 2.21L21 4.57C21.61 4.91 21.98 5.55 21.98 6.25C21.98 6.95 21.61 7.59 21 7.93L8.82 14.79C8.31 15.08 7.69 15.08 7.18 14.79L3 12.43C2.39 12.09 2.02 11.45 2.02 10.75C2.02 10.05 2.39 9.41 3 9.07Z' +
      'M20 13V16.87C20 17.64 19.57 18.35 18.89 18.7L12.89 21.78C12.33 22.07 11.67 22.07 11.11 21.78L5.11 18.7C4.43 18.35 4 17.64 4 16.87V13' +
      'M21 12.43C21.61 12.09 21.98 11.45 21.98 10.75C21.98 10.05 21.61 9.41 21 9.07L8.83 2.2C8.33 1.91 7.7 1.91 7.2 2.2L3 4.57C2.39 4.91 2.02 5.55 2.02 6.25C2.02 6.95 2.39 7.59 3 7.93L15.18 14.79C15.68 15.08 16.31 15.08 16.81 14.79Z',
  },
  /** 连胜护盾 —— 带勾的盾 */
  shield: {
    source: 'lucide/shield-check',
    outline:
      'M20 13C20 18 16.5 20.5 12.34 21.95C12.12 22.02 11.89 22.02 11.67 21.94C7.5 20.5 4 18 4 13V6C4 5.45 4.45 5 5 5C7 5 9.5 3.8 11.24 2.28C11.68 1.91 12.32 1.91 12.76 2.28C14.51 3.81 17 5 19 5C19.55 5 20 5.45 20 6Z' +
      'M9 12L11 14L15 10',
  },
  /** 宽限券补货 —— 一张票 */
  ticket: {
    source: 'lucide/ticket',
    outline:
      'M2 9C3.66 9 5 10.34 5 12C5 13.66 3.66 15 2 15V17C2 18.1 2.9 19 4 19H20C21.1 19 22 18.1 22 17V15C20.34 15 19 13.66 19 12C19 10.34 20.34 9 22 9V7C22 5.9 21.1 5 20 5H4C2.9 5 2 5.9 2 7Z' +
      'M13 5V7' +
      'M13 17V19' +
      'M13 11V13',
  },
  /** 回看券 —— 回转箭头 */
  restore: {
    source: 'lucide/rotate-ccw',
    outline:
      'M3 12C3 16.97 7.03 21 12 21C16.97 21 21 16.97 21 12C21 7.03 16.97 3 12 3C9.48 3.01 7.07 3.99 5.26 5.74L3 8' +
      'M3 3V8H8',
  },
  /** 用户自己写的奖励 —— 礼物盒 */
  custom: {
    source: 'lucide/gift',
    outline:
      'M12 7V21' +
      'M20 11V19C20 20.1 19.1 21 18 21H6C4.9 21 4 20.1 4 19V11' +
      'M7.5 7C6.12 7 5 5.88 5 4.5C5 3.12 6.12 2 7.5 2C9.47 1.97 11.26 3.95 12 7C12.74 3.95 14.53 1.97 16.5 2C17.88 2 19 3.12 19 4.5C19 5.88 17.88 7 16.5 7',
  },
} as const satisfies Record<string, ShopMark>;

/** 图形键 */
export type ShopMarkKey = keyof typeof SHOP_MARKS;
