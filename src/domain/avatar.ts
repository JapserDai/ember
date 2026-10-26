/**
 * 头像：七个像素动物，用户左右挑一个
 *
 * ---- 为什么从「按 ID 生成的人像」换成「七个固定的像素动物」----
 *
 * 上一版是按玩家 ID 画出来的半身墨色版画人像：脸型、发型、眉眼、眼镜、胡子、
 * 衣领各自抽取，一张脸有几十万种组合。它的好处是「你的头像是你自己的」，
 * 代价是三件事：
 *   1. 它是一张**画**，不是一**个**形象。用户没法说「我想要猫」，只能一直点
 *      「换一个」直到碰上一张顺眼的——而「顺眼」没法验证，只能靠运气。
 *   2. 生成的东西没有「挑」这件事。这一版要的是「可供用户左右选择」，
 *      那就必须是**有名有姓的少数几个**，而不是无穷多的随机组合。
 *   3. 人像的几何很重：几十条贝塞尔、脸型与发型的相互作用、脖子与下颌的过渡，
 *      每改一笔都要重新验形。像素图一笔就是一个方块，改一格就看到一格。
 *
 * 现在这一版：**七个手绘的 16×16 像素动物**——狐狸 / 猫 / 兔子 / 熊猫 / 青蛙 /
 * 企鹅 / 猫头鹰。用户左右切换挑一个，选中的 id 存进 `player.avatar_id`，
 * 长相本身是代码里的常量，不占数据库、不占安装包。
 *
 * ---- 为什么是像素，不是别的画法 ----
 *
 * 1. **像素图在这个尺寸下才站得住。** 头像最大显示 64px，16×16 的网格每格 4px。
 *    这个比例下每一格都是清清楚楚的一个方块，缩到 32px 也还是方块；而线条画
 *    在 32px 下会糊成一团灰。挑选面板里会同时摆出七个小图，它们必须能在一排里
 *    被分辨出来——像素图靠轮廓就分得开，不靠颜色。
 * 2. **它是「图形」，不是「照片」，也不是「某个人」。** 这个 App 里没有一张写实的
 *    东西：底栏是手绘线、火带是一条烧过去的色带。一个像素动物和它们是同一套语言。
 *    上一版的墨色人像虽然也是画出来的，却总带着「这是某个人」的暗示，
 *    与「不评判、不拟人」的底线有张力。
 * 3. **可验证。** 网格是字符串，`scripts/preview-avatar.ts` 把它直接打成点阵。
 *    改一格就看到一格，不需要在模拟器里眯着眼判断「这是设计如此还是算错了」。
 *
 * ---- 为什么只有 7 个，以及为什么是这 7 个 ----
 *
 * 7 个是「一屏能扫完」的上限：面板里一行 7 个小图 + 中间一个大图，
 * 不需要滚动就能左右挑完。再多就得滑，而「滑」会把选择变成浏览——
 * 用户会开始比较，而比较是评判的开始。
 *
 * 选的这 7 个都是**剪影差异最大**的：狐狸（尖耳长脸）、猫（尖耳小脸 + 胡须）、
 * 兔子（长耳）、熊猫（圆耳 + 黑眼圈）、青蛙（眼睛长在头顶）、企鹅（白肚皮黑背）、
 * 猫头鹰（大眼 + 三角喙）。它们排在一起时靠轮廓就能分开，不靠颜色——
 * 色盲用户、以及在小尺寸下看不清颜色的人，拿到的信息是一样的。
 *
 * ---- 颜色：只用角色，不用色值 ----
 *
 * 每个像素只声明**它是什么**（墨 / 毛 / 浅 / 点 / 喙），不声明它是什么颜色。
 * 颜色由 `roleColor()` 从主题 token 里取，组件只负责把方块画出来。这样：
 *   - 换主题时头像自动跟着走，不需要改 7 张图；
 *   - 这一层是纯数据，能在没有 React 的环境里被打成 ASCII 验证；
 *   - 「狐狸是橙色」这种写实期待被刻意放弃：这个 App 里没有写实的颜色，
 *     七只动物统一用「墨 + 两档灰 + 一个强调色」，像一本印章画册。
 *
 * 本文件是纯函数与纯常量：不 import React、不碰数据库、不含任何十六进制色值。
 */
import type { Palette } from '../theme/tokens';

/** 头像画布边长（网格格数）。像素图必须是正方形，且是 2 的幂——缩放时不会出现半格 */
export const AVATAR_GRID = 16;

