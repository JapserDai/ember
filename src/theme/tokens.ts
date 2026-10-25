/**
 * 主题 token —— 全项目唯一允许出现十六进制色值的地方。
 *
 * 规则：
 * 1. 界面代码只读 token，不写死颜色。任何组件里出现 #B23A17 这样的字面值都是 bug。
 * 2. 四套主题结构完全一致，只替换色板、圆角、阴影、间距与字号。
 * 3. 派生值（textMuted / border / rule / onPrimary / highlight）在这里一次算好，
 *    组件不要自己拼透明度。
 *
 * 色值来源：docs/02-产品规格.md §1.2–§1.5。
 */

/** 主题 id，与 settings.theme_id 的取值一一对应 */
export type ThemeId = 'furnace' | 'nightvoyage' | 'tundra' | 'daybreak';

/** 主题模式，与 settings.theme_mode 的取值一一对应 */
export type ThemeMode = 'system' | 'light' | 'dark';

/** 实际生效的明暗方案（system 解析之后只剩这两个值） */
export type ResolvedScheme = 'light' | 'dark';

/** 色板：一套主题在某个明暗方案下的全部颜色 */
export interface Palette {
  /** 主色：已点着的炭、主按钮、进度 */
  primary: string;
  /** 辅色：未点亮状态、次要图标。必须能当小字颜色用 */
  secondary: string;
  /** 页面背景 */
  background: string;
  /** 面板、底栏、输入框。比 background 略亮或略暗一档 */
  surface: string;
  /** 正文文字 */
  text: string;
  /**
   * 强调色：火焰核心、光晕、圆点填充。
   * 只用于非文字元素——它在背景上的对比度不够正文标准，当文字色会看不清。
   */
  accent: string;
  /** 正向状态（已完成、已达成） */
  success: string;
  /** 提醒状态（可修复、待确认） */
  warning: string;
  /** 危险状态（删除、清空），只用于操作确认，不用于评价用户 */
  danger: string;

  // ---- 以下为派生值，不要手写 ----
  /** 次要文字：text 按各主题的透明度，对比度仍 ≥ 4.5:1 */
  textMuted: string;
  /** 行分隔线、描边：很淡，只用来分组，不制造视觉噪音 */
  border: string;
  /** 区块分隔线：比 border 重一档，用在区块之间 */
  rule: string;
  /** 主色之上的文字。亮色主题取近白，暗色主题取近黑 */
  onPrimary: string;
  /**
   * 高光：accent 向白色混合后的亮色。
   * 用途：火心、闪耀状态的亮点。亮色主题下 accent 偏深，
   * 直接当火心会像一块脏斑；暗色主题下也需要比 accent 再亮一档。
   */
  highlight: string;
  /**
   * 暗调主色：primary 往「离背景更近」的方向混合。
   *
   * 用途：火焰的侧舌——烧得最弱的那一股。
   * 亮色主题下往深混，暗色主题下往背景混：两个方向都是「更沉、更弱」，
   * 而不是简单地变亮或变暗。
   *
   * 为什么不直接用透明度：透明色叠在背景上会变亮（浅底）或变暗（深底），
   * 结果在浅色主题里看起来像高光，跑到前面来了，跟「弱的那股火」正好相反。
   */
  primaryDeep: string;
}

/** 圆角 */
export interface RadiusTokens {
  /** 卡片 */
  card: number;
  /** 按钮 */
  button: number;
  /** 输入框 */
  input: number;
  /** 胶囊 / 标签 */
  pill: number;
}

/** 间距：基数 4，其余按主题的疏密调整 */
export interface SpacingTokens {
  /** 间距基数 */
  base: number;
  /** 页面左右留白 */
  pageX: number;
  /** 卡片内边距 */
  cardPadding: number;
  /** 卡片之间的间距 */
  cardGap: number;
  /** 4 */
  xs: number;
  /** 8 */
  sm: number;
  /** 12 */
  md: number;
  /** 16 */
  lg: number;
  /** 24 */
  xl: number;
  /** 32 */
  xxl: number;
}

