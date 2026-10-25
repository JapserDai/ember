import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 底部 4 个 tab：今天 / 目标 / 回忆 / 我的（docs/02 §5.1）。
 *
 * 图标用单个汉字，不用图标库：
 *   - 少一个依赖，少一份打包体积；
 *   - 中文原生的产品，用一个字当图标比用通用线条图标更贴。
 *
 * 选中态不靠彩色文字（彩色小字压在底栏上对比度不够），
 * 靠「字重 + 下方一个余烬小点」。两件事同时变化，色盲用户也看得出来。
 */

/** 每个 tab 的占位字形与中文名 */
const TABS = [
  { name: 'index', title: '今天', glyph: '今' },
  { name: 'goals', title: '目标', glyph: '标' },
  { name: 'memories', title: '回忆', glyph: '忆' },
  { name: 'me', title: '我的', glyph: '我' },
] as const;

export default function TabsLayout() {
  const { theme, palette } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.text,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: {
          backgroundColor: palette.background,
          borderTopColor: palette.border,
          borderTopWidth: 1,
          // 触控目标最小 44（docs/02 §10）
          height: 62,
          paddingTop: 8,
          paddingBottom: 10,
          // 去掉安卓默认的投影，底栏是一条干净的线
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: theme.typography.size.caption - 2,
          letterSpacing: 0.5,
          fontFamily: theme.typography.fontFamily.body,
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
            tabBarIcon: ({ color, focused }) => (
              <View style={styles.icon}>
                <Text
                  style={{
                    fontSize: 19,
                    lineHeight: 24,
                    fontWeight: focused ? '600' : '400',
                    color,
                  }}
                >
                  {tab.glyph}
                </Text>
                {/* 选中标记：一个 3px 的余烬点。未选中时留出同样的高度，避免底栏跳动 */}
                <View
                  style={{
                    marginTop: 2,
                    width: 3,
                    height: 3,
                    borderRadius: 1.5,
                    backgroundColor: focused ? palette.primary : 'transparent',
                  }}
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
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
