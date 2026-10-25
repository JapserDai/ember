/**
 * 头像：按玩家 ID 生成的几何图案
 *
 * 为什么是生成的，而不是让用户上传：
 * 上传要 expo-image-picker、要存储权限、要处理裁剪与分辨率，还要在备份里带上二进制。
 * 这四条都跟「完全离线、无权限」的底线打架。生成一个图案，零依赖、零权限、导出的
 * JSON 里只需要多存一个整数。
 *
 * 图案是什么：一块**落在灰里的炭**。做法是围绕圆心取 5–8 个半径不等的点连成闭合
 * 折线（不规则多边形），再从边界往内部连一两条棱。
 * 为什么不是一个星星：星形四角对称，转多少度都像同一个图案，十几个头像排在一起会
 * 像同一个东西的变体。不规则多边形没有对称轴，每块炭都是单独的一块。
 *
 * 随机来源：domain/prng.ts 的 FNV-1a + mulberry32，与打卡文案同一套。
 * 同一个 id 永远得到同一个图案，跨设备、跨版本一致——所以导出再导入，头像不会变。
 *
 * 「换一个」不是重新随机：重掷只是把 avatar_seed 这个整数 +1，图案完全由
 * (playerId, avatarSeed) 决定。这样它和别的字段一样能存进 settings、能进备份，
 * 也能在不改变「导入后头像不变」这条承诺的前提下换图案。
 *
 * 本文件是纯函数：不 import React、不碰数据库。
 */
import { fnv1a32, mulberry32 } from './prng';

/** 画布坐标。图案固定画在 100×100 的方框里，组件负责缩放到实际尺寸 */
export const AVATAR_BOX = 100;

/** 图案的顶点数范围（含两端） */
const VERTEX_MIN = 5;
const VERTEX_MAX = 8;

/** 顶点到圆心的半径范围，占画布的比例 */
const R_MIN = 0.23;
const R_MAX = 0.45;

/** 图案的一条线：两个端点，坐标都在 0–100 之间 */
export interface AvatarSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * 一个头像的全部几何信息。颜色不在这里，由组件从主题取。
 *
 * 轮廓与棱分开存：轮廓要填色（一块有体积的炭），棱不填色（只是表面的断面）。
 * 如果都塞进 segments，组件就得自己猜哪几条是轮廓——这个判断不该由组件做。
 */
export interface AvatarShape {
  /** 闭合轮廓的顶点，按顺序排列。首尾自动相连 */
  outline: Array<{ x: number; y: number }>;
  /** 内部的棱。只有线，不参与填色 */
  ribs: AvatarSegment[];
  /**
   * 这块炭「烧得有多透」：20–89 的整数。
   * 组件用它决定强调色（火心）的大小——不是随机噪点，是同一个人
   * 每次打开都一样的固定特征。
   */
  warmth: number;
  /** 火心的圆心，同样在 0–100 的画布里 */
  ember: { x: number; y: number };
}

/**
 * 由玩家 id 与重掷计数生成头像。
 *
 * @param playerId 玩家 id（player.id）。导入数据后它不变，头像就不变
 * @param avatarSeed 重掷计数，默认 0。每次「换一个」+1
 */
