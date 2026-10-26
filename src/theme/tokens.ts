/**
 * 主题 token —— 全项目唯一允许出现十六进制色值的地方。
 *
 * 规则：
 * 1. 界面代码只读 token，不写死颜色。任何组件里出现 #2564CF 这样的字面值都是 bug。
 * 2. 派生值（textMuted / border / rule / onPrimary / highlight / primaryDeep）在这里一次算好，
 *    组件不要自己拼透明度。
 *
 * ---- 这一版只有一套主题 ----
 *
 * 早先这里有四套（炉边 / 夜航 / 苔原 / 晨光），外加一个「跟随系统的深浅切换」。
 * 现在全部删掉，只留一套白底、一个主色。理由不是它们不好看，而是**顺序错了**：
 * 换主题带来的收益是「好看」，而一个还没有备份、没有提醒、没有回忆页的 App，
 * 好看不是当下缺的东西。多套主题的代价却是实打实的——每加一个界面，都要在
 * 四套配色下看一遍；每加一个颜色 token，都要在四套里各定一次值。
 *
 * 所以这里只保留最基础的那一层：白底、深灰字、一个蓝色主色。
 * 剩下的主题等功能做完之后再加，那时 token 的形状（Theme / Palette）已经稳了，
 * 加一套只需要再写一个 buildPalette 调用。
 *
 * 删掉的还有 `ThemeId` / `ThemeMode` 这两个类型。它们原先在 db/schema.ts 里
 * 还各有一份（数据库侧的 settings.theme_id / theme_mode 列要用），
 * 现在只保留 schema.ts 里的那一份，重复声明的问题也一并消失了。
 */

/** 色板：当前主题的全部颜色 */
export interface Palette {
  /** 主色：主按钮、勾选、进度、选中态 */
  primary: string;
  /** 辅色：未点亮状态、次要图标与描边。必须能当小字颜色用 */
  secondary: string;
  /** 页面背景 */
  background: string;
  /** 面板、底栏、输入框。比 background 略深一档 */
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
  /**
   * 自然色（D59）。彩色元素（芽 / 花 / 太阳 / 地球 / 彩虹）用的那一组。
   *
   * ---- 为什么它是独立的一组 token，而不是复用 primary / accent ----
   *
   * 主色的语义在全项目里只有一个：**「可以点 / 已选中 / 正在发生」**（docs/02 §1.2）。
   * 一旦让草也穿主色，那条语义就废了——用户看到蓝色会先想「这是不是能点」。
   * 所以自然色是**另一组**，只给图形用，不参与任何交互语义。
   *
   * ---- 为什么每套主题各定一份 ----
   *
   * 理由同主题色：饱和的绿压在深底上会变脏，而提亮的绿压在白纸上会发飘。
   * 白底那套取「饱和但压深」，夜航那套取「提亮 + 提饱和」。
   */
  nature: NatureTokens;
  /**
   * 洗色（D59）：把自然色兑到几乎看不见，铺在卡片上当**底色**。
   *
   * 与 `nature` 分开的理由：`nature` 是**墨**（画线用的），这是**纸**
   * （垫在线底下的那一层）。同一个绿，画线要够深，垫底要够淡——
   * 一个值做不到两件事。
   *
   * 取值方式：自然色向 `surface` 混 92%。所以白底上是「很淡的草绿」，
   * 深底上是「很淡的墨绿」，两套都不刺眼。
   */
  natureTint: NatureTintTokens;

  // ---- 以下为派生值，不要手写 ----
  /** 次要文字：text 按一定透明度压在白底上，对比度仍 ≥ 4.5:1 */
  textMuted: string;
  /** 行分隔线、描边：很淡，只用来分组，不制造视觉噪音 */
  border: string;
  /** 区块分隔线：比 border 重一档，用在区块之间 */
  rule: string;
  /** 主色之上的文字 */
  onPrimary: string;
  /**
   * 高光：accent 向白色混合后的亮色。
   * 用途：火心、闪耀状态的亮点。
   */
  highlight: string;
  /**
   * 暗调主色：primary 往文字色方向混合，比主色更沉。
   *
   * 用途：火焰的侧舌——烧得最弱的那一股；亮色主题里它是「更重的那一笔」。
   *
   * 为什么不直接用透明度：透明色叠在白底上会变亮，
   * 结果「弱的那股火」看起来像高光，跑到前面来了，正好相反。
   */
  primaryDeep: string;
}