/**
 * 一个像素的「角色」。它说的是「这里是什么材质」，不是「这里是什么颜色」。
 *
 * 只有 5 种，刻意不给更多：
 *   - 5 种已经够画出 7 只完全不同的动物；
 *   - 角色越多，每加一只动物就要在更多角色之间做选择，7 张图会越来越难统一；
 *   - 每个角色都要在主题里找一个对应色，多一个角色就多一处「这个色配得对吗」。
 */
export type PixelRole =
  /** 墨：轮廓、眼睛、鼻头。图里最深的一档 */
  | 'ink'
  /** 毛：身体的主色。中灰 */
  | 'fur'
  /** 浅：脸、肚皮、耳朵内侧。比毛浅一档 */
  | 'light'
  /** 点：眼睛的高光。最亮的一档，也是唯一的纯白 */
  | 'dot'
  /** 喙 / 嘴：图里唯一一处强调色 */
  | 'accent';

/**
 * 透明。网格里用它表示「这一格不画」。
 *
 * 用 '.' 而不是空格：空格在源码里看不见，一格空格和一格 '.' 的差别在 diff 里
 * 完全无法审阅，而这张图是要被人一格一格改的。
 */
export const TRANSPARENT = '.';

/** 一只动物的网格：16 行 × 16 列，每格是一个 PixelRole 字符或 '.' */
export type PixelGrid = readonly string[];

/** 一个可选的头像 */
export interface AvatarOption {
  /** 存进数据库的 id。**永不修改**——用户库里存的就是它 */
  id: AvatarId;
  /** 中文名。面板里的标签、读屏念的那句话 */
  label: string;
  /** 一句话描述长相。读屏用，也是「这个是什么动物」的兜底说明 */
  description: string;
  /** 16×16 网格 */
  grid: PixelGrid;
}

/**
 * 七个头像的 id。
 *
 * 是联合类型而不是 string：写错一个字母在编译期就报错，
 * 而不是在运行时静默画出一张空白图（那时用户看到的是「头像丢了」）。
 */
export type AvatarId =
  | 'fox'
  | 'cat'
  | 'rabbit'
  | 'panda'
  | 'frog'
  | 'penguin'
  | 'owl';

/**
 * 七个头像的固定顺序。
 *
 * 顺序有讲究：**从「最野的」走到「最圆的」**——
 * 狐狸 / 猫 / 兔子 / 熊猫 / 青蛙 / 企鹅 / 猫头鹰。排在最前面的是耳朵最尖、
 * 剪影最锐利的，越往后越接近「一个坐着的圆东西」。左右滑动时视觉上是
 * 一条连续的线，而不是七个互不相干的图随机排。
 *
 * 前两个（狐狸、猫）刻意放最常被挑的：默认值是第一个，而默认值
 * 是最多人不会去改的那一个。
 */
export const AVATAR_IDS: readonly AvatarId[] = [
  'fox',
  'cat',
  'rabbit',
  'panda',
  'frog',
  'penguin',
  'owl',
];

/**
 * 默认头像。新玩家的 `avatar_id` 就是它。
 *
 * 选狐狸：它是这套图里剪影最锐利的一个（两只尖耳 + 收窄的下巴），
 * 在 32px 下也一眼认得出是「动物」而不是「一个圆」。
 */
export const DEFAULT_AVATAR_ID: AvatarId = 'fox';

/**
 * 七个网格。
 *
 * 画法约定（改图之前先读一遍）：
 *   1. **左右对称**：第 n 格与第 15-n 格相同。手画的时候只写左半边、镜像出去，
 *      这样改一处不会只改了半张脸（`scripts/preview-avatar.ts` 会检查对称性）。
 *   2. **四周留一格**：第 0 行、第 15 行、第 0 列、第 15 列尽量留空，
 *      耳朵可以顶到第 0 行——那是唯一的例外。
 *   3. **一格就是一格**：不要用 '.' 在身体里挖小洞做「毛的质感」——
 *      在 32px 下那些洞会变成一片噪点，读起来像图没画完。
 *   4. **眼睛必须是 ink**：眼睛是这张图的锚点。任何一只动物看不清眼睛，
 *      在 32px 下就只剩一团灰。
 *   5. **每只动物只留一处 accent**：嘴、喙、鼻头选一个。两处会让视线来回跳。
 *   6. **先轮廓后细节**：外圈用 ink 收口，里面才轮到 fur / light。
 *      没有外圈的话，浅色的脸会和白色卡片糊在一起。
 */
