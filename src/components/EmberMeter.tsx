import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/**
 * 今日进度：一排炭。
 *
 * 为什么不用进度环：圆环是仪表盘的语言，属于「你在被测量」的场景。
 * 这个 App 要的是「炉膛里有几块炭点着了」，所以用一排小横条，
 * 点着一块填成余烬色，没点着的留一条浅痕。
 *
 * 也不显示百分比和「0%」——一天刚开始就显示 0% 会像在扣分（docs/02 §4.2）。
 * 要看具体数字时看旁边的「3 / 5」，那里是可数的、能解释的。
 */

export interface EmberMeterProps {
  /** 已完成数 */
  value: number;
  /** 总数。超过 maxSegments 时按比例压缩显示 */
  total: number;
  /** 最多画几段。默认 7，超过就压缩 */
  maxSegments?: number;
  /** 每段宽度。stretch 为 true 时忽略 */
  segmentWidth?: number;
  /** 段高 */
  segmentHeight?: number;
  /**
   * 是否撑满容器宽度。
   * 首页顶部的那一排用 true：它要占满整行，才撑得起「今日进度」这个主角；
   * 区块标题旁的小排用 false，固定宽度更安静。
   */
  stretch?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function EmberMeter({
  value,
  total,
  maxSegments = 7,
  segmentWidth = 14,
  segmentHeight = 5,
  stretch = false,
  style,
}: EmberMeterProps) {
  const { theme, palette, reduceMotion } = useTheme();

  // 段数：总数小于上限时一段一件，多了就压缩到上限
  const segments = Math.max(1, Math.min(maxSegments, total));
  const clampedValue = Math.max(0, Math.min(total, value));

  // 每一段对应多少件。总数超过上限时，一段代表不止一件
  const perSegment = total > 0 ? total / segments : 1;

  // 第 i 段是否算「点着了」：按比例四舍五入，3/5 点亮 3 段，1/3 点亮 1 段
  const isLit = (index: number) => clampedValue >= Math.round((index + 1) * perSegment) - 0.001;

  // 最后一次点亮的那段有个短暂的亮起，其余直接到位
  const lastLit = useRef<Animated.Value>(new Animated.Value(1)).current;
  const litCount = Array.from({ length: segments }, (_, i) => isLit(i)).filter(Boolean).length;

  useEffect(() => {
    if (reduceMotion || litCount === 0) {
      lastLit.setValue(1);
      return;
    }
    lastLit.setValue(0.35);
    Animated.timing(lastLit, {
      toValue: 1,
      duration: theme.motion.slow,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [litCount, lastLit, reduceMotion, theme.motion.slow]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={total > 0 ? `今天 ${value} / ${total} 件` : '今天还没有安排'}
      style={[styles.row, { gap: theme.spacing.xs }, style]}
    >
      {Array.from({ length: segments }, (_, index) => {
        const lit = isLit(index);
        const isLast = lit && index === litCount - 1;
        return (
          <Animated.View
            key={index}
            style={{
              // stretch 时每段等分剩余宽度，gap 由父容器的 gap 负责
              width: stretch ? undefined : segmentWidth,
              flex: stretch ? 1 : undefined,
              height: segmentHeight,
              borderRadius: segmentHeight / 2,
              backgroundColor: lit ? palette.primary : palette.border,
              opacity: isLast ? lastLit : 1,
            }}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    // stretch 模式要靠这一行撑满父容器
    alignSelf: 'stretch',
  },
});
