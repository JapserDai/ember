import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { initDatabase } from '../src/db/client';
import { getPlayerSnapshot } from '../src/db/repo/player';
import { getSettings } from '../src/db/repo/settings';
import {
  installNotificationHandler,
  maintainRemindersOnLaunch,
} from '../src/services/reminders';
import { settleUpTo } from '../src/services/settle';
import { applyGraceIfNeeded } from '../src/services/streak';
import { grantMonthlyEventReward } from '../src/services/narrative';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

/**
 * 根布局。
 *
 * 启动顺序（顺序错了会白屏或读到空表）：
 *   1. 打开数据库连接 + PRAGMA（src/db/client.ts 的 openDatabase）
 *   2. 手写迁移器跑到最新版本（src/db/migrate.ts 的 migrate）
 *   3. 首次启动写种子：player 1 行 + settings 1 行（src/db/seed.ts 的 seedIfEmpty）
 *      以上三步都封装在 initDatabase() 里，一次调用即可。
 *   4. 惰性日结算：把 last_settled_date 推到今天（src/services/settle.ts）
 *   5. 读 settings，拿到 reduce_motion
 *   6. 渲染界面
 *
 * 全部步骤都是同步的（expo-sqlite 的同步 API），放在 useState 的初始化函数里一次做完，
 * 保证第一帧就带着正确的设置，不会出现「先播动效再关掉」。
 *
 * **第 4 步必须在第 5 步之前。** 结算会写 settings，先读后结算的话
 * 读到的是结算前的值。这一版读的 reduce_motion 不受结算影响，
 * 但顺序按真实依赖写，免得将来加字段时踩坑。
 *
 * 第 5 步只读 reduce_motion：theme_id / theme_mode 两列还在库里（迁移已发布，列不动），
 * 但界面只剩一套白底主题，不再有可切换的外观。
 *
 * ---- 通知在启动流程之外 ----
 *
 * 通知的 handler 与排期都是**异步**的，而上面 1–5 步全部同步、且必须在首帧之前完成。
 * 把它们混在一起会让首帧等一个网络……不，等一个系统调用；而通知晚几十毫秒排上，
 * 用户完全感知不到。所以：
 *   - `installNotificationHandler()` 是纯注册，同步，放在 bootstrap 里；
 *   - `maintainRemindersOnLaunch()` 是异步的，放在挂载后的 useEffect 里，
 *     不 await、失败只打日志（见 services/reminders.ts 的注释）。
 *
 * 结算的结论（比如「昨天空了一天」）在这里**不显示**：根布局没有界面，
 * 而这句话该出现在首页。这一版先只写库与日志，等首页决定怎么展示时再接
 * （`settleUpTo()` 已经把 message 返回出来了）。
 */

/** 启动阶段读到的设置。任何一步出错都回退到默认值，保证界面能出来 */
interface BootState {
  reduceMotion: boolean;
  /** 主题 id。界面层会再 normalize 一次，这里只负责把库里的值递过去 */
  themeId: string;
  /** 引导做完了没有。false 时首帧之后会推到 /onboarding */
  onboardingDone: boolean;
}

