/**
 * 主题 token —— 全项目唯一允许出现十六进制色值的地方。
 *
 * 规则：
 * 1. 界面代码只读 token，不写死颜色。任何组件里出现 #B8502F 这样的字面值都是 bug。
 * 2. 三套主题结构完全一致，只替换色板、圆角、阴影、间距与字号。
 * 3. 派生值（textMuted / border / onPrimary）在这里一次算好，组件不要自己拼透明度。
 *
 * 色值来源：docs/02-产品规格.md §1.2–§1.4。
 */

/** 主题 id，与 settings.theme_id 的取值一一对应 */
export type ThemeId = 'furnace' | 'nightvoyage' | 'tundra';

/** 主题模式，与 settings.theme_mode 的取值一一对应 */
export type ThemeMode = 'system' | 'light' | 'dark';

/** 实际生效的明暗方案（system 解析之后只剩这两个值） */
export type ResolvedScheme = 'light' | 'dark';

/** 色板：一套主题在某个明暗方案下的全部颜色 */
export interface Palette {
  /** 主色：按钮、进度、强调 */
  primary: string;
  /** 辅色：次要图标、未点亮状态 */
  secondary: string;
  /** 页面背景 */
  background: string;
  /** 卡片、面板、底栏 */
  surface: string;
  /** 正文文字 */
  text: string;
  /** 强调色：高亮、奖励、火焰核心 */
  accent: string;
  /** 正向状态（已完成、已达成） */
  success: string;
  /** 提醒状态（可修复、待确认） */
  warning: string;
  /** 危险状态（删除、清空），只用于操作确认，不用于评价用户 */
  danger: string;

  // ---- 以下为派生值，不要手写 ----
  /** 次要文字：text 60% 透明度 */
  textMuted: string;
  /** 分隔线与描边：text 按各主题的透明度比例 */
  border: string;
  /** 主色之上的文字 */
  onPrimary: string;
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
    /** 页面主标题，如问候语 */
    title: number;
    /** 区块标题、伙伴名 */
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
  /** 中文名，用于「我的 → 主题」列表 */
  name: string;
  /** 一句话气质，用于主题选择页 */
  tagline: string;
  /** 亮色板 */
  light: Palette;
  /** 暗色板 */
  dark: Palette;
  /**
   * 跟随系统且系统未给出偏好时的默认方案。
   * 夜航的暗色是设计主场，炉边与苔原默认亮色。
   */
  defaultScheme: ResolvedScheme;
  radius: RadiusTokens;
  spacing: SpacingTokens;
  typography: TypographyTokens;
  shadow: ShadowTokens;
  /** 卡片描边宽度。苔原用描边代替阴影 */
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

/** 由原始色板算出派生值 */
function buildPalette(
  raw: RawPalette,
  options: { borderAlpha: number; onPrimary: string },
): Palette {
  return {
    ...raw,
    textMuted: withAlpha(raw.text, 0.6),
    border: withAlpha(raw.text, options.borderAlpha),
    onPrimary: options.onPrimary,
  };
}

// ---------------------------------------------------------------------------
// 炉边 furnace —— 陶土橙，傍晚的炉火，偏松软、允许大留白
// ---------------------------------------------------------------------------

const furnaceLight = buildPalette(
  {
    primary: '#B8502F',
    secondary: '#7A5A4A',
    background: '#FBF3EA',
    surface: '#FFF9F2',
    text: '#332823',
    accent: '#C98A2E',
    success: '#5F7F52',
    warning: '#B9762A',
    danger: '#A83E36',
  },
  { borderAlpha: 0.12, onPrimary: '#FFF9F2' },
);

const furnaceDark = buildPalette(
  {
    primary: '#E58A63',
    secondary: '#B99A87',
    background: '#1C1613',
    surface: '#28201B',
    text: '#F2E6D9',
    accent: '#E8B05E',
    success: '#8FA878',
    warning: '#DFA14F',
    danger: '#D46A5E',
  },
  { borderAlpha: 0.12, onPrimary: '#FFF9F2' },
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
  { borderAlpha: 0.14, onPrimary: '#FFFFFF' },
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
  { borderAlpha: 0.14, onPrimary: '#FFFFFF' },
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
  { borderAlpha: 0.1, onPrimary: '#FCFDF8' },
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
  { borderAlpha: 0.1, onPrimary: '#FCFDF8' },
);

// ---------------------------------------------------------------------------
// 三套主题
// ---------------------------------------------------------------------------

/** 炉边 */
export const furnaceTheme: Theme = {
  id: 'furnace',
  name: '炉边',
  tagline: '傍晚回到家，有人替你把炉火拨亮',
  light: furnaceLight,
  dark: furnaceDark,
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
      shadowColor: '#5A321E',
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

/** 主题表：key 与 settings.theme_id 对齐 */
export const themes: Record<ThemeId, Theme> = {
  furnace: furnaceTheme,
  nightvoyage: nightvoyageTheme,
  tundra: tundraTheme,
};

/** 按 id 取主题，未知 id 回退到炉边（默认主题） */
export function getTheme(id: string | null | undefined): Theme {
  if (id && id in themes) return themes[id as ThemeId];
  return furnaceTheme;
}

/** 主题选择页用的有序列表 */
export const themeList: Theme[] = [furnaceTheme, nightvoyageTheme, tundraTheme];

/** 默认主题与默认模式，与 settings 表的默认值一致 */
export const DEFAULT_THEME_ID: ThemeId = 'furnace';
export const DEFAULT_THEME_MODE: ThemeMode = 'system';

/**
 * 把「主题 + 模式 + 系统配色」解析成最终生效的明暗方案。
 * - 手动指定 light / dark 时直接用
 * - system 时跟随系统；系统没给偏好（null）则用主题的 defaultScheme
 */
export function resolveScheme(
  theme: Theme,
  mode: ThemeMode,
  systemScheme: 'light' | 'dark' | null | undefined,
): ResolvedScheme {
  if (mode === 'light' || mode === 'dark') return mode;
  return systemScheme ?? theme.defaultScheme;
}
