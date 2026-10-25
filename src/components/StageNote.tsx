import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/**
 * 「这一页现在还没有东西，什么时候会有」的说明。
 *
 * 阶段 1 的回忆页还是空的。空状态不是占位符，是行动邀请——
 * 但它得说清楚「现在能做什么」和「以后会有什么」，而不是一句「敬请期待」。
 *
 * 视觉上故意做得比正文轻：一条左侧竖线 + 小字，不占版面。
 * 这是临时组件，等这两页有真内容时删掉。
 */
export interface StageNoteProps {
  /** 小标题，例如「阶段 3 会做」 */
  title: string;
  /** 正文说明 */
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function StageNote({ title, children, style }: StageNoteProps) {
  const { theme, palette } = useTheme();

  return (
    <View
      style={[
        {
          borderLeftWidth: 2,
          borderLeftColor: palette.border,
          paddingLeft: theme.spacing.md,
        },
        style,
      ]}
    >
      <Text
        style={{
          fontSize: theme.typography.size.caption,
          lineHeight: theme.typography.lineHeight.caption,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          marginTop: theme.spacing.xs,
          fontSize: theme.typography.size.body,
          lineHeight: theme.typography.lineHeight.body,
          color: palette.text,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {children}
      </Text>
    </View>
  );
}
