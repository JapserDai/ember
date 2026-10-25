/**
 * 本地规则引擎（阶段 5 第 6 条）：温柔复盘 + 任务拆解。
 *
 * ---- 为什么是「规则引擎」而不是 AI ----
 *
 * docs/02 §7.1 写得很清楚：不联网、不需要 API Key、不申请网络权限。
 * 三个约束同时成立时，真 AI 不可行。所以用模板 + 关键词匹配 + 统计规则，
 * 产出「像人写的」结果。
 *
 * **界面上不标注「AI 生成」**，因为它本来就不是。直接叫功能名。
 *
 * ---- 两个功能各自能做什么、不能做什么 ----
 *
 *   温柔复盘：最近 7 天记录 → 120 字以内：一个模式、一件值得保留的小事、
 *             一个下周可尝试的微调。**它不会说你哪里做得不好。**
 *   任务拆解：一件拖着没做的事 → 3 个 15 分钟内能完成的第一步。
 *
 * 两个功能都**不改任何数据**：它们只产出文字，不创建任务、不改数值。
 *
 * ---- 为什么任务拆解用动词库而不是通用建议 ----
 *
 * 「先花 2 分钟把这件事需要的东西列出来」这种兜底是有用的，
 * 但每条都这样就成了废话。所以先用关键词把任务分类
 * （要联系人的 / 要出门的 / 要写东西的 / 要清理的 / 要学的 / 要预约的），
 * 每类给一套更具体的动词，匹配不上才退到通用兜底。
 *
 * 本文件是纯函数：不碰数据库、不读系统时间。
 */
import { checkText } from '../domain/text-rules';

/* ------------------------------------------------------------------ *
 * 温柔复盘
 * ------------------------------------------------------------------ */

/** 复盘要的输入。全部由调用方从库里算好 */
export interface GentleReviewInput {
  /** 最近 7 天有记录的天数 */
  activeDays: number;
  /** 最近 7 天的记录条数 */
  checkins: number;
  /** 记录次数最多的那件事的名字。null 表示没有记录 */
  steadiest: string | null;
  /** 记录最多的时段的中文说法（早上/中午/晚上/深夜）。null 表示没有记录 */
  peakTime: string | null;
  /** 记录最多的那一维的中文名。null 表示没有记录 */
  topAttribute: string | null;
}

/** 复盘的三个部分。分开返回，界面可以分三段显示 */
export interface GentleReview {
  /** 一个模式（你最近是怎么过的） */
  pattern: string;
  /** 一件值得保留的小事 */
  keep: string;
  /** 一个下周可尝试的微调 */
  tweak: string;
}

/**
 * 按「有没有记录 / 记录多少」分三档，各档一套模板。
 *
 * 为什么分档而不是一条通用模板：一条模板在「记了 20 次」和「一次没记」
 * 这两种情况下说的话应该完全不同，而通用模板只能取中间，于是两边都不对。
 */
const PATTERNS = {
  /** 没有记录 */
  none: [
    '这一周没有记录。',
    '这一周空着。',
    '这七天里没有留下记录。',
  ],
  /** 有一点记录（1–3 天） */
  light: [
    '这一周有几天动了动，不多。',
    '这一周记了几天，间隔着来。',
    '这一周动过几次，不算密。',
  ],
  /** 中等（4–5 天） */
  steady: [
    '这一周大多日子都有记录。',
    '这一周差不多一半以上的日子都在。',
    '这一周的记录比较连。',
  ],
  /** 很多（6–7 天） */
  dense: [
    '这一周几乎每天都有记录。',
    '这一周七天里大部分都在。',
    '这一周记得很密。',
  ],
} as const;

/** 值得保留的小事：按最稳的那件事 / 时段 / 维度各一套 */
const KEEPS = {
  withSteady: [
    '「{steady}」是这一周出现最多的。',
    '这一周你记得最多的是「{steady}」。',
    '「{steady}」在这一周里反复出现。',
  ],
  withTime: [
    '你大多在{time}记。',
    '这一周的记录多在{time}。',
    '{time}是你最常坐下来记的时候。',
  ],
  withAttribute: [
    '这一周的时间大多花在{attribute}上。',
    '这一周你往{attribute}那边走得比较多。',
    '{attribute}是这一周花得最多的地方。',
  ],
  /** 什么都没有时 */
  none: ['这一周没有什么特别突出的。', '这一周没有哪一件特别显眼。'],
} as const;

