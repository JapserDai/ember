/**
 * 叙事内容包（阶段 5）。
 *
 * ---- 为什么内容与代码分离 ----
 *
 * docs/05 的卡点预判写得很清楚：「文案写不出来或写得尬 → 先做无剧情版，
 * 剧情以 JSON 内容包增量补，不改代码」。
 *
 * 所以这一层的设计目标是：**加内容不需要改 .ts**。
 * 四季故事、月度活动、回忆卡的文案全部是纯数据，
 * 放在这个文件里（或将来拆成 JSON 资源），逻辑只负责「什么时候解锁哪一段」。
 *
 * ---- 为什么不是真的 .json 文件 ----
 *
 * 用 .ts 常量而不是 .json 资源：
 *   1. 类型检查。写错一个字段名，`.json` 要到运行时才炸，而 .ts 在编译期就报。
 *   2. 不用管 Metro 的 asset 解析与 `require` 路径。
 *   3. 这一版的内容是只读的常量，不需要热更新。
 * 代价是「改文案要重新构建」，但这是本地 App，构建一次就是一次安装包。
 *
 * ---- 季节与「章节」的区别 ----
 *
 * D15 删掉了章节系统（章节是「把人生切成阶段」的规划隐喻）。
 * 四季叙事不是章节：它不安排你要做什么，也不标「第几章」。
 * 它只是**在累计记录够多之后，给你一段可以读的东西**。
 * 解锁条件是累计打卡天数，不是连续天数——断更不会让故事倒退。
 */

/** 一季 */
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** 四季的中文名与它对应哪几个月（北半球，1 基月份） */
export const SEASONS: ReadonlyArray<{
  id: Season;
  name: string;
  months: readonly number[];
  /** 一句话说这一季在讲什么 */
  theme: string;
}> = [
  { id: 'spring', name: '春', months: [3, 4, 5], theme: '开始' },
  { id: 'summer', name: '夏', months: [6, 7, 8], theme: '长起来' },
  { id: 'autumn', name: '秋', months: [9, 10, 11], theme: '收' },
  { id: 'winter', name: '冬', months: [12, 1, 2], theme: '安静下来' },
];

/** 按月份判断属于哪一季 */
export function seasonOfMonth(month: number): Season {
  for (const season of SEASONS) {
    if (season.months.includes(month)) return season.id;
  }
  // 12 / 1 / 2 都覆盖了，理论上到不了这里；退到冬比较合理
  return 'winter';
}

/** 一段故事文本 */
export interface StorySegment {
  /** 稳定 id，用于记录「读到哪一段」 */
  id: string;
  /** 正文。2–4 句，短 */
  text: string;
  /**
   * 解锁需要的**累计记录天数**。
   *
   * 为什么是累计而不是连续：连续天数会把「断更」变成「故事倒退」，
   * 而验收标准明确要求「断更 2 周后回归，剧情不惩罚」。
   */
  requiresDays: number;
}

/** 一季的故事：6–8 段 */
export interface SeasonStory {
  season: Season;
  name: string;
  /** 这一季的插画说明。这一版没有插画（降级方案：几何图形），所以它是一句话 */
  illustration: string;
  segments: readonly StorySegment[];
}

/**
 * 四季故事。
 *
 * 写作规则：
 *   - 第二人称、现在时、短句；
 *   - 不评价用户（不说「你坚持得很好」），只描述季节与动作；
 *   - 不出现禁用词；
 *   - 每季 6 段，解锁门槛从 3 天到 60 天，跨度让「三个月」有节奏。
 */
