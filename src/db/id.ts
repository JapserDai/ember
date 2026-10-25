/**
 * Ember 数据层 · 本地 ID 生成
 *
 * 为什么单独一个文件：client.ts 要导入 seed.ts，seed.ts 又需要生成 ID，
 * 放在 client 里会形成循环依赖。ID 生成不依赖数据库，抽出来最干净。
 *
 * 为什么不装 uuid 库：这是完全离线的单机 App，同一毫秒内几乎不可能生成两条记录，
 * 时间戳 + 随机后缀已经够用，少一个依赖就少一个构建风险。
 */

/** 生成一个本地唯一 ID（时间戳的 36 进制 + 随机后缀） */
export function newId(): string {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `${timePart}-${randomPart}`;
}