/** 字号与行高 */
export interface TypographyTokens {
  size: {
    /** 页面主标题，如首页那句问候 */
    title: number;
    /** 区块标题、等级与称号 */
    heading: number;
    /** 正文 */
    body: number;
    /** 按钮文字、小标题 */
    label: number;
    /** 辅助说明、tab 文字 */
    caption: number;
  };
  lineHeight: {
    title: number;
    heading: number;
    body: number;
    label: number;
    caption: number;
  };
  weight: {
    regular: '400';
    /**
     * 中间档：**只用于交互状态的强调**（未完成的标题比已完成的重一档），
     * 不参与字号层级的搭建。四套主题都必须给值——做成可选的话，
     * 缺这一档的主题里「未完成」与「已完成」会悄悄变成同一个字重，
     * 而这种失效不会报错，只会看起来「有点不对」。
     */
    medium: '500';
    semibold: '600';
  };
  /**
   * 字体族。
   * 阶段 1 还没有打包字体（expo-font + 子集化字体在阶段 2 接入），
   * 这里留空表示使用系统字体；接入后只改这个对象，组件不用动。
   */
  fontFamily: {
    title?: string;
    body?: string;
    mono?: string;
  };
}

/** 阴影（Android 用 elevation，其余字段为 iOS 预留） */
export interface ShadowTokens {
  card: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
}

/** 动效时长（毫秒）。reduce_motion = 1 时组件应跳过位移动画 */
export interface MotionTokens {
  fast: number;
  normal: number;
  slow: number;
}

/** 一套完整主题 */
export interface Theme {
  id: ThemeId;
  /** 中文名，用于「设置 → 外观 → 主题」列表 */
  name: string;
  /** 一句话气质，用于主题选择页 */
  tagline: string;
  /** 亮色板 */
  light: Palette;
  /**
   * 暗色板。
   * 只有亮版的晨光把 dark 指向与 light 同一个对象——不是忘了做，
   * 而是 resolveScheme 保证它永远不会被取到（见 supportsDark）。
   * 类型保持必填，读 theme.dark 的代码不用到处处理 undefined。
   */
  dark: Palette;
  /**
   * 这套主题有没有暗色版。四套里只有晨光是 false。
   * false 时 themeMode 怎么选、系统是深是浅，都解析为亮色（docs/02 §1.5）。
   */
  supportsDark: boolean;
  /**
   * 跟随系统且系统未给出偏好时的默认方案。
   * 夜航的暗色是设计主场，炉边、苔原、晨光默认亮色。
   */
  defaultScheme: ResolvedScheme;
  radius: RadiusTokens;
  spacing: SpacingTokens;
  typography: TypographyTokens;
  shadow: ShadowTokens;
  /** 卡片描边宽度。苔原与晨光用描边代替阴影 */
  borderWidth: number;
  /** 最小触控尺寸，无障碍要求 44 */
  touchTarget: number;
  motion: MotionTokens;
}

/**
 * 把 #RRGGBB 转成 rgba 字符串。
 * 只接受 6 位十六进制；非法输入原样返回，避免渲染出不可预期的颜色。
 */
export function withAlpha(hex: string, alpha: number): string {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  const clamped = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${clamped})`;
}

/**
 * 把 #RRGGBB 与另一种颜色按比例混合。
 * ratio = 0 返回 base，ratio = 1 返回 mix。
 *
 * 导出给需要「比某个 token 再亮/再暗一档」的组件用（目前只有火焰的芯）。
 * 能在这里算的派生色就不要在组件里算。
 */
export function mixHex(hexA: string, hexB: string, ratio: number): string {
  const a = hexA.replace('#', '');
  const b = hexB.replace('#', '');
  if (a.length !== 6 || b.length !== 6) return hexA;
  const t = Math.min(1, Math.max(0, ratio));
  const channel = (i: number) => {
    const va = parseInt(a.slice(i, i + 2), 16);
    const vb = parseInt(b.slice(i, i + 2), 16);
    if (Number.isNaN(va) || Number.isNaN(vb)) return 0;
    return Math.round(va + (vb - va) * t);
  };
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(channel(0))}${toHex(channel(2))}${toHex(channel(4))}`;
}

