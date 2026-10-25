import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/**
 * 设置页的一行。
 *
 * 三种状态，视觉上必须能分辨（docs/02 §4.3）：
 *   - interactive：能点。label 用正文色，右侧值用次要色，按下整行降透明度。
 *   - readonly：只显示当前值，不能改。label 与值都用次要色偏正文的那一档。
 *   - later：还没做。label 与值都退到 textMuted，右侧写「之后」。
 *
 * 为什么不给未做的行做「灰色可点」：点了没反应比不给点更让人困惑。
 * 不做的行直接不给 Pressable，无障碍上也不会被读成按钮。
 *
 * 视觉沿用「我的」页的设置行：通栏、44 高、发丝分隔线、无卡片、无箭头。
 */

export type SettingsRowState = 'interactive' | 'readonly' | 'later';

export interface SettingsRowProps {
  /** 左侧名称，例如「主题」 */
  label: string;
  /** 右侧当前值。later 状态下忽略，统一显示「之后」 */
  value?: string;
  state: SettingsRowState;
  /** 是否显示上方的分隔线。分组内除第一行外都传 true */
  divider?: boolean;
  /** interactive 状态下的点击回调 */
  onPress?: () => void;
  /** 无障碍用的补充说明，例如「还不能改」 */
  hint?: string;
}

export function SettingsRow({
  label,
  value,
  state,
  divider = false,
  onPress,
  hint,
}: SettingsRowProps) {
  const { theme, palette } = useTheme();

  const displayValue = state === 'later' ? '之后' : (value ?? '');
  const isInteractive = state === 'interactive';

  // 有真值的行（可点或只读）：label 用正文色，值用次要色，形成「左边名字、右边状态」的层级
  // 没做的行：label 也退到次要色，整行一起沉下去
  const labelColor = state === 'later' ? palette.textMuted : palette.text;
  // 值一律用次要色。可点的行靠按下反馈区分，不靠值的颜色——
  // 让值变亮会读成「这一行被选中了」，而不是「这一行能点」
  const valueColor = palette.textMuted;

  const content = (
    <>
      <Text
        style={{
          fontSize: theme.typography.size.body,
          lineHeight: theme.typography.lineHeight.body,
          color: labelColor,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          marginLeft: theme.spacing.md,
          fontSize: theme.typography.size.label,
          lineHeight: theme.typography.lineHeight.label,
          color: valueColor,
          fontFamily: theme.typography.fontFamily.body,
          fontVariant: ['tabular-nums'],
        }}
      >
        {displayValue}
      </Text>
    </>
  );

  const rowStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: theme.touchTarget,
    borderTopWidth: divider ? 1 : 0,
    borderTopColor: palette.border,
  };

  // 未实现的行不给 Pressable：点了没反应比不给点更让人困惑
  if (!isInteractive) {
    return (
      <View
        accessible
        accessibilityLabel={`${label}，${state === 'later' ? '还不能改' : displayValue}`}
        style={rowStyle}
      >
        {content}
      </View>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}，${displayValue}`}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => [rowStyle, { opacity: pressed ? 0.55 : 1 }]}
    >
      {content}
    </Pressable>
  );
}
