import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initDatabase } from '../src/db/client';
import { getSettings } from '../src/db/repo/settings';
import {
  DEFAULT_THEME_ID,
  DEFAULT_THEME_MODE,
  type ThemeId,
  type ThemeMode,
} from '../src/theme/tokens';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

/**
 * 根布局。
 *
 * 启动顺序（顺序错了会白屏或读到空表）：
 *   1. 打开数据库连接 + PRAGMA（src/db/client.ts 的 openDatabase）
 *   2. 手写迁移器跑到最新版本（src/db/migrate.ts 的 migrate）
 *   3. 首次启动写种子：player 1 行 + settings 1 行（src/db/seed.ts 的 seedIfEmpty）
 *      以上三步都封装在 initDatabase() 里，一次调用即可。
 *   4. 读 settings，拿到 theme_id / theme_mode / reduce_motion
 *   5. 惰性日结算：补齐上次打开到今天之间的业务日（src/domain/settle.ts，尚未落地）
 *   6. 渲染界面
 *
 * 第 1–4 步是同步的（expo-sqlite 的同步 API），放在 useState 的初始化函数里一次做完，
 * 保证第一帧就带着正确的主题，不会出现「先亮色闪一下再变暗色」。
 */

/** 启动阶段读到的主题与设置。任何一步出错都回退到默认值，保证界面能出来 */
interface BootState {
  themeId: ThemeId;
  themeMode: ThemeMode;
  reduceMotion: boolean;
}

function bootstrap(): BootState {
  try {
    // 1–3. 打开连接 → 迁移 → 首次种子
    initDatabase();

    // 4. 读设置。种子保证这一行存在
    const settings = getSettings();

    // 5. TODO(settle): 惰性日结算。
    //    const { today, clockBack } = effectiveToday(
    //      Date.now(), settings.day_start_hour, settings.last_settled_date);
    //    settleDays(settings.last_settled_date, today, { clockBack });
    //    settingsRepo.updateLastSettledDate(today);
    //    结算只补记录、不扣任何东西；时钟被调回过去时沿用 last_settled_date（见 domain/date.ts）。
    //
    //    TODO: 时区变更检测 —— 与 settings.last_time_zone 不同则重算业务日边界，
    //          结算完成后调 updateLastTimeZone() 记下新时区。

    return {
      themeId: settings.theme_id,
      themeMode: settings.theme_mode,
      reduceMotion: settings.reduce_motion === 1,
    };
  } catch (err) {
    // 数据库不可用时不要白屏：退回默认主题，首页用示例数据渲染
    console.warn('[Ember] 数据库初始化未完成，首页暂时使用示例数据', err);
    return {
      themeId: DEFAULT_THEME_ID,
      themeMode: DEFAULT_THEME_MODE,
      reduceMotion: false,
    };
  }
}

export default function RootLayout() {
  // 只在首次渲染时执行一次启动流程
  const [boot] = useState<BootState>(bootstrap);

  return (
    <SafeAreaProvider>
      <ThemeProvider
        initialThemeId={boot.themeId}
        initialThemeMode={boot.themeMode}
        initialReduceMotion={boot.reduceMotion}
      >
        <ThemedRoot />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** 需要读主题的部分放在 ThemeProvider 内部，所以拆成子组件 */
function ThemedRoot() {
  const { palette, scheme } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      {/* 状态栏跟随主题明暗，避免暗色主题下出现一条亮色条 */}
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />

      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
          // 页面之间用淡入；淡入不属于位移动画，减少动效时也保留
          animation: 'fade',
        }}
      >
        {/*
         * 只显式声明 (tabs)。settings/index 由 expo-router 按文件自动注册，
         * 它不在 tab 组里，所以打开后底栏消失，页面上唯一的出口是左上角的「返回」。
         *
         * 不单独给它指定动画：沿用上面的 fade。D14 定了全 App 只有一个编排过的动效，
         * 页面切换一律淡入，不加入场位移。
         */}
        <Stack.Screen name="(tabs)" />
      </Stack>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