/** 未加派生的原始色板 */
interface RawPalette {
  primary: string;
  secondary: string;
  background: string;
  surface: string;
  text: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
}

/** 派生规则：三档透明度 + 主色之上的文字 + 火心混合比例 */
interface PaletteOptions {
  /** 行分隔线的不透明度 */
  borderAlpha: number;
  /** 区块分隔线的不透明度 */
  ruleAlpha: number;
  /** 次要文字的不透明度。取值要让结果在背景上仍 ≥ 4.5:1 */
  mutedAlpha: number;
  /** 主色之上的文字 */
  onPrimary: string;
  /** 火心向白色混合的比例 */
  highlightMix: number;
  /** 暗调主色往哪个方向混：深色主题往背景混，亮色主题往文字色混 */
  deepMixTarget: string;
  /** 暗调主色的混合比例 */
  deepMix: number;
}

/** 由原始色板算出派生值 */
function buildPalette(raw: RawPalette, options: PaletteOptions): Palette {
  return {
    ...raw,
    textMuted: withAlpha(raw.text, options.mutedAlpha),
    border: withAlpha(raw.text, options.borderAlpha),
    rule: withAlpha(raw.text, options.ruleAlpha),
    onPrimary: options.onPrimary,
    // 与白色混合，得到比 accent 亮一档的火心色
    highlight: mixHex(raw.accent, '#FFFFFF', options.highlightMix),
    // 往「离背景更近」的方向混合，得到弱一档的那股火
    primaryDeep: mixHex(raw.primary, options.deepMixTarget, options.deepMix),
  };
}

// ---------------------------------------------------------------------------
// 炉边 furnace —— 灰烬、烟炱、余烬、炭火
//
// 这不是「暖色调」的泛称，是炉膛里四样东西的实际颜色：
//   房间是冷的（ash 冷中性），火是暖的（ember 偏红、coal 偏橙）。
// 背景刻意不用奶油色、主色刻意不用陶土色——那是「温暖」这个词的默认答案，
// 而陶土是陶器的颜色：哑光、土气、不发光。余烬不是。
// 全屏唯一发光的东西是火，靠对比当主角，不靠尺寸。
// ---------------------------------------------------------------------------

const furnaceLight = buildPalette(
  {
    primary: '#B23A17', // 余烬：唯一的高饱和暖色，4.9:1 on ash
    secondary: '#6B6862', // 炉渣：未点着的炭、次要小字
    background: '#EAE8E3', // 灰烬：房间的冷中性，几乎无彩
    surface: '#F6F4EF', // 纸：底栏与输入框，只比背景亮一点
    text: '#201D1B', // 烟炱：带一点红底的黑，不是纯黑
    accent: '#D97B2B', // 炭火：火心与光晕，只用于非文字元素
    success: '#4E6B45',
    warning: '#8F5314',
    danger: '#A02F26',
  },
  {
    borderAlpha: 0.12,
    ruleAlpha: 0.24,
    mutedAlpha: 0.68,
    onPrimary: '#F6F4EF',
    highlightMix: 0.55,
    // 亮色主题：往文字色（烟炱）混，侧舌变深
    deepMixTarget: '#201D1B',
    deepMix: 0.3,
  },
);

const furnaceDark = buildPalette(
  {
    primary: '#E4633A', // 夜里余烬更亮、更偏橙
    secondary: '#8E8A83',
    background: '#17161A', // 熄灯后的房间，偏冷的近黑
    surface: '#211F25',
    text: '#EDE7DF', // 火光映在墙上的暖白
    accent: '#F2A24F',
    success: '#8FB57C',
    warning: '#E0A85A',
    danger: '#D9717C',
  },
  {
    borderAlpha: 0.14,
    ruleAlpha: 0.22,
    mutedAlpha: 0.64,
    onPrimary: '#17161A',
    highlightMix: 0.35,
    // 暗色主题：往背景混，侧舌变沉
    deepMixTarget: '#17161A',
    deepMix: 0.4,
  },
);

