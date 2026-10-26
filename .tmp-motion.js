// 一次性重构（D66）：删掉 App 内的「动效」开关，改为跟随系统的减少动效设置。
// 跑完即删。
const fs = require('fs');
const ROOT = 'C:/Users/16907/Ember/';

const read = (p) => fs.readFileSync(ROOT + p, 'utf8');
const write = (p, s) => fs.writeFileSync(ROOT + p, s, 'utf8');

// ---------- 1. ThemeProvider ----------
{
  const p = 'src/theme/ThemeProvider.tsx';
  let s = read(p);

  // 文件头那段「持有减少动效这一个用户设置」改掉
  s = s.replace(
    ' * 职责：把 token 交给界面，并持有「减少动效」这一个用户设置。',
    ' * 职责：把 token 交给界面，并暴露「减少动效」这一读数。\n' +
      ' *\n' +
      ' * ---- D66：动效不再是用户设置，改为跟随系统 ----\n' +
      ' *\n' +
      ' * 原来「设置 → 外观 → 动效」有一个开关，值存在 `settings.reduce_motion`。\n' +
      ' * 它的问题不是没用，而是**看不出来**：这一页本身一个动画都没有，改完设置\n' +
      ' * 停在原地，屏幕上什么都不会变；而回到「今天」页能看到的动画只有一处\n' +
      ' * （记录时的飘字），其余要么只闪 280ms、要么根本触发不到。\n' +
      ' *\n' +
      ' * 所以这个开关被删了，改成读系统的无障碍设置（`AccessibilityInfo`）：\n' +
      ' * 用户在系统里开过「移除动画」，App 就跟着安静下来；没开过就是完整动效。\n' +
      ' * 这与系统字号的处理是同一个思路——**无障碍偏好属于系统，不属于单个 App**。\n' +
      ' *\n' +
      ' * `settings.reduce_motion` 列仍然留在表和 schema 里（D31：已发布的建表\n' +
      ' * 常量不许改），只是不再读写。'
  );

  s = s.replace(
    "import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';\nimport { useWindowDimensions } from 'react-native';",
    "import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';\nimport { AccessibilityInfo, useWindowDimensions } from 'react-native';"
  );

  // context 类型：去掉 setReduceMotion
  s = s.replace(
    `  /** 减少动效：为 true 时组件跳过位移、缩放、粒子，只保留淡入淡出 */
  reduceMotion: boolean;
  setReduceMotion: (value: boolean) => void;`,
    `  /**
   * 减少动效：为 true 时组件跳过位移、缩放、粒子，只保留淡入淡出。
   *
   * **只读**（D66）：它跟随系统的无障碍设置，App 内没有开关。
   */
  reduceMotion: boolean;`
  );

  // props：去掉 initialReduceMotion
  s = s.replace(
    `  /** 初始的减少动效设置，对应 settings.reduce_motion */
  initialReduceMotion?: boolean;
  /** 初始主题，对应 settings.theme_id */`,
    `  /** 初始主题，对应 settings.theme_id */`
  );

  s = s.replace(
    `export function ThemeProvider({
  children,
  initialReduceMotion = false,
  initialThemeId = DEFAULT_THEME_ID,
}: ThemeProviderProps) {
  const [reduceMotion, setReduceMotionState] = useState(initialReduceMotion);`,
    `export function ThemeProvider({ children, initialThemeId = DEFAULT_THEME_ID }: ThemeProviderProps) {
  /**
   * 减少动效：初值 false（完整动效），挂载后问一次系统，之后跟着系统的变化走。
   *
   * 为什么初值不阻塞首帧：`AccessibilityInfo` 的查询是异步的。
   * 等它回来再渲染会让冷启动多一帧空白，而「第一帧播了一个动画、
   * 第二帧才关掉」的代价比空白小得多——一个 200ms 的位移，用户根本来不及看。
   */
  const [reduceMotion, setReduceMotionState] = useState(false);

  useEffect(() => {
    let alive = true;

    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (alive) setReduceMotionState(enabled);
      })
      .catch(() => {
        // 读不到就当没开：完整动效是默认行为，不是错误
      });

    /*
     * 订阅系统的变化：用户在系统设置里改了之后，App 不需要重启就跟着变。
     *
     * `addEventListener` 返回一个 subscription（新版 RN），旧版返回 undefined。
     * 两种都处理：有 remove 就调，没有就什么也不做。
     */
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      setReduceMotionState(enabled);
    });

    return () => {
      alive = false;
      if (sub && typeof sub.remove === 'function') sub.remove();
    };
  }, []);`
  );

  // 删掉 setReduceMotion 的 callback
  s = s.replace(
    `  const setReduceMotion = useCallback((value: boolean) => {
    updateSettings({ reduceMotion: value });
    setReduceMotionState(value);
  }, []);

`,
    ''
  );

  // value 里去掉 setReduceMotion
  s = s.replace(
    `      reduceMotion,
      setReduceMotion,
    };
  }, [fontScale, themeId, setThemeId, reduceMotion, setReduceMotion]);`,
    `      reduceMotion,
    };
  }, [fontScale, themeId, setThemeId, reduceMotion]);`
  );

  write(p, s);
  console.log('ThemeProvider 已更新');
}

