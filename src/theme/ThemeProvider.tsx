import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

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
 *    炉边与苔原优先亮色（见 tokens.ts 的 defaultScheme）。
 * 3. 对外只暴露「已经解析好的」palette，组件不需要关心明暗判断。
 *
 * 持久化：阶段 1 只做内存态。等 db 层的 settings 仓储完成后，
 * 在 setThemeId / setThemeMode 里补一次写库（TODO 见下方）。
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
  /** 切换主题。阶段 1 还没有主题选择页，接口先留好 */
  setThemeId: (id: ThemeId) => void;
  /** 切换明暗模式 */
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

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    // TODO(db): settingsRepo.updateTheme(id, themeMode)
    // 阶段 1 主题固定为炉边，这里只保留接口；写库在设置页落地时接上。
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
    // TODO(db): settingsRepo.updateThemeMode(mode)
  }, []);

  const setReduceMotion = useCallback((value: boolean) => {
    setReduceMotionState(value);
    // TODO(db): settingsRepo.updateReduceMotion(value ? 1 : 0)
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

/** 读取主题。必须在 ThemeProvider 内部使用 */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme() 必须在 <ThemeProvider> 内部使用');
  }
  return ctx;
}
