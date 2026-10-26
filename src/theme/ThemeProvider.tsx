import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AccessibilityInfo, useWindowDimensions } from 'react-native';

import { updateSettings } from '../db/repo/settings';
import {
  buildTheme,
  clampFontScale,
  DEFAULT_THEME_ID,
  normalizeThemeId,
  scaleLineHeights,
  type Palette,
  type Theme,
  type ThemeId,
} from './tokens';

/**
 * 主题上下文。
 *
 * 职责：把 token 交给界面，并持有「减少动效」这一读数。
 *
 * ---- D66：动效不再是用户设置，改为跟随系统 ----
 *
 * D66 删掉了「设置 → 动效」开关，本条的补偿方案（记录里写明）：改为跟随
 * 系统的无障碍设置（Android 的「移除动画」）。这里在挂载时读一次
 * `AccessibilityInfo.isReduceMotionEnabled`，之后监听它的变化事件。
 * 之前那个把值写进 `settings.reduce_motion` 的 `setReduceMotion` 已删：
 * 它再没有任何调用方，留着就会有一天被某个新界面接回去，
 * 「跟随系统」悄悄变回「App 内开关」。想恢复开关的那天，
 * 在设置页加一行 SettingsRow 并在这里把系统源与用户源合并——只改这一个文件。
 *
 * `settings.reduce_motion` 列因此成为又一个「存在但没人写」的列
 * （同 `haptics_enabled`、`theme_mode`）：迁移已发布，按 D31 不删。
 * 备份白名单里仍有它——导入一份旧备份带着旧开关值也无妨，没人读它。
 *
 * ---- 这一版删掉了什么 ----
 *
 * 早先这里还持有 themeId 与 themeMode 两件事：能换四套主题，
 * 也能让主题跟随系统的深浅色切换（useColorScheme + resolveScheme）。
 * 现在只留一套白底主题，这两个状态都没有意义了——
 * 没有可切的主题，也就没有「切换到哪一套」「那一切换到暗色」的问题。
 *
 * 删掉 themeId 的连带好处：ThemeProvider 不再需要在切主题时「先写库再改内存态」，
 * 因为现在没有任何主题相关的写库动作。`settings.theme_id` / `theme_mode` 两列
 * 仍然留在表和 schema 里（迁移已发布过，不动它们），只是暂时没人读写。
 * 等功能做完、主题重新做的时候，直接把这两列接回来即可。
 *
 * 持久化规则（减少动效仍然适用）：**先写库、再改内存态**。
 * 反过来的话，写库失败（磁盘满、数据库损坏）时界面已经变了，
 * 用户会以为设置成功，下次打开却变回去——一个会自己忘事的设置比不能改更糟。
 *
 * ---- 字号缩放：为什么主题在这里算行高（外观走查）----
 *
 * React Native 会让 `fontSize` 跟系统字号缩放，**但不会动 `lineHeight`**。
 * 两者不同步时，1.5 倍字号下正文是 22.5 而行高还是 21，字比行高还高，
 * Android 会把上下两端裁掉——每一页的中文都会被切掉一截。
 *
 * 修法有两条：
 *   1. 给每个 `<Text>` 加 `maxFontSizeMultiplier`，把字封在 1.5 倍以内。
 *      这能防住裁字，但同时也把「用户想要更大的字」这个诉求多半拒掉了，
 *      而且要让三四十个组件各重复一遍。
 *   2. **让行高跟着字一起长。** 字多大，行就有多高，不裁也不挤。
 *
 * 这一版选第 2 条：字号仍然跟随系统（满足 docs/02 §9 的「跟随系统字号」），
 * 封顶在 1.5 倍，行高同比例放大。所以 `theme.typography.lineHeight` 不是
 * 从 tokens 里直接拿到的那一份，而是按当前 `fontScale` 算出来的。
 *
 * 代价是 `theme` 对象不再是常量：系统字号一变，这里会重新算一份，
 * 所有读 `useTheme()` 的组件跟着重渲染——这正是我们要的。
 */
export interface ThemeContextValue {
  /** 当前主题的完整 token（含色板、圆角、间距、字号） */
  theme: Theme;
  /** 当前色板。单独给一份，因为它是组件里最常读的东西 */
  palette: Palette;
  /** 当前主题 id。主题选择页用它标记选中项 */
  themeId: ThemeId;
  /** 切主题。先写库再改内存态 */
  setThemeId: (id: ThemeId) => void;
  /** 减少动效：系统无障碍设置（Android「移除动画」）开启时，组件跳过位移、缩放、粒子，只保留淡入淡出 */
  reduceMotion: boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** 初始主题，对应 settings.theme_id */
  initialThemeId?: string;
}

export function ThemeProvider({
  children,
  initialThemeId = DEFAULT_THEME_ID,
}: ThemeProviderProps) {
  /*
   * 减少动效跟随系统（D66 补偿方案的落实）。
   *
   * 初始值取 false：系统设置是异步读的，第一帧先按「无」渲染，
   * 拿到真值后由下面的 effect 改正。系统开着「移除动画」的用户
   * 第一帧可能看到一个动画——300ms 级别、可接受。
   */
  const [reduceMotion, setReduceMotion] = useState(false);
  /**
   * 当前主题 id。
   *
   * 从库里读进来的值可能是脏的（手改过、来自别的版本），
   * 所以先用 normalizeThemeId 收一下。
   */
  const [themeId, setThemeIdState] = useState<ThemeId>(() => normalizeThemeId(initialThemeId));

  /**
   * 系统字号倍数。用户在系统设置里一改，这里会拿到新值并重算行高，
   * 不需要重开 App（安卓上改字号会重建 Activity，但桌面模式与分屏下不一定）。
   */
  const { fontScale } = useWindowDimensions();

  /**
   * 读一次系统设置并持续监听。
   *
   * - 挂载时先读一次（isReduceMotionEnabled 是异步的）；
   * - `reduceMotionChanged` 在用户改系统设置、或 Android 上切到分屏/画中画
   *   等场景时会发，照实跟；
   * - 两处都要防泄漏，卸载时统一摘除。
   */
  useEffect(() => {
    let mounted = true;
    const sub = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  /**
   * 切主题。
   *
   * 只写 theme_id 一个字段：`theme_mode`（深浅）这一版不做，
   * 因为两套主题里已经各自包含了它自己的深浅（见 tokens.ts 的注释）。
   */
  const setThemeId = useCallback((id: ThemeId) => {
    const next = normalizeThemeId(id);
    updateSettings({ themeId: next });
    setThemeIdState(next);
  }, []);

  const value = useMemo<ThemeContextValue>(() => {
    /*
     * 行高需要按字号重算（D37）；色板按主题 id 取（D40）。
     *
     * 倍数为 1 时不必重新构造 typography——但主题 id 变了仍然要重建，
     * 因为色板变了。两件事分开判断，避免「改主题时顺手把行高也重算一遍」。
     */
    const base = buildTheme(themeId);
    const scale = clampFontScale(fontScale);
    const theme: Theme =
      scale === 1
        ? base
        : {
            ...base,
            typography: {
              ...base.typography,
              lineHeight: scaleLineHeights(base.typography.lineHeight, scale),
            },
          };

    return {
      theme,
      palette: theme.palette,
      themeId,
      setThemeId,
      reduceMotion,
    };
  }, [fontScale, themeId, setThemeId, reduceMotion]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** 读取主题。只能在 ThemeProvider 内部使用 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme() 只能在 <ThemeProvider> 内部使用');
  }
  return ctx;
}
