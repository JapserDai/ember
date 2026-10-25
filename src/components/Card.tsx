import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/**
 * 白卡片 —— 全 App 唯一的「框」。
 *
 * 要求是「每一个任务都要框起来，每一条数据都要框起来」，所以这个组件
 * 会被用得非常多：首页的每条习惯、每张待办，「我的」页的每个数据点。
 *
 * ---- 为什么必须是一个组件，不是每处各写一遍 ----
 *
 * 阴影参数有五个（色、偏移、不透明度、半径、elevation），
 * 散落在十几个地方手写，改一次主题就要改十几处，而且一定会有一处漏掉——
 * 那一处会看起来「有点不对」但不报错。放在一处，改一次全局生效。
 *
 * ---- 为什么不做成「有描边 vs 有阴影」两种变体 ----
 *
 * 可以加，但现在不需要。这一版所有框都是同一种：白底 + 极轻阴影，
 * 靠**卡片之间 8px 的缝**分开，不靠描边。加一个没人用的变体，
 * 只会让下一个读代码的人多花一分钟判断该用哪个。
 */
export interface CardProps {
  children: React.ReactNode;
  /** 额外的容器样式。不要在这里覆盖 backgroundColor 或阴影 */
  style?: StyleProp<ViewStyle>;
  /** 内边距。默认用主题的 cardPadding */
  padding?: number;
  /** 无障碍描述。给了才设 accessibilityLabel */
  accessibilityLabel?: string;
  /** 读屏角色。默认 none（卡片本身不是控件） */
  accessibilityRole?: 'none' | 'button' | 'summary';
}

export function Card({
  children,
  style,
  padding,
  accessibilityLabel,
  accessibilityRole = 'none',
}: CardProps) {
  const { theme, palette } = useTheme();

  return (
    <View
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          backgroundColor: palette.surface,
          borderRadius: theme.radius.card,
          padding: padding ?? theme.spacing.cardPadding,
          // Fluent depth-4 的单层近似。五个参数只在这里写一次
          shadowColor: theme.shadow.card.shadowColor,
          shadowOffset: theme.shadow.card.shadowOffset,
          shadowOpacity: theme.shadow.card.shadowOpacity,
          shadowRadius: theme.shadow.card.shadowRadius,
          elevation: theme.shadow.card.elevation,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