// ---------- 2. app/_layout.tsx ----------
{
  const p = 'app/_layout.tsx';
  let s = read(p);

  s = s.replace(
    `    return {
      reduceMotion: settings.reduce_motion === 1,
      themeId: settings.theme_id,`,
    `    return {
      themeId: settings.theme_id,`
  );
  s = s.replace(
    `    return {
      reduceMotion: false,
      themeId: 'furnace',`,
    `    return {
      themeId: 'furnace',`
  );
  s = s.replace(
    '  reduceMotion: boolean;\n',
    ''
  );
  s = s.replace(
    '      <ThemeProvider initialReduceMotion={boot.reduceMotion} initialThemeId={boot.themeId}>',
    '      <ThemeProvider initialThemeId={boot.themeId}>'
  );

  write(p, s);
  console.log('_layout 已更新');
}

// ---------- 3. settings/index.tsx ----------
{
  const p = 'app/settings/index.tsx';
  let s = read(p);

  // 删 handleToggleMotion 整段（含它上面那段长注释）
  const startMarker = '  /**\n   * 切换「减少动效」。';
  const i = s.indexOf(startMarker);
  if (i === -1) throw new Error('handleToggleMotion 注释没找到');
  const endMarker = '  }, [reduceMotion, setReduceMotion]);\n';
  const j = s.indexOf(endMarker, i);
  if (j === -1) throw new Error('handleToggleMotion 结尾没找到');
  s = s.slice(0, i) + s.slice(j + endMarker.length);

  // 删设置行
  s = s.replace(
    `        {
          label: '动效',
          value: reduceMotion ? '已减弱' : '完整',
          state: 'interactive',
          onPress: handleToggleMotion,
        },
`,
    ''
  );

  // 去掉 useTheme 里的 reduceMotion / setReduceMotion
  s = s.replace(
    '  const { theme, palette, reduceMotion, setReduceMotion, themeId } = useTheme();',
    '  const { theme, palette, themeId } = useTheme();'
  );

  write(p, s);
  console.log('settings/index 已更新');
}

// ---------- 4. 六个组件：不再写「减少动效时…」里对设置页的指代 ----------
// 组件的逻辑不动（它们仍然读 reduceMotion），只把注释里「设置里关掉」的措辞改掉。
{
  const files = [
    'src/components/AddButton.tsx',
    'src/components/AwardFloat.tsx',
    'src/components/HearthBar.tsx',
    'src/components/SwipeToDelete.tsx',
    'src/components/TaskRow.tsx',
    'src/components/TodoCheckbox.tsx',
  ];
  for (const f of files) {
    let s = read(f);
    s = s.split('减少动效」的承诺是关掉位移与缩放（docs/02 §9）').join('减少动效（跟随系统，D66）会关掉位移与缩放');
    s = s.split('reduce_motion 打开时').join('系统的「减少动效」打开时');
    s = s.split('`reduce_motion` 打开时').join('系统的「减少动效」打开时');
    write(f, s);
  }
  console.log('组件注释已更新');
}
