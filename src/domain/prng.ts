/**
 * 种子化随机数（只用于文案与动画，绝不参与数值计算）
 *
 * 为什么自己写：
 * Math.random() 不可复现——同一次打卡刷新一下文案就变了，用户会觉得界面在抽风；
 * 更糟的是，如果随机影响数值，撤销重记就成了刷分漏洞。
 *
 * 方案：用「字符串种子 → 32 位整数 → 确定性序列」。
 * 同一个种子永远得到同一串数，跨设备、跨重启都一致。
 *
 * 本文件是纯函数：不 import React、不碰数据库。
 */

/**
 * FNV-1a 32 位哈希：把任意字符串压成一个 32 位无符号整数。
 *
 * 选它的理由：
 * - 实现只有 5 行，不需要依赖；
 * - 雪崩效应够好，`a|b|c` 里改一个字符，结果完全不同；
 * - 全部用 Math.imul 做 32 位乘法，不会因为 JS 双精度浮点丢低位。
 *
 * 返回值范围 0 … 4294967295。
 */
export function fnv1a32(input: string): number {
  let h = 0x811c9dc5; // FNV 偏移基准
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193); // FNV 质数 16777619
  }
  return h >>> 0; // 转成无符号
}

/**
 * mulberry32：一个很小的确定性伪随机数生成器。
 *
 * 返回一个函数，每次调用产出 [0, 1) 之间的数。
 * 质量足够选文案/选动画，速度比任何加密级 PRNG 都快。
 *
 * 注意：同一个种子会得到同一串序列。要「互不干扰的多个用途」，
 * 必须用不同种子各自建一个流，见下方 seedStream。
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 打卡记录的种子串。
 *
 * 规则（与 docs 04 §8.2 一致）：playerId | localDate | taskId | scoreCount
 * - playerId：不同玩家互不相同
 * - localDate：同一天稳定，第二天换新文案
 * - taskId：同一时刻不同任务不会撞
 * - scoreCount：同一天第几次打卡（0 基），让「第二次点」有新文案
 *
 * 这四个字段拼起来，保证「同一事件在任何设备上重放都得到同一结果」。
 */
export function checkinSeed(
  playerId: string,
  localDate: string,
  taskId: string,
  scoreCount: number
): string {
  return `${playerId}|${localDate}|${taskId}|${scoreCount}`;
}

/**
 * 从一个基础种子派生独立流。
 *
 * 为什么必须派生：如果文案流和动画流共用一个序列，
 * 以后「多抽一次文案」就会让动画结果全变——历史截图和实际表现对不上。
 * 给每个用途加后缀再哈希，两条流从此互不影响。
 *
 * 常用 stream 名：'flavor'（文案）、'anim'（动画）、'cover'（复盘卡封面）。
 */
export function seedStream(baseSeed: string, stream: string): () => number {
  return mulberry32(fnv1a32(`${baseSeed}|${stream}`));
}

/**
 * 从数组里按种子挑一个元素。
 *
 * 空数组返回 undefined，由调用方决定回退文案。
 * 用 Math.floor(rand × length) 而不是 round，保证每个元素概率严格相等
 * （round 会让首尾两个元素概率减半）。
 */
export function pickBySeed<T>(items: readonly T[], baseSeed: string, stream: string): T | undefined {
  if (items.length === 0) return undefined;
  const rand = seedStream(baseSeed, stream);
  const index = Math.floor(rand() * items.length);
  // 极端情况下 rand() 返回接近 1 的数，保险起见再钳一次
  return items[Math.min(items.length - 1, index)];
}

/**
 * 按权重挑选。权重为 0 或负数的项不参与。
 *
 * 用于台词库的 weight 字段。全部权重为 0 时退化为等概率，
 * 避免「配置写错 → 永远挑不到任何一条」这种静默 bug。
 */
export function pickWeightedBySeed<T>(
  items: readonly T[],
  weightOf: (item: T) => number,
  baseSeed: string,
  stream: string
): T | undefined {
  if (items.length === 0) return undefined;

  const weights = items.map((it) => Math.max(0, weightOf(it)));
  const total = weights.reduce((s, w) => s + w, 0);

  if (total <= 0) {
    // 权重全无效：退化成等概率，保证一定有结果
    return pickBySeed(items, baseSeed, stream);
  }

  const rand = seedStream(baseSeed, stream);
  let target = rand() * total;

  for (let i = 0; i < items.length; i++) {
    target -= weights[i];
    if (target < 0) return items[i];
  }
  // 浮点误差兜底：取最后一个权重非 0 的项
  for (let i = items.length - 1; i >= 0; i--) {
    if (weights[i] > 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * 由种子生成 [min, max] 闭区间的整数。
 *
 * 只用于动画时长/粒子数量这类表现参数，不用于任何奖励数值。
 */
export function intBySeed(
  min: number,
  max: number,
  baseSeed: string,
  stream: string
): number {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  if (hi <= lo) return lo;
  const rand = seedStream(baseSeed, stream);
  return lo + Math.floor(rand() * (hi - lo + 1));
}