const GRIDS: Record<AvatarId, PixelGrid> = {
  // 狐狸：两只尖耳 + 收窄的下巴。下巴是一个三角，这是它和猫最大的区别
  fox: [
    '................',
    '..k..........k..',
    '..kk........kk..',
    '..kbk......kbk..',
    '..kbbk....kbbk..',
    '.kbbbbbbbbbbbbk.',
    '.kbbbbbbbbbbbbk.',
    '.kbbkkbbbbkkbbk.',
    '.kbbkkbbbbkkbbk.',
    '.kbbbbbbbbbbbbk.',
    '.kbbllllllllbbk.',
    '.kbllllaallllbk.',
    '..kbllllllllbk..',
    '...kbbbbbbbbk...',
    '....kkkkkkkk....',
    '................',
  ],

  // 猫：耳朵比狐狸短而宽，脸是圆的，眼睛外侧有两点胡须
  cat: [
    '................',
    '..k..........k..',
    '..kk........kk..',
    '..kbk......kbk..',
    '.kbbbbbbbbbbbbk.',
    '.kbbkkbbbbkkbbk.',
    '.kbbkkbbbbkkbbk.',
    '.kbbbbbbbbbbbbk.',
    '.kbllwllllwllbk.',
    '.kbllllaallllbk.',
    '.kbbbbbbbbbbbbk.',
    '..kbbbbbbbbbbk..',
    '...kkkk..kkkk...',
    '................',
    '................',
    '................',
  ],

  // 兔子：五行高的长耳朵，耳内是 light。脸最圆，没有收窄的下巴
  rabbit: [
    '...k........k...',
    '...kl......lk...',
    '...kl......lk...',
    '...kl......lk...',
    '...kl......lk...',
    '...kk......kk...',
    '.kbbbbbbbbbbbbk.',
    '.kbbkkbbbbkkbbk.',
    '.kbbkkbbbbkkbbk.',
    '.kbbbbbbbbbbbbk.',
    '.kbllllllllllbk.',
    '.kbllllaallllbk.',
    '.kbbbbbbbbbbbbk.',
    '..kbbbb..bbbbk..',
    '...kkkk..kkkk...',
    '................',
  ],

  // 熊猫：圆耳朵 + 黑眼圈。全身只有 light 与 ink 两档，没有 fur——
  // 这是它在一排里读起来最干净的原因
  panda: [
    '................',
    '..kk........kk..',
    '..kk........kk..',
    '.kbbbbbbbbbbbbk.',
    '.kllllllllllllk.',
    '.kllkkllllkkllk.',
    '.kllkwllllwkllk.',
    '.kllkkllllkkllk.',
    '.kllllllllllllk.',
    '.kllllllllllllk.',
    '.kllllaaaallllk.',
    '.kllllllllllllk.',
    '..kllll..llllk..',
    '...kkkk..kkkk...',
    '................',
    '................',
  ],

  // 青蛙：眼睛长在头顶的两个凸起上，嘴是一条横贯的线
  frog: [
    '..kk........kk..',
    '..kwk......kwk..',
    '..kwk......kwk..',
    '.kkkkkkkkkkkkkk.',
    '.kbbbbbbbbbbbbk.',
    '.kbbbbbbbbbbbbk.',
    '.kbbkkbbbbkkbbk.',
    '.kbbkkbbbbkkbbk.',
    '.kbbbbbbbbbbbbk.',
    '.kbkkaaaaaakkbk.',
    '.kbbbbbbbbbbbbk.',
    '..kbbbbbbbbbbk..',
    '...kkkk..kkkk...',
    '................',
    '................',
    '................',
  ],

  // 企鹅：头顶与两侧是 fur（黑背），中间是 light（白肚皮），嘴是 accent
  penguin: [
    '................',
    '...kkk....kkk...',
    '.kkbbbbkkbbbbkk.',
    '.kbllllllllllbk.',
    '.kbllllllllllbk.',
    '.kblkklkklkklbk.',
    '.kblkklkklkklbk.',
    '.kbllllllllllbk.',
    '.kbllllllllllbk.',
    '.kbllllaallllbk.',
    '.kbllllllllllbk.',
    '.kbbbbbbbbbbbbk.',
    '..kbbbbbbbbbbk..',
    '...kkkk..kkkk...',
    '................',
    '................',
  ],

  // 猫头鹰：两只大圆眼（外圈 light、瞳孔 ink）+ 一个三角喙
  owl: [
    '..k..........k..',
    '..kk........kk..',
    '.kbbbbbbbbbbbbk.',
    '.kbbbbbbbbbbbbk.',
    '.kbllllllllllbk.',
    '.kbllkkllkkllbk.',
    '.kbllkkllkkllbk.',
    '.kbllllllllllbk.',
    '.kbbbbbbbbbbbbk.',
    '.kbbbbbaabbbbbk.',
    '.kbbbbbbbbbbbbk.',
    '..kbbbbbbbbbbk..',
    '...kkkk..kkkk...',
    '................',
    '................',
    '................',
  ],
};

