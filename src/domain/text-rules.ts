/**
 * 文案规则：禁用词表与校验
 *
 * 这个 App 的立场是「永不惩罚」。所以不是靠写文案时自觉，而是靠一个过滤器兜底：
 * 任何动态生成的文案（台词、复盘、事件、通知）在显示前都要过一遍这里。
 *
 * 词表来源：docs/02-产品规格.md §2.4「绝不出现的文案（禁用词表）」。
 * 改词表要同步改文档；文档里的清单和这里的常量必须是同一份。
 *
 * 本文件是纯函数：不 import React、不碰数据库。
 */

/**
 * 禁用词（子串匹配，命中任意一个即视为不合格）。
 *
 * 分类说明：
 * - 失败类：「失败」「前功尽弃」「差一点」「太可惜」——把结果说成不可挽回
 * - 惩罚类：「惩罚」「归零」——暗示会有代价
 * - 命令类：「必须」「应该」「不准偷懒」——剥夺选择权
 * - 羞辱类：「你让……失望」「受伤」「饿死」——情感勒索
 * - 比较类：「排行榜」「别人已经」——制造攀比
 */
export const FORBIDDEN_WORDS = [
  '失败',
  '惩罚',
  '归零',
  '前功尽弃',
  '必须',
  '应该',
  '不准偷懒',
  '太可惜',
  '差一点',
  '你让',
  '失望',
  '受伤',
  '饿死',
  '排行榜',
  '别人已经',
] as const;

/** 禁用词类型（联合字面量，便于测试穷举） */
export type ForbiddenWord = (typeof FORBIDDEN_WORDS)[number];

/**
 * 逐字拆开的重叠变体。
 *
 * 为什么需要：用户/模板可能写成「前功尽弃」中间夹空格，或写「归 零」。
 * 这里不搞复杂正则，只把两字及以上的词拆成「字符间允许零个或多个空白」的模式，
 * 这样「归 零」「归　零」都能抓到，而不会误伤「归零度」这种正常词——
 * 因为匹配的是完整词，不是单字。
 */
function buildLoosePattern(word: string): RegExp {
  // 转义正则元字符（词表里目前没有，但以后加词时别踩坑）
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // 每个字符之间允许出现空白（含全角空格 　、不换行空格  ）
  const chars = escaped.split('');
  return new RegExp(chars.join('[\\s\\u3000\\u00A0]*'), 'g');
}

/** 预编译模式：模块加载时算一次，校验时不再重复构造正则 */
const LOOSE_PATTERNS: ReadonlyArray<{ word: ForbiddenWord; re: RegExp }> = FORBIDDEN_WORDS.map(
  (word) => ({ word, re: buildLoosePattern(word) })
);

/** 校验结果：命中时给出命中的词与位置，方便定位模板 */
export interface ForbiddenCheckResult {
  /** 是否含有禁用词 */
  hasForbidden: boolean;
  /** 命中的词（去重，保持首次出现顺序） */
  hits: ForbiddenWord[];
  /** 每个命中词第一次出现的位置（原文下标，可能因空白变体略有偏差，仅用于定位） */
  positions: number[];
}

/**
 * 校验一段文本是否含有禁用词。
 *
 * 用法：
 *   if (containsForbiddenWord(line)) { 换一条 }
 *
 * 细节：
 * - 空字符串 / null / undefined 一律视为通过（没有内容就没有问题）；
 * - 允许字符间有空白，防「归 零」这类绕过；
 * - 中文没有大小写，所以不做大小写折叠；以后要加英文词，在词表里同时列大小写两种写法。
 */
export function containsForbiddenWord(text: string | null | undefined): boolean {
  return checkText(text).hasForbidden;
}

/**
 * 完整校验，返回命中的词与位置。
 *
 * 生成流程里需要知道「命中了哪个词」才能选择替代模板，
 * 所以单独提供一个返回明细的版本。
 */
export function checkText(text: string | null | undefined): ForbiddenCheckResult {
  if (!text || typeof text !== 'string') {
    return { hasForbidden: false, hits: [], positions: [] };
  }

  const hits: ForbiddenWord[] = [];
  const positions: number[] = [];

  for (const { word, re } of LOOSE_PATTERNS) {
    // 每次使用前重置 lastIndex：带 g 标志的正则是有状态的
    re.lastIndex = 0;
    const match = re.exec(text);
    if (match) {
      hits.push(word);
      positions.push(match.index);
    }
  }

  return { hasForbidden: hits.length > 0, hits, positions };
}

/**
 * 把命中的禁用词替换成占位符（用于日志脱敏或调试）。
 *
 * 不用于正式文案——正式流程应该是「不合格就换一条」，
 * 而不是「把词抠掉」。抠词会留下语义破碎的句子。
 */
export function maskForbiddenWords(text: string, mask = '＊＊'): string {
  if (!text) return text;
  let out = text;
  for (const { re } of LOOSE_PATTERNS) {
    re.lastIndex = 0;
    out = out.replace(re, mask);
  }
  return out;
}

/**
 * 从候选池里挑第一条合格的文案。
 *
 * 生成流程（docs 02 §6.2）的最后一步就是「二次校验，不合格则回退到通用池」。
 * 这个函数把「校验 + 回退」封装成一个动作，调用方不需要自己写循环。
 *
 * 参数：
 * - candidates：候选文案（已按权重/种子排好序）
 * - fallback：全部不合格时的兜底文案。兜底文案本身也应合格；
 *   若它也不合格，返回空字符串而不是把脏文案放出去。
 */
export function firstValidText(
  candidates: readonly string[],
  fallback: string = ''
): string {
  for (const c of candidates) {
    if (typeof c === 'string' && c.length > 0 && !containsForbiddenWord(c)) return c;
  }
  return containsForbiddenWord(fallback) ? '' : fallback;
}

/**
 * 面向用户的「难度」展示名。
 *
 * 设置页必须用中性词，不能出现「惩罚」「难度惩罚」。
 * 集中在这里定义，避免各处各写一份导致某个页面漏改。
 */
export const DIFFICULTY_LABEL_TEXT = {
  easy: '温和',
  standard: '标准',
  hard: '硬核',
} as const;

/**
 * 中性状态词表：所有需要「描述没做到」的地方都从这里取。
 *
 * 例如断签后不说「中断」，说「有一段空档」；
 * 任务过期不说「逾期」，说「已收起」。
 */
export const NEUTRAL_COPY = {
  /** 断签 */
  gap: '有一段空档',
  /** 任务过期 */
  expired: '已收起',
  /** 本周未达标 */
  weekOpen: '这周还有空间',
  /** 连胜为 0 */
  streakZero: '从今天重新数也可以',
  /** 次数用尽 */
  doneToday: '今天这一项已经记过了',
} as const;