function bootstrap(): BootState {
  try {
    // 1–3. 打开连接 → 迁移 → 首次种子
    initDatabase();

    // 4. 惰性日结算。只推进 last_settled_date，不惩罚、不扣分（见 domain/settle.ts）
    settleUpTo();

    /*
     * 4.5 惰性补宽限券（D38）。
     *
     * 必须在结算**之后**：结算先把 last_settled_date 推到今天，
     * 而 applyGraceIfNeeded 要用「今天」去反推「昨天」。
     * 反过来的话，跨日打开时昨天会被算错一天。
     *
     * 它自己包了 try/catch，失败不影响启动。
     * 结果（是否用掉一张券）这里**不显示**：根布局没有界面，
     * 那句话该出现在首页（与结算的 message 同一个处理方式）。
     */
    applyGraceIfNeeded();

    /*
     * 4.6 月度活动奖励（阶段 5 第 1 条）。
     *
     * 发的是**上个月**的：这个月还没过完，不该提前发。
     * 只在这个月有记录时发，而「发过没有」记在
     * `player.last_event_reward_month` 里（否则每次启动都会发一遍）。
     *
     * 与结算、宽限券同一个时机：那是我们唯一确定「用户现在打开了 App」的时刻。
     */
    grantMonthlyEventReward();

    // 5. 读设置。种子保证这一行存在。
    //    放在结算之后读：结算会改写 settings 的行
    const settings = getSettings();

    /*
     * 引导做完了没有。
     *
     * 读不到时按「已做完」处理：让用户进 App 比把他困在引导里好。
     * （引导那一页会建任务，而建任务需要库是好的。）
     */
    let onboardingDone = true;
    try {
      onboardingDone = getPlayerSnapshot().onboardingDone;
    } catch (err) {
      console.warn('[Ember] 读取引导状态失败，按已完成处理', err);
    }

    /*
     * 注册前台通知行为。放在 try 里：注册本身不会抛错，
     * 但它在某些机型上会触发一次渠道查询——与数据库无关的失败不该让 App 打不开。
     */
    try {
      installNotificationHandler();
    } catch (err) {
      console.warn('[Ember] 注册通知行为失败', err);
    }

    // TODO: 时区变更检测 —— 与 settings.last_time_zone 不同则重算业务日边界，
    //       结算完成后调 updateLastTimeZone() 记下新时区。
    //       现在不急：业务日完全由 day_start_hour + 本地时间算出，
    //       时区变了本地时间自然就变了，不需要单独一步去「重算」。
    //       真正要用时区的是通知排期（阶段 2 的通知部分）。

    return {
      reduceMotion: settings.reduce_motion === 1,
      themeId: settings.theme_id,
      onboardingDone,
    };
  } catch (err) {
    // 数据库不可用时不要白屏：退回默认设置，界面照常渲染
    console.warn('[Ember] 数据库初始化未完成，界面暂时使用默认设置', err);
    return {
      reduceMotion: false,
      themeId: 'furnace',
      // 读不到就当已做完：宁可少一次引导，也不要在一个坏掉的库上
      // 把用户困在引导里（那一页会建任务，而建任务会失败）
      onboardingDone: true,
    };
  }
}

export default function RootLayout() {
  // 只在首次渲染时执行一次启动流程
  const [boot] = useState<BootState>(bootstrap);

  return (
    <SafeAreaProvider>
      <ThemeProvider initialReduceMotion={boot.reduceMotion} initialThemeId={boot.themeId}>
        <ThemedRoot onboardingDone={boot.onboardingDone} />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/**
 * 判断一套色板是「深底」还是「浅底」。
 *
 * 用来决定状态栏图标该用深色还是浅色。
 * 用正文色的亮度判断而不是主题 id：这样将来加一套新的深色主题时，
 * 不需要回来改这个函数（否则那一定是一个会被忘掉的步骤）。
 *
 * 亮度用 sRGB 的近似权重（0.299R + 0.587G + 0.114B）。
 * 阈值 0.5 在四套主题上都分得开：白/苔原/晨光的正文是深色，夜航是浅色。
 */
function isDarkPalette(textColor: string): boolean {
  const hex = textColor.replace('#', '');
  if (hex.length !== 6) return false;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return false;
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

/** 需要读主题的部分放在 ThemeProvider 内部，所以拆成子组件 */
function ThemedRoot({ onboardingDone }: { onboardingDone: boolean }) {
  const { palette } = useTheme();
  const router = useRouter();

  /*
   * 启动后的提醒维护：补排未来 7 天、时区变了就整体重排。
   *
   * 依赖数组是空的——它只在挂载时跑一次。不放进 bootstrap 是因为它是异步的，
   * 而 bootstrap 在 useState 的初始化函数里同步执行。
   */
  React.useEffect(() => {
    void maintainRemindersOnLaunch();
  }, []);

  /*
   * 首次启动时把用户送到引导页（阶段 6 第 6 条）。
   *
   * 为什么用 effect 而不是在渲染里直接 redirect：首帧必须先画出底下的 Stack，
   * 否则路由表还没挂好，replace 会被丢掉。
   *
   * 为什么是 replace 而不是 push：引导不该留在返回栈里。
   * 用户从引导出来之后按返回，应该退出 App，而不是回到引导。
   */
  React.useEffect(() => {
    if (!onboardingDone) router.replace('/onboarding');
  }, [onboardingDone, router]);

  return (
    <View style={[styles.root, { backgroundColor: palette.background }]}>
      {/*
       * 状态栏图标颜色要跟着主题走。
       *
       * 早先这里写死 `style="dark"`（深色图标），因为那时只有白底主题。
       * 阶段 4 加了「夜航」（深底）之后，深色图标压在深色背景上就看不见了——
       * 表现是顶部只剩时间与电量的残影，而代码里没有任何一处看得出问题。
       */}
      <StatusBar style={isDarkPalette(palette.text) ? 'light' : 'dark'} />

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
