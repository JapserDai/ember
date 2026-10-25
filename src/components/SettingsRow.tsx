import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from './Card';
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
 * 视觉沿用「我的」页：每行一张白卡片、44 高、无箭头。
 *
 * 早先这一页是一张通栏的卡、行与行之间画发丝线。现在每行各占一张卡——
 * 与「每一条数据都要框起来」同一套语言。留在同一张卡里的只有
 * QuickStart 那三个模板，因为那三个是同一件事的三个选项。
 */

export type SettingsRowState = 'interactive' | 'readonly' | 'later';

export interface SettingsRowProps {
  /** 左侧名称，例如「主题」 */
  label: string;
  /** 右侧当前值。later 状态下忽略，统一显示「之后」 */
  value?: string;
  state: SettingsRowState;
  /** interactive 状态下的点击回调 */
  onPress?: () => void;
  /** 无障碍用的补充说明，例如「还不能改」 */
  hint?: string;
}

export function SettingsRow({
  label,
  value,
  state,
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
      {/*
       * 左侧名字。
       *
       * 外观走查（1.5 倍字号）加的两件事：flexShrink 让长的值先换行、
       * 而不是把名字挤成两行；以及 numberOfLines={2}——「一句自我介绍」
       * 这个标签有 6 个字，1.5 倍字号下在窄屏上会占满半行。
       * 名字是本行要读的东西，值才是附带的。
       */}
      <Text
        numberOfLines={2}
        style={{
          flexShrink: 1,
          fontSize: theme.typography.size.body,
          lineHeight: theme.typography.lineHeight.body,
          color: labelColor,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {label}
      </Text>
      {/*
       * 右侧的值。
       *
       * 加了 numberOfLines：早先这里的值都是短的（主题名、难度、时刻），
       * 但「一句自我介绍」可以有 80 字，一行放不下会把左边那个名字挤窄，
       * 甚至把它挤成两行——而这一行的语义是「左边是名字、右边是状态」，
       * 两边高度不一致就不再是同一行了。
       * 被截断的值用省略号收尾，用户点进去就能看到全文。
       *
       * flexShrink: 1 让它先让位，而不是把 label 推走。
       *
       * 外观走查（1.5 倍字号）改的一处：1 → 2 行。
       * 字号放大后一行只能放十来个字，一个 80 字的自我介绍只剩「想写点什么就…」，
       * 而这一页的值是用户判断「我现在是什么状态」的唯一依据。
       * 两行仍然会截断，但至少看得出那句话说的是什么。
       */}
      <Text
        numberOfLines={2}
        style={{
          flexShrink: 1,
          marginLeft: theme.spacing.md,
          fontSize: theme.typography.size.label,
          lineHeight: theme.typography.lineHeight.label,
          color: valueColor,
          fontFamily: theme.typography.fontFamily.body,
          fontVariant: ['tabular-nums'],
          textAlign: 'right',
        }}
      >
        {displayValue}
      </Text>
    </>
  );

  const rowStyle = {
    flexDirection: 'row' as const,
    // 两边都可能换行到两行，此时 center 让两块作为一个整体垂直居中；
    // 外面再加一层上下 padding，避免两行内容贴着卡片边框
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    minHeight: theme.touchTarget,
    paddingHorizontal: theme.spacing.cardPadding,
    paddingVertical: theme.spacing.sm,
  };

  // 未实现的行不给 Pressable：点了没反应比不给点更让人困惑
  if (!isInteractive) {
    return (
      <Card style={{ marginBottom: theme.spacing.cardGap }} padding={0}>
        <View
          accessible
          accessibilityLabel={`${label}，${state === 'later' ? '还不能改' : displayValue}`}
          style={rowStyle}
        >
          {content}
        </View>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: theme.spacing.cardGap }} padding={0}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}，${displayValue}`}
        accessibilityHint={hint}
        onPress={onPress}
        style={({ pressed }) => [rowStyle, { opacity: pressed ? 0.55 : 1 }]}
      >
        {content}
      </Pressable>
    </Card>
  );
}