/**
 * 自然色（D59）。
 *
 * 六个颜色 + 一条彩虹的五段。全部**只用于图形**，不用于文字——
 * 它们没有一个能在自己的底色上过 4.5:1，当正文色就是看不清。
 *
 * 命名按「自然界里那个东西」而不是按色相：`leaf` 不是「绿」，
 * 它是「叶子该有的那个绿」。改色时改的是「叶子应该更黄一点」，
 * 而不是「把 hue 往 60 挪 10 度」。
 */
export interface NatureTokens {
  /** 叶子、草、芽 */
  leaf: string;
  /** 花、果 */
  petal: string;
  /** 太阳、光 */
  sun: string;
  /** 天、水 */
  sky: string;
  /** 地球、土 */
  earth: string;
  /** 彩虹的五段，从外到内 */
  rainbow: readonly [string, string, string, string, string];
}

/**
 * 洗色（D59）。六个自然色的「垫底版」。
 *
 * 全部由自然色向 surface 混合算出（`buildPalette` 里算），
 * 组件不要自己拼透明度——同一个色在四套主题下透明度不同，
 * 分散到各处必然有一处算错。
 */
export interface NatureTintTokens {
  leaf: string;
  petal: string;
  sun: string;
  sky: string;
  earth: string;
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

/** 间距：基数 4 */
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
     * 不参与字号层级的搭建。
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
  palette: Palette;
  radius: RadiusTokens;
  spacing: SpacingTokens;
  typography: TypographyTokens;
  shadow: ShadowTokens;
  /** 卡片描边宽度 */
  borderWidth: number;
  /** 最小触控尺寸，无障碍要求 44 */
  touchTarget: number;
  motion: MotionTokens;
}

/**
 * 系统字号缩放的封顶倍数（1.5）。
 *
 * docs/02 §9 的要求是「跟随系统字号，最大不超过 1.5 倍（超过会破坏布局，
 * 需在代码里限制）」。为什么是 1.5：正文 15 变 22.5，标题 24 变 36，
 * 卡片靠 minHeight 自己长高，1.5 倍以内每一页都还撑得住；再往上，
 * 固定高度的容器（底栏、胶囊、图标位）就开始裁字了。
 *
 * 用法有两档，别一律套上：
 *   1. **固定高度容器里的文字**加 `maxFontSizeMultiplier={MAX_FONT_SCALE}`
 *      （底栏标签、胶囊、图标旁的短标签）——那些地方变大会挤坏布局；
 *   2. **正文换行区**不加。那些地方宁可多占一行，也不要为了塞进去把字变小。
 */
export const MAX_FONT_SCALE = 1.5;

/**
 * 把系统字号倍数收进 [1, MAX_FONT_SCALE]。
 *
 * 给需要在渲染期算尺寸的组件用（底栏高度必须跟着标签行高长，
 * 否则 1.5 倍时标签会被裁掉半行）与 `scaleLineHeights` 用。
 * 系统给的值可能小于 1（部分 ROM 允许缩小），这里按 1 起算：
 * 缩小的字号不改变布局，不需要把容器也缩小。
 */
export function clampFontScale(fontScale: number): number {
  if (!Number.isFinite(fontScale) || fontScale <= 1) return 1;
  return Math.min(fontScale, MAX_FONT_SCALE);
}

