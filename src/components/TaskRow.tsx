import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/**
 * 首页的一行习惯。
 *
 * 不用卡片：通栏一行，上下各一条极淡的分隔线，像账本。
 * 这样五条习惯不会变成五张同款圆角卡片（那种布局任何 App 都长一样）。
 *
 * 完成状态不靠删除线（划线是行政语言，带着「这件事过去了」的评判），
 * 靠「退到灰里」：文字降对比、圆点点着。
 * 扫一眼，还在等你的那几行自己亮着，做完的自己沉下去。
 *
 * 圆点是「颜色 + 填充」双通道，色盲用户也能分辨（docs/02 §9）。
 */

export interface TaskRowProps {
  /** 任务名，1–80 字 */
  title: string;
  /**
   * 连胜天数。0 表示还没有连胜。
   * 显示成「连着 3 天」，为 0 时显示「第一天」——永远不显示 0（docs/02 §8）
   */
  streakDays?: number;
  /** 今天是否已经记过 */
  done?: boolean;
  /** 是否禁止点击（已完成后通常为 true） */
  disabled?: boolean;
  /** 单击：记录一次 */
  onPress?: () => void;
  /** 长按：部分完成 / 跳过菜单（阶段 2） */
  onLongPress?: () => void;
  /** 是否显示上方的分隔线。列表里除第一行外都传 true */
  divider?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function TaskRow({
  title,
  streakDays = 0,
  done = false,
  disabled = false,
  onPress,
  onLongPress,
  divider = false,
  style,
}: TaskRowProps) {
  const { theme, palette, reduceMotion } = useTheme();

  // 点着的那一刻，圆点先胀一下再回落——一个很小的确认，不需要弹窗
  const dot = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!done || reduceMotion) {
      dot.setValue(1);
      return;
    }
    Animated.sequence([
      Animated.timing(dot, {
        toValue: 1.7,
        duration: theme.motion.fast,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(dot, {
        toValue: 1,
        duration: theme.motion.normal,
        easing: Easing.out(Easing.back(2)),
        useNativeDriver: true,
      }),
    ]).start();
  }, [done, dot, reduceMotion, theme.motion.fast, theme.motion.normal]);

  // 未开始记录时显示「第一天」，不显示 0
  const streakText = streakDays > 0 ? `连着 ${streakDays} 天` : '第一天';
  const statusText = done ? '今天这一项已经记过了' : streakText;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}，${statusText}`}
      accessibilityState={{ disabled, selected: done }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: 56,
          paddingVertical: theme.spacing.md,
          borderTopWidth: divider ? 1 : 0,
          borderTopColor: palette.border,
          opacity: pressed && !disabled ? 0.55 : 1,
        },
        style,
      ]}
    >
      {/* 圆点：未完成是空心，完成是填满的余烬 */}
      <Animated.View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          borderWidth: done ? 0 : 1.5,
          borderColor: palette.secondary,
          backgroundColor: done ? palette.primary : 'transparent',
          marginRight: theme.spacing.md,
          transform: [{ scale: dot }],
        }}
      />

      <View style={styles.texts}>
        <Text
          numberOfLines={2}
          style={{
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            fontWeight: done ? theme.typography.weight.regular : theme.typography.weight.medium,
            // 完成的退到灰里，未完成的保持全对比
            color: done ? palette.textMuted : palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {title}
        </Text>
        <Text
          style={{
            marginTop: 2,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {statusText}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  texts: {
    flex: 1,
  },
});