/** 下周的微调：都是「很小的一件」，不是建议，是选项 */
const TWEAKS = {
  none: [
    '下周想动的时候，记一件最小的事就行。',
    '下周试试只记一件，什么都不用改。',
    '下周什么时候想起来，就记一笔。',
  ],
  light: [
    '下周试试把其中一件放在固定的时间。',
    '下周可以挑一件，试试连着记两天。',
    '下周试试少记一件，把剩下的记稳。',
  ],
  steady: [
    '下周试试给其中一件换个时间做，看看感觉。',
    '下周可以什么都不改，就这样过。',
    '下周试试少一件，看看会不会更松。',
  ],
  dense: [
    '下周试试什么都不改，就保持这样。',
    '下周可以挑一件放下，看看会怎么样。',
    '下周试试把其中一件做得更慢一点。',
  ],
} as const;

/**
 * 按种子从一组模板里挑一条。
 *
 * 用种子而不是随机：同一份数据每次进来看到的是同一句话。
 * 随机的话，用户从复盘页退出去再进来，同一周的建议就变了——那会显得这个 App 在抽风。
 */
function pick<T>(items: readonly T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return items[hash % items.length];
}

/** 按记录密度选档 */
function densityOf(activeDays: number): keyof typeof PATTERNS {
  if (activeDays <= 0) return 'none';
  if (activeDays <= 3) return 'light';
  if (activeDays <= 5) return 'steady';
  return 'dense';
}

/**
 * 生成一段温柔复盘。
 *
 * 三条硬规则（与整个 App 一致）：
 *   1. 不说「失败 / 没做到 / 差一点」；
 *   2. 不给建议的口气（「你应该」），只给选项（「可以试试」）；
 *   3. 最后一定要过一遍禁用词表——模板是人写的，人写的也会写错。
 */
export function gentleReview(input: GentleReviewInput): GentleReview {
  const density = densityOf(input.activeDays);
  const seed = `${input.activeDays}|${input.checkins}|${input.steadiest ?? ''}`;

  const pattern = pick(PATTERNS[density], seed + 'p');

  // 「值得保留的小事」按优先级取：最稳的事 > 时段 > 维度 > 无
  let keep: string;
  if (input.steadiest) {
    keep = pick(KEEPS.withSteady, seed + 'k').replace('{steady}', input.steadiest);
  } else if (input.peakTime) {
    keep = pick(KEEPS.withTime, seed + 'k').replace('{time}', input.peakTime);
  } else if (input.topAttribute) {
    keep = pick(KEEPS.withAttribute, seed + 'k').replace('{attribute}', input.topAttribute);
  } else {
    keep = pick(KEEPS.none, seed + 'k');
  }

  const tweak = pick(TWEAKS[density], seed + 't');

  // 三道防线：任何一段命中禁用词，就换成对应的兜底
  return {
    pattern: safe(pattern, PATTERNS[density][0]),
    keep: safe(keep, KEEPS.none[0]),
    tweak: safe(tweak, TWEAKS.none[0]),
  };
}

/** 命中禁用词就换兜底。兜底也命中就返回空串（宁可少一句，不放脏话） */
function safe(text: string, fallback: string): string {
  if (!checkText(text).hasForbidden) return text;
  return checkText(fallback).hasForbidden ? '' : fallback;
}

/** 把三段拼成一句话（120 字以内）。界面可以用它一次性显示 */
export function reviewAsText(review: GentleReview): string {
  const parts = [review.pattern, review.keep, review.tweak].filter((part) => part.length > 0);
  const joined = parts.join('');
  // 120 字上限：按码点截，不切坏 emoji
  const chars = Array.from(joined);
  return chars.length <= 120 ? joined : chars.slice(0, 120).join('');
}