// ---------------------------------------------------------------------------
// 夜航 nightvoyage —— 深海蓝，驾驶舱面板，信息密度更高
// ---------------------------------------------------------------------------

const nightvoyageLight = buildPalette(
  {
    primary: '#33507F',
    secondary: '#5A6B87',
    background: '#EEF1F6',
    surface: '#F8FAFD',
    text: '#1A2233',
    accent: '#2E7F93',
    success: '#47795C',
    warning: '#A9702A',
    danger: '#A33F4B',
  },
  {
    borderAlpha: 0.14,
    ruleAlpha: 0.22,
    mutedAlpha: 0.68,
    onPrimary: '#FFFFFF',
    highlightMix: 0.5,
    deepMixTarget: '#1A2233',
    deepMix: 0.3,
  },
);

const nightvoyageDark = buildPalette(
  {
    primary: '#7C9BD1',
    secondary: '#93A3BE',
    background: '#0D131E',
    surface: '#161E2C',
    text: '#DCE6F5',
    accent: '#63C3D6',
    success: '#6FB58C',
    warning: '#E0A85A',
    danger: '#D9717C',
  },
  {
    borderAlpha: 0.14,
    ruleAlpha: 0.22,
    mutedAlpha: 0.64,
    // 主色是浅蓝，压白字只有 2.8:1；深色字才有 6.6:1
    onPrimary: '#0D131E',
    highlightMix: 0.25,
    deepMixTarget: '#0D131E',
    deepMix: 0.4,
  },
);

// ---------------------------------------------------------------------------
// 苔原 tundra —— 苔藓绿，纸面排版，用描边代替阴影
// ---------------------------------------------------------------------------

const tundraLight = buildPalette(
  {
    primary: '#4F6B4A',
    secondary: '#6E7A64',
    background: '#F4F5EF',
    surface: '#FCFDF8',
    text: '#262B22',
    accent: '#8A6A3B',
    success: '#5B7A4E',
    warning: '#9A742C',
    danger: '#9C4A3C',
  },
  {
    borderAlpha: 0.1,
    ruleAlpha: 0.18,
    mutedAlpha: 0.68,
    onPrimary: '#FCFDF8',
    highlightMix: 0.5,
    deepMixTarget: '#262B22',
    deepMix: 0.3,
  },
);

const tundraDark = buildPalette(
  {
    primary: '#93B08A',
    secondary: '#A8B49C',
    background: '#141713',
    surface: '#1E231B',
    text: '#E7EBDD',
    accent: '#C9A76B',
    success: '#8FB57C',
    warning: '#D2A85E',
    danger: '#CE7A6A',
  },
  {
    borderAlpha: 0.1,
    ruleAlpha: 0.18,
    mutedAlpha: 0.64,
    // 主色是浅绿，压白字只有 2.3:1；深色字才有 7.6:1
    onPrimary: '#141713',
    highlightMix: 0.3,
    deepMixTarget: '#141713',
    deepMix: 0.4,
  },
);

// ---------------------------------------------------------------------------
// 晨光 daybreak —— 清早的冷白与深青，只有亮版
//
// 这是四套里唯一不做暗色的主题：它的主张是「现在就是亮的」，
// 跟着系统变暗反而把它要说的那句话取消掉了。夜里用会刺眼，这是已知代价。
// 底色刻意避开奶油色（D11 已否决那条路），用带一点青的冷白；
// 强调色是一点偏黄的日照，饱和度压得很低，只用来点一下，不铺面积。
// ---------------------------------------------------------------------------