export const SEASON_STORIES: readonly SeasonStory[] = [
  {
    season: 'spring',
    name: '春',
    illustration: '一片刚化开的土，上面有一道细缝',
    segments: [
      { id: 'sp-1', text: '土化开了。上面有一道很细的缝，是去年冬天冻出来的。', requiresDays: 3 },
      { id: 'sp-2', text: '缝隙里有一点绿。它不是被种下去的，是自己来的。', requiresDays: 8 },
      { id: 'sp-3', text: '这几天风大。有些东西被吹走了，有些东西扎得更深。', requiresDays: 14 },
      { id: 'sp-4', text: '你开始分得清哪些是急着长的，哪些是真的在长。', requiresDays: 21 },
      { id: 'sp-5', text: '有一天下雨，你没出门。那天也算数。', requiresDays: 30 },
      { id: 'sp-6', text: '春天过完的时候，那道缝已经看不出是缝了。', requiresDays: 45 },
    ],
  },
  {
    season: 'summer',
    name: '夏',
    illustration: '正午的一块石头，投下一小片影子',
    segments: [
      { id: 'su-1', text: '白天变长了。长到你开始觉得，一天里可以做不止一件事。', requiresDays: 3 },
      { id: 'su-2', text: '正午的石头是烫的。影子只有一小片，但它是凉的。', requiresDays: 10 },
      { id: 'su-3', text: '有些日子你什么都没做，只是坐着。那也过完了。', requiresDays: 18 },
      { id: 'su-4', text: '你发现自己在做一些以前要提醒才做的事。', requiresDays: 26 },
      { id: 'su-5', text: '热的时候人会慢下来。慢下来的那几天不是白过的。', requiresDays: 35 },
      { id: 'su-6', text: '夏天快结束的时候，天黑得早了一点。你没注意到是哪一天开始的。', requiresDays: 50 },
    ],
  },
  {
    season: 'autumn',
    name: '秋',
    illustration: '一张桌子上摊开的三样东西',
    segments: [
      { id: 'au-1', text: '早上有点凉了。你开始把窗户关上一半。', requiresDays: 3 },
      { id: 'au-2', text: '有些事在这个时候结果了，有些事没有。两样都留在桌上。', requiresDays: 10 },
      { id: 'au-3', text: '你把做过的事摊开看了一遍。它们比你想的多。', requiresDays: 18 },
      { id: 'au-4', text: '叶子落下来的时候不着急。它已经在那儿待了一整个夏天。', requiresDays: 28 },
      { id: 'au-5', text: '你开始知道哪些事值得留着，哪些可以放下了。', requiresDays: 40 },
      { id: 'au-6', text: '秋天的最后几天，风把桌面吹干净了。', requiresDays: 60 },
    ],
  },
  {
    season: 'winter',
    name: '冬',
    illustration: '一扇亮着灯的窗，窗外是黑的',
    segments: [
      { id: 'wi-1', text: '天黑得很早。你开灯的时间一天比一天早一点。', requiresDays: 3 },
      { id: 'wi-2', text: '外面很冷的时候，屋里那点温度就够了。', requiresDays: 10 },
      { id: 'wi-3', text: '有些日子你什么都不想做。那种日子也有它的样子。', requiresDays: 18 },
      { id: 'wi-4', text: '你注意到自己还在做那几件事。不是因为坚持，是因为习惯了。', requiresDays: 28 },
      { id: 'wi-5', text: '冬天不要求你长。它只要求你还在。', requiresDays: 40 },
      { id: 'wi-6', text: '窗上的雾散开一小块，你能看见外面了。', requiresDays: 60 },
    ],
  },
];

/** 按季取故事 */
export function storyOf(season: Season): SeasonStory | null {
  return SEASON_STORIES.find((story) => story.season === season) ?? null;
}

/**
 * 某一季里，按累计天数已经解锁到第几段。
 *
 * 返回已解锁的段（从第 1 段开始连续）。**不跳段**：
 * 如果累计 20 天，就解锁 requiresDays ≤ 20 的所有段，
 * 而不是「只解锁第 4 段」。故事是顺着读的。
 */
export function unlockedSegments(
  season: Season,
  totalDays: number
): readonly StorySegment[] {
  const story = storyOf(season);
  if (!story) return [];
  return story.segments.filter((segment) => totalDays >= segment.requiresDays);
}

/**
 * 下一段还差多少天。null 表示这一季已经读完。
 *
 * 界面用它显示「再记 X 天，下一段会出来」。
 */
export function nextSegmentGap(season: Season, totalDays: number): number | null {
  const story = storyOf(season);
  if (!story) return null;
  const next = story.segments.find((segment) => totalDays < segment.requiresDays);
  return next ? next.requiresDays - totalDays : null;
}