/** 中文名与描述。与 GRIDS 分开写：它们是文案，会随语气调整；网格不会 */
const META: Record<AvatarId, { label: string; description: string }> = {
  fox: { label: '狐狸', description: '尖耳朵，收窄的下巴' },
  cat: { label: '猫', description: '圆脸，短耳朵，嘴边两点胡须' },
  rabbit: { label: '兔子', description: '两只高高的长耳朵' },
  panda: { label: '熊猫', description: '圆耳朵，黑眼圈，圆身子' },
  frog: { label: '青蛙', description: '眼睛长在头顶上' },
  penguin: { label: '企鹅', description: '白肚皮，黑背，一张小尖嘴' },
  owl: { label: '猫头鹰', description: '圆圆的大眼睛，一张小尖嘴' },
};

/** 七个可选头像，顺序与 AVATAR_IDS 一致 */
export const AVATAR_OPTIONS: readonly AvatarOption[] = AVATAR_IDS.map((id) => ({
  id,
  label: META[id].label,
  description: META[id].description,
  grid: GRIDS[id],
}));

/** 按 id 取一个头像。id 不认识时退回默认的狐狸，绝不返回 undefined */
export function getAvatarOption(id: string): AvatarOption {
  return AVATAR_OPTIONS.find((option) => option.id === id) ?? AVATAR_OPTIONS[0];
}

/**
 * 判断一个值是不是合法的头像 id。
 *
 * 读库时要它：`avatar_id` 是 TEXT，可能被人手改过，也可能来自一个更早/更晚的
 * 版本。那种情况要退回默认值，而不是让界面白屏。
 */
export function isAvatarId(value: unknown): value is AvatarId {
  return typeof value === 'string' && (AVATAR_IDS as readonly string[]).includes(value);
}

/**
 * 规范化一个从库里读出来的头像 id。不认识就退回默认。
 *
 * 为什么不抛错：头像不是关键路径。一个坏的 avatar_id 不该让「我的」页打不开。
 */
export function normalizeAvatarId(value: unknown): AvatarId {
  return isAvatarId(value) ? value : DEFAULT_AVATAR_ID;
}

/**
 * 左右切换。在七个头像之间循环，到头回绕。
 *
 * @param current 当前 id（可能来自一个不认识的库值，先规范化）
 * @param step 1 = 下一个，-1 = 上一个
 *
 * 为什么循环而不是在两端停住：面板是一排可以左右走的头像，两端停住意味着
 * 走到最后一个之后要反向走回去；循环的代价只是「狐狸的前一个是猫头鹰」，
 * 而这句话在界面上没有任何地方需要解释。
 */
export function stepAvatar(current: string, step: 1 | -1): AvatarId {
  const index = AVATAR_IDS.indexOf(normalizeAvatarId(current));
  const next = (index + step + AVATAR_IDS.length) % AVATAR_IDS.length;
  return AVATAR_IDS[next];
}

/** 某个 id 在顺序里的位置（0 起）。用于面板上的「第几个 / 共几个」与滑动定位 */
export function avatarIndex(id: string): number {
  return AVATAR_IDS.indexOf(normalizeAvatarId(id));
}

/** 网格字符 → 角色。没有列在这里的字符（含 '.'）一律当作透明 */
const ROLE_CHARS: Record<string, PixelRole> = {
  k: 'ink',
  b: 'fur',
  l: 'light',
  w: 'dot',
  a: 'accent',
};