/**
 * 把一套主题的行高按系统字号倍数放大（外观走查的核心修复）。
 *
 * ---- 为什么这一条会是一个真 bug ----
 *
 * React Native 的 `fontSize` **会**跟系统字号缩放，而 `lineHeight` **不会**。
 * 两者是分开的两个样式属性，RN 不会帮你把后者一起放。
 *
 * 于是系统字号放到 1.5 倍时：正文从 15 变成 22.5，而行高还是 21——
 * 字比它占的那一行还高。Android 的做法是把超出的部分**裁掉**，
 * 不是让它溢出去。表现是：中文的上下两端被切掉一截（上方的「宀」、下方的「心」），
 * 而且每一页都如此。这不是「可能截断」，是这个 App 在 1.5 倍字号下必然发生的事。
 *
 * 所以行高必须与字号**同比例**放大。乘数用 `clampFontScale` 收在 1.5，
 * 与 docs/02 §9 的「最大不超过 1.5 倍」一致——行高拉得比字大没问题，
 * 但比 1.5 倍更大的行高会让每一页都变得很长，而字号已经封顶了。
 *
 * 为什么不给每个 `<Text>` 都写 `maxFontSizeMultiplier`：
 * 那样能防住「字比行高还高」，但代价是三四十个组件各重复一遍，
 * 而且以后新写一个 `<Text>` 忘了带，坑就回来了。行高在这里统一算，
 * 组件照旧写 `theme.typography.lineHeight.body`，什么都不用改。
 */
export function scaleLineHeights(base: TypographyTokens['lineHeight'], fontScale: number) {
  const scale = clampFontScale(fontScale);
  if (scale === 1) return base;
  return {
    title: Math.ceil(base.title * scale),
    heading: Math.ceil(base.heading * scale),
    body: Math.ceil(base.body * scale),
    label: Math.ceil(base.label * scale),
    caption: Math.ceil(base.caption * scale),
  };
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
  nature: NatureTokens;
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
  /** 暗调主色往文字色混合的比例 */
  deepMix: number;
  /**
   * 洗色向 surface 混合的比例（D59）。
   *
   * 白底用 0.92（很淡的一层，卡片仍读成白纸）；
   * 深底用 0.86（深底上同样的浓度看不出差别，要更重一档才成立）。
   */
  tintMix: number;
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
    // 往文字色方向混合，得到更沉的那一笔
    primaryDeep: mixHex(raw.primary, raw.text, options.deepMix),
    // 洗色：自然色向 surface 混 92%。92 是手调的——
    // 85 还能看出是一块颜色（抢卡片），96 就看不出来了（等于没做）
    natureTint: {
      leaf: mixHex(raw.nature.leaf, raw.surface, options.tintMix),
      petal: mixHex(raw.nature.petal, raw.surface, options.tintMix),
      sun: mixHex(raw.nature.sun, raw.surface, options.tintMix),
      sky: mixHex(raw.nature.sky, raw.surface, options.tintMix),
      earth: mixHex(raw.nature.earth, raw.surface, options.tintMix),
    },
  };
}

// ---------------------------------------------------------------------------
// 两套色板（D59：从四套砍到两套）
//
// 阶段 1 只留了「白」一套（D27），阶段 4 补回四套（D40），
// **D59 又砍回两套**：白与夜航。理由不是「四套太多」，而是四套里的
// 苔原与晨光**各自的主张已经被别的两套覆盖了**——
//
//   - 苔原（灰绿低饱和）的主张是「降低存在感」，而「白」本来就是最低存在感的那一套，
//     苔原只是把它的色相挪了一点，用户看不出「我今天想要苔原而不是白」；
//   - 晨光（暖白）的主张是「清早」，而那是**时间**的主张，不是**主题**的主张——
//     想要清早的感觉，D56 的天光横带已经在做这件事了。
//
// 两套的分工是清楚的、互斥的：**日间 / 夜间**。
//
// ---- 两套各自在说什么 ----
//
//   白（furnace 沿用旧 id）  干净、日间、Microsoft To Do 的语汇。默认。
//   夜航（nightvoyage）      深底、冷色、晚上用。
//
// ---- 为什么 id 仍是旧的那四个 ----
//
// settings.theme_id 的 CHECK 在 v1 与 v2 两次建表时就定下了这四个取值，
// 而「已发布的建表常量永不修改」是 D31 立的规矩。
// 所以做主题时**不需要新迁移**：四个值都已经在 CHECK 里。
// 代价是「白」的 id 叫 `furnace`（炉边），与它现在的长相不符——
// 这一处不一致留着，比为了改名去重建 settings 表安全。
//
// ---- 对比度 ----
//
// 每一套的正文色压在它自己的 surface 上都不低于 4.5:1，
// 次要文字（textMuted，text 68%）不低于 4.5:1。
// 深色两套的 onPrimary 用白、浅色两套的也用白（主色都是深蓝 / 深绿）。
// ---------------------------------------------------------------------------