export function buildAvatar(playerId: string, avatarSeed = 0): AvatarShape {
  // 两条独立的流：形状一条、warmth 一条。
  // 分开是为了让「warmth 的算法以后改了」不会连带把所有人的头像形状也改掉。
  const shapeRand = mulberry32(fnv1a32(`${playerId}|avatar|${avatarSeed}`));
  const warmthRand = mulberry32(fnv1a32(`${playerId}|avatar-warmth|${avatarSeed}`));

  // ---- 形状 ----
  const count = VERTEX_MIN + Math.floor(shapeRand() * (VERTEX_MAX - VERTEX_MIN + 1));
  // 起始角随机：同一个人如果只在角度上错开，看上去仍是同一块炭；
  // 但起始角变了，配合半径差异，能让「换一个」的变化更明显
  const startAngle = shapeRand() * Math.PI * 2;

  // 整体压扁系数：0.78–1.0。
  // 为什么需要它：只有半径差异时，顶点一多就趋近正多边形，十几个头像看起来
  // 是同一个圆被转了角度。压扁让每块炭有自己的长宽比——有的斜长、有的扁圆。
  const squashX = 0.78 + shapeRand() * 0.22;
  const squashY = 0.78 + shapeRand() * 0.22;

  const points: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < count; i++) {
    const angle = startAngle + (i * Math.PI * 2) / count;
    // 半径取满整个区间：早先收窄到 0.35–1 倍时，所有人的轮廓都差不多大，
    // 差异只剩「转了多少度」，在 44px 的头像里几乎看不出来
    const radius = R_MIN + (R_MAX - R_MIN) * shapeRand();
    const cx = AVATAR_BOX / 2;
    const cy = AVATAR_BOX / 2;
    points.push({
      x: round2(cx + radius * AVATAR_BOX * squashX * Math.cos(angle)),
      y: round2(cy + radius * AVATAR_BOX * squashY * Math.sin(angle)),
    });
  }

  const ribs: AvatarSegment[] = [];

  // 一到两条棱：从某个顶点朝中心方向切进去一小段，像炭上的一处断面。
  // 棱是让两个顶点数相同的图案不至于长得一样的关键。
  //
  // 长度只走到「顶点 → 中心」的 35%–55%：再长就会变成一条把图案劈成两半的直线，
  // 读起来像饼图的分区而不是一块石头。终点不取中心点——火心在那儿，
  // 所有棱都指向火心会让十几个头像同时出现「一根线戳着一个点」的重复感。
  const centroid = {
    x: points.reduce((sum, p) => sum + p.x, 0) / points.length,
    y: points.reduce((sum, p) => sum + p.y, 0) / points.length,
  };
  const ribCount = shapeRand() < 0.55 ? 1 : 2;
  const usedVertices = new Set<number>();
  for (let i = 0; i < ribCount; i++) {
    let vertex = Math.floor(shapeRand() * points.length);
    // 两条棱不共用顶点，否则会在同一个角上堆成一团
    let guard = 0;
    while (usedVertices.has(vertex) && guard < points.length) {
      vertex = (vertex + 1) % points.length;
      guard++;
    }
    usedVertices.add(vertex);

    const t = 0.35 + shapeRand() * 0.2;
    const from = points[vertex];
    ribs.push({
      x1: from.x,
      y1: from.y,
      x2: round2(from.x + (centroid.x - from.x) * t),
      y2: round2(from.y + (centroid.y - from.y) * t),
    });
  }

  // ---- warmth ----
  // 只用来决定火心的面积，取值压在 20–89：太低就没有火心，太高整块炭都亮着，
  // 两者都看不出「这是一个图案」
  const warmth = 20 + Math.floor(warmthRand() * 70);

  // ---- 火心的位置 ----
  // 从中心偏移最多 9 个单位。为什么不让它固定在正中央：
  // 那样每个人的头像正中间都有同一个点，十几个排在一起时，最先被看到的是
  // 「所有头像都有一个点」，图案的差异反而被盖住了。
  const emberAngle = warmthRand() * Math.PI * 2;
  const emberDistance = 3 + warmthRand() * 6;
  const ember = {
    x: round2(AVATAR_BOX / 2 + emberDistance * Math.cos(emberAngle)),
    y: round2(AVATAR_BOX / 2 + emberDistance * Math.sin(emberAngle)),
  };

  return { outline: points, ribs, warmth, ember };
}

/** 保留两位小数：SVG 的 path 里不需要更多精度，少几位能少一点字符串拼接 */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 把轮廓拼成 SVG polygon 的 points 属性："x,y x,y …" */
export function outlinePoints(shape: AvatarShape): string {
  return shape.outline.map((p) => `${p.x},${p.y}`).join(' ');
}

/**
 * 把棱拼成 SVG path 的 d 属性。
 *
 * 只做 M/L，不用曲线：这是一块煤，棱角本来就该是直的。
 */
export function ribsPath(shape: AvatarShape): string {
  return shape.ribs.map((r) => `M${r.x1} ${r.y1}L${r.x2} ${r.y2}`).join('');
}

/**
 * 火心：在图案中心画一小块实心圆，面积由 warmth 决定。
 *
 * 为什么火心不做成轮廓的一部分：轮廓是「这块炭的形状」，火心是「它还有没有温度」。
 * 两件事性质不同，混在一起改其中一个就会动到另一个。
 */
export function avatarEmberRadius(shape: AvatarShape): number {
  // 半径 3–8：小到不会盖住轮廓，大到在 40px 的头像里仍能看见
  return 3 + (shape.warmth / 99) * 5;
}
