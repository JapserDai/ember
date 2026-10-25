/**
 * 人物资料的规则：名字与自我介绍
 *
 * 为什么规则单独成一个纯函数文件，而不是散在页面里：
 *   1. 这些规则要在**三个地方**成立——输入框的实时提示、保存前的校验、
 *      以及以后导出导入时的合法性检查。写在页面里就注定只在一处生效。
 *   2. 它们都是纯计算（长度、字数、禁用词），不需要 React、不需要数据库，
 *      所以可以脱离模拟器验证。这个仓库已经有 prng / avatar / balance 的先例。
 *
 * 与「不评判」底线的关系（docs/02 §2.4）：
 *   名字和自我介绍是用户自己写的东西，App **不该**替它判定「不好」。
 *   所以这里只拦两类：
 *   - **物理上放不下的**（太长、空、只有空白）；
 *   - **禁用词表里的词**——那是全 App 的底线，用户在自己写的字段里
 *     写「必须」「失败」也照样会被别的页面读成对用户说的话。
 *   除此之外，写「躺平」「摆烂」「我最近很糟」一律放行。
 *   自我描述不是 KPI，用户有权在这里说难听的话——只是不能说出会被
 *   这个 App 当成「它在评价你」的那几个词。
 *
 * 本文件是纯函数：不 import React、不碰数据库。
 */
import { containsForbiddenWord, checkText } from './text-rules';

/** 名字的最大长度（按 Unicode 字符数，不是 UTF-16 长度） */
export const NAME_MAX = 16;

/** 自我介绍的最大长度 */
export const BIO_MAX = 80;

/** 名字为空时界面显示的占位名。与 db/seed.ts 的默认值保持一致 */
export const DEFAULT_NAME = '旅人';

/**
 * 按「用户感知到的字数」计长度。
 *
 * 为什么不用 `str.length`：那是 UTF-16 码元数。一个 emoji（比如 🌱）在
 * JS 里是 2，在用户眼里是 1；中文常用字是 1，但「𠮷」这种增补平面字也是 2。
 * 用户数的是「几个字」，不是「几个码元」，所以用 Array.from 按码点切。
 *
 * 代价：复合 emoji（👨‍👩‍👧 这类由多个码点 + ZWJ 组成的）仍会被算成好几个字。
 * 这是已知的偏差，不值得为了它引入一个 segmenter 依赖。
 */
export function charCount(text: string): number {
  return Array.from(text).length;
}

/**
 * 名字的规范化：去掉首尾空白，把连续空白压成一个空格。
 *
 * 为什么要压内部空白：名字会出现在页头、以后的备份文件、以及回忆页的叙述里。
 * 一个名字里带三个空格，会在这些地方各自排版成不同的样子。
 * 只压空白，不动别的字符——不折叠大小写、不做繁简转换，
 * 用户写的是什么就存什么。
 */
export function normalizeName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * 自我介绍的规范化：去掉首尾空白，**保留内部换行**。
 *
 * 与名字不同，这里不压空白：自我介绍是一小段话，用户可能想分段。
 * 只把行尾空白去掉、把连续空行压成一个空行——不然一行纯空格会变成
 * 一个看不见的高度。
 */
export function normalizeBio(raw: string): string {
  return raw
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 一次校验的结果 */
export type ProfileCheck =
  | { ok: true; value: string }
  | { ok: false; reason: string };

/**
 * 校验名字。
 *
 * 返回的 value 是**规范化之后**的值——调用方直接存它，
 * 不要存原始输入，否则库里会出现「张三 」和「张三」两种。
 */
export function checkName(raw: string): ProfileCheck {
  const value = normalizeName(raw);

  if (value.length === 0) {
    // 空名字不报错，只是不保存：界面把输入框退回当前名字即可。
    // 这里仍然返回 reason，让调用方能区分「空」和「太长」两种失败
    return { ok: false, reason: '名字不能是空的。' };
  }

  const count = charCount(value);
  if (count > NAME_MAX) {
    return { ok: false, reason: `名字最多 ${NAME_MAX} 个字，现在是 ${count} 个。` };
  }

  if (containsForbiddenWord(value)) {
    // 文案说「换个说法」，不说「不合格」——后者是评判，前者是下一步做什么
    return { ok: false, reason: '这个名字里有几个字用不了，换一种写法试试。' };
  }

  return { ok: true, value };
}

/** 校验自我介绍。规则与 checkName 同一套，只是长度不同、允许为空 */
export function checkBio(raw: string): ProfileCheck {
  const value = normalizeBio(raw);

  // 自我介绍可以为空：不是每个人都想写，而且「不写」本身是一种表达
  if (value.length === 0) return { ok: true, value: '' };

  const count = charCount(value);
  if (count > BIO_MAX) {
    return { ok: false, reason: `最多 ${BIO_MAX} 个字，现在是 ${count} 个。` };
  }

  if (containsForbiddenWord(value)) {
    return { ok: false, reason: '这段话里有几个字用不了，换一种写法试试。' };
  }

  return { ok: true, value };
}

/**
 * 把命中的禁用词取出来，供界面做「哪几个字有问题」的提示。
 *
 * 只返回词本身，不返回位置：位置会随输入实时变化，
 * 把光标位置高亮做出来需要富文本输入框，而这一版的输入框是原生的 TextInput。
 * 知道是哪几个词，用户自己就能找到。
 */
export function forbiddenWordsIn(text: string): string[] {
  return checkText(text).hits;
}