/** 「白」—— Fluent 的中性底 + 一个蓝（默认主题） */
const whitePalette = buildPalette(
  {
    primary: '#2564CF', // To Do 的蓝：只表示「可以点 / 已选中 / 正在进行」
    secondary: '#605E5C', // Fluent neutralSecondary：次要文字、未选中的描边
    background: '#FAF9F8', // Fluent neutralLighter：极淡的暖灰，不是纯白
    surface: '#FFFFFF', // 卡片、输入框、底栏：白纸压在灰底上
    text: '#323130', // Fluent neutralPrimary：正文，不是纯黑
    accent: '#0078D4', // Fluent 主题蓝：只用于非文字元素（火心、光晕）
    success: '#107C10',
    warning: '#8A5300',
    danger: '#A4262C',
    // 清晨的三种天光：沙白 → 杏 → 藕蓝。三段都压在中高明度上，
    // 墨色才敢用深蓝紫（#2B3350，压在 via 上 6.1:1）
    // 白底上的自然色：**压深**。白纸上放纯饱和色会「飘」——
    // 绿要带一点蓝、红要带一点土，才压得住纸的亮。
    nature: {
      leaf: '#3F7A3A',
      petal: '#C2543F',
      sun: '#C0830A',
      sky: '#3A6FA8',
      earth: '#4A7C6F',
      rainbow: ['#C2543F', '#C0830A', '#3F7A3A', '#3A6FA8', '#7A5AA8'],
    },
  },
  {
    borderAlpha: 0.12,
    ruleAlpha: 0.2,
    // 0.68 是实测出来的下限：0.62 只有 3.99:1，不到 4.5。
    // 次要文字用得很多（连胜、日期、说明），不能为了「更淡」牺牲可读性
    mutedAlpha: 0.68,
    onPrimary: '#FFFFFF',
    highlightMix: 0.5, // → #80BCEA
    deepMix: 0.28, // → #1B4A94
    tintMix: 0.92,
  },
);

/**
 * 「夜航」—— 深底、冷色。晚上用。
 *
 * 深色主题不是把浅色反一下就完了，有三件事必须重新定：
 *   1. **surface 比 background 亮**（浅色里是反过来）。深色下卡片要"浮"起来，
 *      就得比底更亮一档，而不是更暗。
 *   2. **纯白正文会刺眼**。用 #E6E6E6 而不是 #FFFFFF：对比度仍然 11:1，
 *      但在黑底上不刺眼。
 *   3. **主色要提亮**。浅色那套的 #2564CF 压在深底上对比度只有 2.6:1，
 *      读不清。深色主题的主色必须往亮的方向走。
 */
