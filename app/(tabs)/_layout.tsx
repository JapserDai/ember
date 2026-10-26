import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { TabBarIcon, type TabIconName } from '../../src/components/TabBarIcon';
import { MAX_FONT_SCALE } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 底部 4 个 tab：今天 / 状态 / 日记 / 我的（docs/02 §4.1）。
 *
 * ---- 2026-10-26 的两个替换（D48 / D49）----
 *
 * 「目标」换成「状态」：照抄人升（LifeUp）的「状态」页——人生等级 + 属性条。
 * 「目标」降为二级页，入口在「我的」页。理由：目标本来就不是每天要看的，
 * 而「我走到哪了」是。底栏只有四个位置，占位的应该是最常回看的那个。
 *
 * 「回忆」换成「日记」：同一个 tab 换了重心——从「一堆卡片」变成
 * 「每天写一句」。周 / 月复盘仍然在里面，但排到日记下面。
 *
 * 图标是手绘的 SVG（src/components/TabBarIcon.tsx），不装图标库。
 * 早先的做法是用一个汉字当图标（今 / 标 / 忆 / 我），问题在于
 * 「今」压着「今天」——一列里两行中文，读起来是重复而不是「图形 + 名字」，
 * 而且 19px 的字和 11px 的标签字重接近，视觉上分不出哪层是图标。
 *
 * 选中态有三件事同时变化，任何一件单独失效都还能分辨：
 *   1. 线宽从 1.45 变成 1.95（不看颜色也认得出来——色盲用户靠这一条）；
 *   2. 颜色从次要色变成正文色（不是主色：主色是「火」的颜色，
 *      四个图标里有两个提到火，底栏全都染上余烬红会把火的分量用光）；
 *   3. 图标下方一个 3px 的余烬点，只有选中时才有实体。
 */

interface TabDef {
  name: string;
  title: string;
  icon: TabIconName;
}

const TABS: readonly TabDef[] = [
  { name: 'index', title: '今天', icon: 'today' },
  { name: 'status', title: '状态', icon: 'status' },
  { name: 'journal', title: '日记', icon: 'journal' },
  { name: 'me', title: '我的', icon: 'me' },
];

export default function TabsLayout() {
  const { theme, palette } = useTheme();

  /*
   * 底栏高度必须跟着系统字号长（外观走查：1.5 倍字号下的截断）。
   *
   * 原因：底栏的高度原来是一个**写死的数**（62），而里面的标签是一个
   * **会跟着系统字号变高的东西**。系统把字号放到 1.5 倍时，标签行高从 14
   * 变成 21，那 7 个像素没地方去，就从标签的上下两头被裁掉——
   * 表现是「今天」的下半截没了，而代码里没有任何一处看得出问题。
   *
   * 行高已经由 ThemeProvider 按系统字号算好了（见那里的注释），
   * 所以这里只管把它换算成底栏高度：固定部分（图标 23 + 点 3 + 上下留白 16）+ 标签行。
   * 1.0 倍时正好是 62（与原来的取值逐像素一致），1.5 倍时变成 69。
   */
  const labelSize = theme.typography.size.caption - 2;
  const labelLine = theme.typography.lineHeight.caption - 2;
  const barHeight = 62 + (labelLine - 14);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: {
          // 底栏用白（surface），不是页面底色（#FAF9F8）：
          // Microsoft To Do 的底栏是一张白纸压在灰底上，顶部一条发丝线。
          // 用页面底色的话，底栏和内容会连成一片，看不出「这是另一层」。
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          borderTopWidth: 1,
          // 图标 23 + 点 3 + 标签行 + 上下留白。算式见上面那段注释：
          // 1.0 倍时就是原来的 62，1.5 倍时跟着标签一起长（docs/02 §9）
          height: barHeight,
          paddingTop: 7,
          paddingBottom: 9,
          // 去掉安卓默认的投影，底栏是一条干净的线
          elevation: 0,
        },
        // 图标与标签之间的间距。默认值在各平台不一致，写死一个更好对齐
        tabBarIconStyle: {
          marginTop: 0,
          marginBottom: 2,
        },
        sceneStyle: { backgroundColor: palette.background },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            /*
             * 标签自己画，不用默认的 Label。
             *
             * 原因：`tabBarLabelStyle` 的类型是 `StyleProp<TextStyle>`，而
             * `maxFontSizeMultiplier` **不是** TextStyle 的字段——它是 Text 组件的 prop。
             * 以前把它写进 style 里，tsc 报 TS2353，而且运行时也真的没生效。
             *
             * 这里封顶 1.5 是有必要的：底栏是四个 tab 平分的，标签比图标宽的时候，
             * 四个标签会互相挤到对方的位置上。1.5 倍是 docs/02 §9 定的上限。
             */
            tabBarLabel: ({ color, children }) => (
              <Text
                numberOfLines={1}
                allowFontScaling
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={{
                  fontSize: labelSize,
                  lineHeight: labelLine,
                  color: typeof color === 'string' ? color : palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                  fontWeight: theme.typography.weight.medium,
                  textAlign: 'center',
                }}
              >
                {children}
              </Text>
            ),
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.iconSlot}>
                {/*
                 * color 的类型是 ColorValue（字符串、数字或 null），而 SVG 的描边只收字符串。
                 * 非字符串时退回次要文字色：图标仍然可见，而不是变成透明或崩掉。
                 */}
                <TabBarIcon
                  name={tab.icon}
                  color={typeof color === 'string' ? color : palette.textMuted}
                  focused={focused}
                  size={23}
                />
                {/*
                 * 选中标记：一个 3px 的圆点。
                 *
                 * 图标换成主色之后，这个点其实是**冗余**的——但它留着，
                 * 因为色盲用户看不出蓝灰之差，那 3px 的实体是他们唯一的线索
                 * （docs/02 §10）。冗余在这里是功能，不是装饰。
                 */}
                <View
                  style={[
                    styles.emberDot,
                    { backgroundColor: focused ? palette.primary : 'transparent' },
                  ]}
                />
              </View>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}

const styles = StyleSheet.create({
  /** 图标 + 余烬点的竖排。固定宽度让四个 tab 的图标严格对齐 */
  iconSlot: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 30,
  },
  emberDot: {
    marginTop: 2,
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
});