const daybreakLight = buildPalette(
  {
    primary: '#245A5A', // 深青：7.2:1 on bg，白字压上去 7.8:1
    secondary: '#5E6B68', // 雾灰绿：次要小字，5.1:1
    background: '#F4F6F7', // 清晨的空气：冷调近白，不是奶油色
    surface: '#FFFFFF', // 纯白：底栏与输入框
    text: '#171C1B', // 墨：15.9:1
    accent: '#C08A3E', // 日出：只用于非文字元素，2.8:1 达不到正文标准
    success: '#3F6B45',
    warning: '#8A5A12',
    danger: '#9B2F28',
  },
  {
    borderAlpha: 0.12,
    ruleAlpha: 0.24,
    mutedAlpha: 0.68, // textMuted 落在背景上 5.7:1
    onPrimary: '#FFFFFF', // 压深青上 7.8:1
    highlightMix: 0.55, // → #E3CAA8
    deepMixTarget: '#171C1B',
    deepMix: 0.3, // → #204747
  },
);

// ---------------------------------------------------------------------------
// 四套主题
// ---------------------------------------------------------------------------

/** 炉边 */
export const furnaceTheme: Theme = {
  id: 'furnace',
  name: '炉边',
  tagline: '傍晚回到家，有人替你把炉火拨亮',
  light: furnaceLight,
  dark: furnaceDark,
  supportsDark: true,
  defaultScheme: 'light',
  radius: { card: 20, button: 14, input: 14, pill: 999 },
  spacing: {
    base: 4,
    pageX: 20,
    cardPadding: 16,
    cardGap: 12,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  typography: {
    size: { title: 28, heading: 22, body: 17, label: 15, caption: 13 },
    lineHeight: { title: 36, heading: 30, body: 26, label: 22, caption: 20 },
    weight: { regular: '400', medium: '500', semibold: '600' },
    // 阶段 2 接入霞鹜文楷（标题）+ 思源黑体（正文）后在这里填写
    fontFamily: {},
  },
  shadow: {
    card: {
      shadowColor: '#201D1B',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 24,
      elevation: 6,
    },
  },
  borderWidth: 0,
  touchTarget: 44,
  motion: { fast: 120, normal: 200, slow: 320 },
};

/** 夜航 */
export const nightvoyageTheme: Theme = {
  id: 'nightvoyage',
  name: '夜航',
  tagline: '深夜驾驶舱，仪表微亮，只有你和方向',
  light: nightvoyageLight,
  dark: nightvoyageDark,
  supportsDark: true,
  defaultScheme: 'dark',
  radius: { card: 12, button: 10, input: 10, pill: 999 },
  spacing: {
    base: 4,
    pageX: 16,
    cardPadding: 14,
    cardGap: 8,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  typography: {
    size: { title: 26, heading: 20, body: 16, label: 14, caption: 12 },
    lineHeight: { title: 32, heading: 26, body: 24, label: 20, caption: 18 },
    weight: { regular: '400', medium: '500', semibold: '600' },
    // 阶段 2 接入思源黑体 + JetBrains Mono（数字）后在这里填写
    fontFamily: {},
  },
  shadow: {
    card: {
      shadowColor: '#081226',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 10,
      elevation: 3,
    },
  },
  borderWidth: 0,
  touchTarget: 44,
  motion: { fast: 100, normal: 180, slow: 280 },
};

/** 苔原 */
export const tundraTheme: Theme = {
  id: 'tundra',
  name: '苔原',
  tagline: '白天的窗边书桌，纸、铅笔和一杯水',
  light: tundraLight,
  dark: tundraDark,
  supportsDark: true,
  defaultScheme: 'light',
  radius: { card: 8, button: 8, input: 8, pill: 999 },
  spacing: {
    base: 4,
    pageX: 24,
    cardPadding: 16,
    cardGap: 10,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  typography: {
    size: { title: 26, heading: 21, body: 17, label: 15, caption: 13 },
    lineHeight: { title: 36, heading: 30, body: 26, label: 22, caption: 20 },
    weight: { regular: '400', medium: '500', semibold: '600' },
    // 阶段 2 接入得意黑（标题）+ 思源宋体（正文）后在这里填写
    fontFamily: {},
  },
  shadow: {
    card: {
      // 苔原几乎不用阴影，靠 1px 描边分隔
      shadowColor: '#262B22',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
  },
  borderWidth: 1,
  touchTarget: 44,
  motion: { fast: 120, normal: 200, slow: 320 },
};

/** 晨光 */
export const daybreakTheme: Theme = {
  id: 'daybreak',
  name: '晨光',
  tagline: '清早，窗子刚打开，空气是干的',
  light: daybreakLight,
  // 没有暗色板：指向亮色板本身，代价为零。resolveScheme 保证取不到它
  dark: daybreakLight,
  supportsDark: false,
  defaultScheme: 'light',
  // 比另外三套更松、更圆：清早的界面不该是紧凑的
  radius: { card: 16, button: 12, input: 12, pill: 999 },
  spacing: {
    base: 4,
    pageX: 22,
    cardPadding: 16,
    cardGap: 12,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  typography: {
    size: { title: 27, heading: 21, body: 17, label: 15, caption: 13 },
    lineHeight: { title: 36, heading: 30, body: 26, label: 22, caption: 20 },
    // 层级只用 400 / 600；medium 只出现在交互状态里，不用它做层级
    weight: { regular: '400', medium: '500', semibold: '600' },
    // 阶段 2 接入思源黑体（标题与正文同一支）后在这里填写
    fontFamily: {},
  },
  shadow: {
    card: {
      // 不用阴影，靠 1px 描边分隔（与苔原同一路）
      shadowColor: '#171C1B',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
  },
  borderWidth: 1,
  touchTarget: 44,
  motion: { fast: 120, normal: 200, slow: 320 },
};

/** 主题表：key 与 settings.theme_id 对齐 */
export const themes: Record<ThemeId, Theme> = {
  furnace: furnaceTheme,
  nightvoyage: nightvoyageTheme,
  tundra: tundraTheme,
  daybreak: daybreakTheme,
};

/** 按 id 取主题，未知 id 回退到炉边（默认主题） */
export function getTheme(id: string | null | undefined): Theme {
  if (id && id in themes) return themes[id as ThemeId];
  return furnaceTheme;
}

/** 主题选择页用的有序列表 */
export const themeList: Theme[] = [furnaceTheme, nightvoyageTheme, tundraTheme, daybreakTheme];

/** 默认主题与默认模式，与 settings 表的默认值一致 */
export const DEFAULT_THEME_ID: ThemeId = 'furnace';
export const DEFAULT_THEME_MODE: ThemeMode = 'system';

/**
 * 把「主题 + 模式 + 系统配色」解析成最终生效的明暗方案。
 *
 * 顺序很重要，四条规则从上往下第一条命中的生效：
 * 1. 主题没有暗色版（晨光）→ 永远是亮色。
 *    放在最前面，是为了让 mode='dark' 与「系统是深色」都落到亮色上，
 *    而不是悄悄回退成别的主题的暗色板、或把亮色板当暗色板用。
 * 2. 手动指定 light / dark 时直接用。
 * 3. system 时跟随系统。
 * 4. 系统没给偏好（null）时用主题的 defaultScheme。
 */
export function resolveScheme(
  theme: Theme,
  mode: ThemeMode,
  systemScheme: 'light' | 'dark' | null | undefined,
): ResolvedScheme {
  if (!theme.supportsDark) return 'light';
  if (mode === 'light' || mode === 'dark') return mode;
  return systemScheme ?? theme.defaultScheme;
}

/**
 * 「这套主题此刻的深浅切换意味着什么」。
 *
 * 主题选择页要按这个显示：晨光不显示深浅切换，写一句「这套只有亮的」（docs/02 §1.5）。
 * 判断放在 token 层而不是页面里，是因为它描述的是主题本身的能力。
 */
export function describeSchemeSupport(theme: Theme): {
  /** 能不能在深浅之间切 */
  canToggle: boolean;
  /** 不能切时显示的那句话；能切时为 null */
  note: string | null;
} {
  if (theme.supportsDark) return { canToggle: true, note: null };
  return { canToggle: false, note: '这套只有亮的' };
}