/* ------------------------------------------------------------------ *
 * 任务拆解
 * ------------------------------------------------------------------ */

/** 一类任务的拆解模板 */
interface BreakdownRule {
  /** 命中这些关键词就用这一套 */
  keywords: readonly string[];
  /** 三个第一步。顺序就是建议的顺序 */
  steps: readonly string[];
}

/**
 * 关键词 → 拆解模板。
 *
 * 顺序有意义：先匹配更具体的类（联系 / 预约 / 出门），
 * 再匹配宽泛的类（写 / 清理 / 学）。因为「给医生打电话预约」
 * 既命中「打电话」也命中「预约」，它应该走「预约」那一套。
 */
const BREAKDOWN_RULES: readonly BreakdownRule[] = [
  {
    keywords: ['预约', '挂号', '报名', '申请', '办证', '续费', '缴费'],
    steps: [
      '先查清楚要带什么、在哪儿办。',
      '把要带的材料找出来放一起。',
      '约一个具体的时间，写下来。',
    ],
  },
  {
    keywords: ['联系', '打电话', '发消息', '问', '回复', '告诉', '约', '沟通'],
    steps: [
      '先想清楚你要说的第一句话是什么。',
      '找到那个人的联系方式，打开对话框。',
      '把第一句话发出去，不用想后面说什么。',
    ],
  },
  {
    keywords: ['体检', '看医生', '去医院', '牙', '复诊'],
    steps: [
      '先查一下最近的号什么时候放。',
      '把要问的问题写下来，两三个就够。',
      '约一个具体的时间。',
    ],
  },
  {
    keywords: ['出门', '寄', '取', '买', '送', '搬', '退'],
    steps: [
      '先确认要带什么、去哪儿、什么时候关门。',
      '把要带的东西放到门口。',
      '定一个出门的时间。',
    ],
  },
  {
    keywords: ['整理', '收拾', '打扫', '清理', '丢', '归类', '归档'],
    steps: [
      '先划一个范围：就这一格抽屉，不是整间屋子。',
      '把不属于这里的东西拿出来放一边。',
      '剩下的摆回去，就停。',
    ],
  },
  {
    keywords: ['写', '填', '文档', '报告', '总结', '简历', '邮件', '稿'],
    steps: [
      '先写一行：这件事一句话是什么。',
      '把要写的几点列成三个短句，不用成文。',
      '从最容易的那一点开始写两句。',
    ],
  },
  {
    keywords: ['读', '学', '看', '复习', '背', '课', '教程'],
    steps: [
      '先只打开它，看到哪儿算哪儿。',
      '读一页，或者五分钟。',
      '把读到的一句记下来。',
    ],
  },
  {
    keywords: ['修', '装', '换', '弄好', '设置', '配置'],
    steps: [
      '先拍一张现在是什么样子的照片。',
      '查一下需要什么工具或零件。',
      '只做第一步：把该拆的拆下来，或者把东西买回来。',
    ],
  },
];

/** 匹配不上时用这套。它是最小可行动的兜底 */
const FALLBACK_STEPS: readonly string[] = [
  '先花两分钟，把这件事需要的东西列出来。',
  '把这件事拆成「第一步做什么」，只写一步。',
  '做那一步，做完就停。',
];

/**
 * 拆解一件拖着没做的事。
 *
 * 返回三个第一步，每个都是 15 分钟内能完成的。
 *
 * 为什么正好三个：一个太少（等于没拆），五个太多（又变成一张清单）。
 * 三个是「能看见全貌、又不至于压人」的数。
 *
 * 匹配不到任何关键词时用通用兜底——兜底不是失败，
 * 它本身就是一条有效的建议（把事拆成一步）。
 */
export function breakdownTask(title: string): string[] {
  const text = (title ?? '').trim();
  if (text.length === 0) return [...FALLBACK_STEPS];

  for (const rule of BREAKDOWN_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      // 三道防线：命中禁用词就退到兜底
      const steps = [...rule.steps];
      if (steps.some((step) => checkText(step).hasForbidden)) return [...FALLBACK_STEPS];
      return steps;
    }
  }

  return [...FALLBACK_STEPS];
}