const nightPalette = buildPalette(
  {
    primary: '#4C8DFF', // 提亮过的蓝：在深底上对比度 6.2:1
    secondary: '#9A9A9A', // 次要文字、未选中描边
    background: '#12141A', // 底：带一点蓝的深灰，不是纯黑（纯黑上阴影不存在）
    surface: '#1C1F27', // 卡片：比底亮一档，纸片才浮得起来
    text: '#E6E6E6', // 正文：不是纯白，减少刺眼
    accent: '#5AA9FF', // 火心、光晕
    success: '#4CC26A',
    warning: '#D9A441',
    danger: '#F06A6A',
    // 深底上的自然色：**提亮 + 提饱和**。白底那套的 #3F7A3A 压在 #12141A 上
    // 只有 2.4:1，读起来像一块脏绿；提到 #6FBF6A 之后才是「夜里的草」。
    //
    // petal 取偏珊瑚的 #FF8A70 而不是更红的 #F06A6A：红在深底上会读成「危险」，
    // 而这个颜色在「我的」页是身份卡的底色，那里不该有警告的意味。
    nature: {
      leaf: '#6FBF6A',
      petal: '#FF8A70',
      sun: '#F2C14E',
      sky: '#79B4E8',
      earth: '#6FBFB0',
      rainbow: ['#FF8A70', '#F2C14E', '#6FBF6A', '#79B4E8', '#B49AEA'],
    },
  },
  {
    borderAlpha: 0.18,
    ruleAlpha: 0.28,
    // 深底上「淡」的观感与浅底不同：同样的 0.68 在黑底上偏灰，
    // 提到 0.72 才接近浅色那套的可读感
    mutedAlpha: 0.72,
    onPrimary: '#0B0D12', // 亮蓝底上用深字，比白字清楚
    highlightMix: 0.35,
    deepMix: 0.35,
    // 深底上洗色与浅底用**同一个浓度**（0.92）。
    // 试过 0.86（更浓一档），但那样洗色与卡片的对比度到了 1.28:1，
    // 卡片会读成「一块颜色」而不是「一张纸」——与白底那边破了同一条规矩。
    // 深底的差异靠「自然色本身被提亮过」拉开，不靠浓度。
    tintMix: 0.92,
  },
);

/**
 * 四套色板。键就是 settings.theme_id 的取值。
 *
 * 这个对象是「主题 id → 色板」的唯一映射。加一套新主题只需要：
 *   1. 在 schema.ts 的 ThemeId 加取值 + 一条扩 CHECK 的迁移；
 *   2. 在这里加一个 buildPalette 调用；
 *   3. 在下面的 THEME_LABEL 加一个中文名。
 */
export const PALETTES = {
  furnace: whitePalette,
  nightvoyage: nightPalette,
} as const;

/**
 * 主题 id 的类型。
 *
 * 从 schema.ts 转出而不是重新声明一份（那个文件里的 ThemeId 是数据库 CHECK 的镜像）。
 * 两个地方各写一份的代价是：将来加一套主题时只改了一处，
 * 而 TS 不会报错（因为两份都是字面量联合）——直到运行时撞上 CHECK 约束。
 *
 * 类型上转出，但 `PALETTES` 的键仍然由本文件自己声明：
 * 如果 schema 里加了一个 id 而这里忘了加色板，下面那个 `satisfies` 会报错。
 */
export type { ThemeId } from '../db/schema';
import type { ThemeId as SchemaThemeId } from '../db/schema';

/**
 * schema 里声明的**每一个** id 都必须能取到一套色板。
 *
 * ---- D59 之后这里为什么是「别名」而不是「四套色板」----
 *
 * schema 的 `ThemeId` 仍是四个值（v1 建表 + v2 迁移写死的 CHECK，按 D31 不许改）。
 * 而界面只剩两套（白 / 夜航）。所以苔原与晨光**映射到白**：
 *
 *   tundra   → 白   （它的主张「降低存在感」已经被白覆盖）
 *   daybreak → 白   （它的主张「清早」是时间的主张，D56 的天光横带在做）
 *
 * 这一行仍然是那道防线：schema 里加了 'dusk' 而这里忘了处理时，
 * TS 会在编译期报错，而不是等到用户库里存了那个值才白屏。
 */
const PALETTE_ALIASES: Record<SchemaThemeId, keyof typeof PALETTES> = {
  furnace: 'furnace',
  nightvoyage: 'nightvoyage',
  tundra: 'furnace',
  daybreak: 'furnace',
};

/** 取一套色板。不认识的 id 落到默认（白），而不是白屏 */
function paletteOf(id: SchemaThemeId): Palette {
  return PALETTES[PALETTE_ALIASES[id] ?? 'furnace'];
}

/** 主题 id 类型。上面已经转出，这里只给本文件内部用 */
type ThemeId = SchemaThemeId;

