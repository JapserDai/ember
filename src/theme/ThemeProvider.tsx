import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import { updateSettings } from '../db/repo/settings';
import {
  DEFAULT_THEME_ID,
  DEFAULT_THEME_MODE,
  getTheme,
  resolveScheme,
  type Palette,
  type ResolvedScheme,
  type Theme,
  type ThemeId,
  type ThemeMode,
} from './tokens';

/**
 * 主题上下文。
 *
 * 职责：
 * 1. 持有当前 themeId 与 themeMode（内存态，切换立即生效）。
 * 2. themeMode = 'system' 时读取系统配色；夜航在系统模式下优先暗色，
 *    炉边、苔原、晨光优先亮色（见 tokens.ts 的 defaultScheme）。
 *    晨光没有暗色版，任何模式下都解析为亮色（resolveScheme 的第一条规则）。
 * 3. 对外只暴露「已经解析好的」palette，组件不需要关心明暗判断。
 *
 * 持久化：切换时**先写库、再改内存态**。
 * 反过来的话，写库失败（磁盘满、数据库损坏）时界面已经变了，
 * 用户会以为设置成功，下次打开却变回去——一个会自己忘事的设置比不能改更糟。
 */

/** useTheme() 的返回值 */
export interface ThemeContextValue {
  /** 当前主题的完整 token（含色板、圆角、间距、字号） */
  theme: Theme;
  /** 当前生效的色板（已按明暗解析，组件直接用这个） */
  palette: Palette;
  /** 当前生效的明暗方案 */
  scheme: ResolvedScheme;
  /** 当前主题 id */
  themeId: ThemeId;
  /** 当前主题模式设置（可能是 system） */
  themeMode: ThemeMode;
  /**
   * 切换主题。写库成功后才生效；写库失败时抛错，界面保持原样。
   * 调用方（主题选择页）负责把错误变成一句人话。
   */
  setThemeId: (id: ThemeId) => void;
  /** 切换明暗模式，规则同上 */
  setThemeMode: (mode: ThemeMode) => void;
  /** 减少动效：为 true 时组件跳过位移、缩放、粒子，只保留淡入淡出 */
  reduceMotion: boolean;
  setReduceMotion: (value: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** 初始主题 id，默认炉边。启动时应从 settings.theme_id 读取后传入 */
  initialThemeId?: ThemeId;
  /** 初始模式，默认跟随系统。启动时应从 settings.theme_mode 读取后传入 */
  initialThemeMode?: ThemeMode;
  /** 初始的减少动效设置，对应 settings.reduce_motion */
  initialReduceMotion?: boolean;
}

export function ThemeProvider({
  children,
  initialThemeId = DEFAULT_THEME_ID,
  initialThemeMode = DEFAULT_THEME_MODE,
  initialReduceMotion = false,
}: ThemeProviderProps) {
  const [themeId, setThemeIdState] = useState<ThemeId>(initialThemeId);
  const [themeMode, setThemeModeState] = useState<ThemeMode>(initialThemeMode);
  const [reduceMotion, setReduceMotionState] = useState(initialReduceMotion);

  // 系统配色。安卓上在系统设置里切换深浅色时会实时触发重渲染。
  const systemScheme = useColorScheme();

  const theme = useMemo(() => getTheme(themeId), [themeId]);
  const scheme = useMemo(
    () => resolveScheme(theme, themeMode, systemScheme),
    [theme, themeMode, systemScheme],
  );
  const palette = scheme === 'dark' ? theme.dark : theme.light;

  /**
   * 切换主题。
   *
   * 两个字段一起写：切到晨光时如果 theme_mode 还是 dark，界面上看不出问题
   * （晨光没有暗色板），但换回夜航会立刻变成暗色——用户会以为「夜航自己变黑了」。
   * 所以在切主题时把 mode 也归一到与这套主题自洽的值。
   */
  const setThemeId = useCallback(
    (id: ThemeId) => {
      const nextTheme = getTheme(id);
      // 没有暗色版的主题，mode 归到 light，避免留下一个「看起来没生效」的 dark
      const nextMode: ThemeMode = nextTheme.supportsDark ? themeMode : 'light';
      // 先写库：写失败会抛错，界面保持原样
      updateSettings({ themeId: id, themeMode: nextMode });
      setThemeIdState(id);
      setThemeModeState(nextMode);
    },
    [themeMode]
  );

  const setThemeMode = useCallback((mode: ThemeMode) => {
    updateSettings({ themeMode: mode });
    setThemeModeState(mode);
  }, []);

  const setReduceMotion = useCallback((value: boolean) => {
    updateSettings({ reduceMotion: value });
    setReduceMotionState(value);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      palette,
      scheme,
      themeId,
      themeMode,
      setThemeId,
      setThemeMode,
      reduceMotion,
      setReduceMotion,
    }),
    [
      theme,
      palette,
      scheme,
      themeId,
      themeMode,
      setThemeId,
      setThemeMode,
      reduceMotion,
      setReduceMotion,
    ],
  );

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