/**
 * 一段横向连续的同色像素。
 *
 * 为什么不逐格画：16×16 最多 256 个方块，每格一个 `<Rect>` 就是 256 个 SVG 节点。
 * 「我的」页 + 面板里 7 个小图 + 中间一个大图，一屏就是两千多个节点。
 * 同一行里连续的同色格合并成一个宽矩形，节点数掉到每只动物 60 个左右，
 * 而画面完全一样（相邻同色块本来就看不见接缝）。
 */
export interface PixelRun {
  x: number;
  y: number;
  /** 占几格宽 */
  width: number;
  role: PixelRole;
}

/**
 * 把网格解析成「横向合并过的色块」。
 *
 * 行优先，同一行里角色相同的相邻格合并成一段。透明格会打断合并
 * （否则一个宽矩形会盖住中间本该空着的地方）。
 *
 * 行长度不一致时按**每行自己的长度**走，不假设都是 16：
 * 这样写错一行的网格只会少画几格，而不是抛出越界错误把整页干掉。
 * 长度对不对由 scripts/preview-avatar.ts 检查，那是开发期的事。
 */
export function parseAvatarRuns(grid: PixelGrid): PixelRun[] {
  const runs: PixelRun[] = [];
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y];
    let x = 0;
    while (x < row.length) {
      const role = ROLE_CHARS[row[x]];
      if (!role) {
        x++;
        continue;
      }
      let width = 1;
      while (x + width < row.length && ROLE_CHARS[row[x + width]] === role) width++;
      runs.push({ x, y, width, role });
      x += width;
    }
  }
  return runs;
}

/** 网格里所有出现过的角色。用于测试与「这只动物用了几种材质」这类检查 */
export function avatarRoles(grid: PixelGrid): PixelRole[] {
  const seen = new Set<PixelRole>();
  for (const row of grid) {
    for (const char of row) {
      const role = ROLE_CHARS[char];
      if (role) seen.add(role);
    }
  }
  return [...seen];
}

/**
 * 把角色翻译成颜色。**唯一一处**知道「毛是什么色、墨是什么色」的地方。
 *
 * 为什么由 domain 算而不是组件里写 switch：组件里写 switch 的话，
 * 每多一个用到像素头像的地方（「我的」页、挑选面板的小图、以后的叙事卡片）
 * 都要再抄一遍这五条映射，抄到第三处就一定会有一处不同。
 *
 * 取色规则（全部来自主题，不写死任何色值）：
 *   ink    → text            图里最深：轮廓、眼睛
 *   fur    → secondary       身体主色：比正文浅一档、比浅色深一档
 *   light  → text 18% 压白    脸与肚皮。用淡影而不是另一个色值，
 *                             这样它在任何主题下都自动成立
 *   dot    → surface          纯白（卡片色）。眼睛高光，全图唯一一处亮
 *   accent → accent           嘴与喙。全图唯一一处彩色
 *
 * 为什么 fur 用 secondary 而不是 primary：主色在 App 里表示「可以点 / 已选中 /
 * 正在进行」，头像不是可点态。用主色会让七只动物一起变成蓝色，
 * 那正是「靠颜色分辨」的反面。
 */
export function roleColor(role: PixelRole, palette: Palette): string {
  switch (role) {
    case 'ink':
      return palette.text;
    case 'fur':
      return palette.secondary;
    case 'light':
      // 18% 的正文色压在纸面上：比 fur 浅一档，又不至于和白点混在一起
      return withAlphaLocal(palette.text, 0.18);
    case 'dot':
      return palette.surface;
    case 'accent':
      return palette.accent;
  }
}

/**
 * 本地的 alpha 合成。与 theme/tokens.ts 的 withAlpha 同一套算法。
 *
 * 为什么不 import 那个：domain 层不该依赖主题模块的运行时实现，只依赖
 * Palette 的形状（类型 import 在编译后会被抹掉，不算运行时依赖）。
 * 而这是一段 6 行的纯字符串处理，复制过来的风险远小于
 * 「domain 为了拼一个 rgba 去 import 主题」。
 */
function withAlphaLocal(hex: string, alpha: number): string {
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
 * 读屏念的那句话：「狐狸，尖耳朵，收窄的下巴」。
 *
 * 头像是一张图，读屏读不到内容，但「我挑的是哪一只」是这一页的信息，
 * 不该只有看得见的人拿得到。这句话同时也是面板里选中项的播报内容。
 */
export function describeAvatar(id: string): string {
  const option = getAvatarOption(id);
  return `${option.label}，${option.description}`;
}