/** 主题的中文名与一句说明。主题选择页直接用它 */
export const THEME_LABEL: Record<ThemeId, { name: string; note: string }> = {
  furnace: { name: '白', note: '干净、日间。默认。' },
  nightvoyage: { name: '夜航', note: '深底冷色，晚上看。' },
  // tundra / daybreak 两套已删（D59）。**但 ThemeId 这个类型里仍然有它们**——
  // 那是数据库 CHECK 的镜像（v1 建表 + v2 迁移写死的四个值），按 D31 不许改。
  // 所以这里必须给出**回退**：库里存着这两个值时显示成「白」，
  // 而不是让 THEME_LABEL[id] 变成 undefined 然后白屏。
  tundra: { name: '白', note: '这一套已经合并进「白」了。' },
  daybreak: { name: '白', note: '这一套已经合并进「白」了。' },
};

/** 默认主题 */
export const DEFAULT_THEME_ID: ThemeId = 'furnace';

/**
 * 把一个 id 规范成**能取到色板**的那几个之一。
 *
 * 库里可能存着不认识的 id（手改过、或来自别的版本），
 * 那时退回默认——而不是让界面白屏。
 *
 * D59 起：`tundra` / `daybreak` 会被规范成 `furnace`（两套已删，见 PALETTE_ALIASES）。
 * 也就是说用户下次打开 App 时，那两套会**静默变成白**——
 * 这是删主题的代价，写进了 D59。
 */
export function normalizeThemeId(value: unknown): ThemeId {
  if (typeof value === 'string' && value in PALETTES) return value as ThemeId;
  return DEFAULT_THEME_ID;
}

/**
 * 主题的形状（圆角 / 间距 / 字号 / 动效）。
 *
 * 两套主题**共用**这一份：它们只差色板。
 * 这是有意的：如果每套主题都能改圆角与间距，
 * 那「每加一页要在四套下各看一遍」就会变成「每加一页要在四套下重调一遍布局」。
 */
const themeShape: Omit<Theme, 'palette'> = {
  // Fluent 的圆角是 4：卡片、按钮、输入框同一档。刻意不用大圆角——
  // 大圆角是「气泡」，而 To Do 的卡片是「纸片」。
  radius: { card: 4, button: 4, input: 4, pill: 999 },
  spacing: {
    base: 4,
    // To Do 的页面左右留白是 16，卡片之间 8
    pageX: 16,
    cardPadding: 12,
    cardGap: 8,
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
  },
  typography: {
    // To Do 的字号：标题 20，任务 15，元信息 12
    size: { title: 24, heading: 20, body: 15, label: 14, caption: 12 },
    lineHeight: { title: 32, heading: 26, body: 21, label: 20, caption: 16 },
    weight: { regular: '400', medium: '500', semibold: '600' },
    // 阶段 2 接入字体后在这里填写。To Do 用 Segoe UI，Android 上落到系统无衬线
    fontFamily: {},
  },
  shadow: {
    card: {
      // Fluent depth-4：极轻。RN 只支持单层阴影，取它更接近的那一半
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 1,
    },
  },
  // Fluent 的卡片本身不描边，靠白底压灰底分开。
  // 深色两套也一样：靠 surface 比 background 亮一档分开。
  borderWidth: 0,
  touchTarget: 44,
  // To Do 的动效很快，勾选是 150ms 左右的收缩
  motion: { fast: 120, normal: 180, slow: 280 },
};

/**
 * 按主题 id 取一套完整的 Theme。
 *
 * ThemeProvider 在每次渲染时调它（字号变化时行高会被重算，见那里的注释），
 * 所以它必须是纯的、无副作用的。
 */
export function buildTheme(id: ThemeId): Theme {
  return { ...themeShape, palette: paletteOf(normalizeThemeId(id)) };
}

/**
 * 默认主题（白）。
 *
 * 保留这个常量是为了兼容还没改成读 ThemeProvider 的地方；
 * 新代码一律用 `useTheme()`——那里拿到的才是用户选中的那一套。
 */
export const theme: Theme = buildTheme(DEFAULT_THEME_ID);

