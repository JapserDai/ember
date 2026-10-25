import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';

/**
 * 圆形勾选框 —— 这一页的「按钮」。
 *
 * ---- 它为什么是主角 ----
 *
 * Microsoft To Do 最认得出的一件东西不是配色，是这个圈：
 * **一个灰描边的空心圆，点一下变成实心蓝 + 白勾**。
 * 它同时是三件事：
 *   1. 这一行**唯一**的可点区域（行本身不可点）——所以它够大、够醒目；
 *   2. 状态指示（空心 = 还没做，实心 = 做完了）；
 *   3. 确认（点下去有一下收缩）。
 *
 * 早先这一页把整行做成可点、圆点只是装饰。那不符合 To Do 的手感：
 * 在 To Do 里，**手指落在圈上**，不是落在文字上。这个区别很重要——
 * 落在文字上是「打开它」，落在圈上是「完成它」。
 *
 * ---- 尺寸与颜色 ----
 *
 * 20px 直径、1.5px 描边、灰 `#605E5C`（不是更淡的灰：这个圈是按钮，
 * 按钮不能看起来像不可用）。完成后填主色蓝，勾是白的。
 *
 * 为什么描边用 secondary 而不是 text：To Do 里未完成的圈是明确的
 * 「次要」层级——它要看得见，但不该比任务标题更重。而 20px 的圈配 1.5px
 * 描边在 1x 屏上不会糊，这也是 To Do 的取值。
 *
 * ---- 动效 ----
 *
 * 点中时缩到 0.86 再弹回（`motion.fast`，120ms）。这是 Fluent 的
 * 「按压反馈」，不是庆祝：它只说「你点到了」，不说「你做到了」。
 * reduce_motion 打开时完全不播。
 *
 * 勾是 SVG 画的，不是文字「✓」：文字勾的粗细与位置随字体变化，
 * 在不同 Android 厂商的字体上会歪。两个点的折线在任何设备上都一样。
 */

export interface TodoCheckboxProps {
  checked: boolean;
  /** 点一下。已勾选时通常不传（To Do 里再点一次是取消，见下面的说明） */
  onPress?: () => void;
  /** 是否禁用点击（比如已完成后不允许再点） */
  disabled?: boolean;
  /** 读屏用的完整描述，例如「交房租，已完成」 */
  accessibilityLabel: string;
  /** 尺寸，默认 20 */
  size?: number;
}

export function TodoCheckbox({
  checked,
  onPress,
  disabled = false,
  accessibilityLabel,
  size = 20,
}: TodoCheckboxProps) {
  const { theme, palette, reduceMotion } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;

  // 勾选状态变化时轻轻缩一下。用 checked 当依赖而不是 onPress：
  // 状态是数据驱动的（写库成功后重读才变），跟着它播才不会「先动后错」
  useEffect(() => {
    if (reduceMotion) {
      scale.setValue(1);
      return;
    }
    Animated.sequence([
      Animated.timing(scale, {
        toValue: 0.86,
        duration: theme.motion.fast,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(scale, {
        toValue: 1,
        duration: theme.motion.normal,
        easing: Easing.out(Easing.back(1.6)),
        useNativeDriver: true,
      }),
    ]).start();
  }, [checked, reduceMotion, scale, theme.motion.fast, theme.motion.normal]);

  const border = Math.max(1.4, Math.round(size * 0.075 * 10) / 10);
  const glyph = size * 0.62;

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={accessibilityLabel}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      /*
       * 触控区比视觉尺寸大得多（44×44）：圈是 20，但手指不是 20。
       * 用 hitSlop 而不是把容器做大——容器一大，行高就被撑开了，
       * To Do 的行是紧凑的。
       */
      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      style={({ pressed }) => ({
        // 按下时再压一点点，和动画叠加是「手指压下去」的质感
        opacity: pressed && !disabled ? 0.7 : 1,
      })}
    >
      <Animated.View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: checked ? 0 : border,
          borderColor: palette.secondary,
          backgroundColor: checked ? palette.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          transform: [{ scale }],
        }}
      >
        {checked ? (
          <Svg width={glyph} height={glyph} viewBox="0 0 12 12">
            {/*
             * 勾的形状：左下 → 底部 → 右上。
             * 三个点而不是一个圆点：圆点只表示「选中了」，
             * 勾表示「做完了」——这两件事在待办列表里不是一回事。
             *
             * strokeLinecap/Linejoin 用 round：Fluent 的勾是圆头的，
             * 方头会让它在 20px 下看起来像印刷符号。
             */}
            <Path
              d="M2.6 6.3 L4.9 8.6 L9.4 3.7"
              stroke={palette.onPrimary}
              strokeWidth={1.7}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}
