import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Text } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/**
 * 记录完成时，从那一行飘起来的「+26」。
 *
 * ---- 为什么要有它 ----
 *
 * 点一下之后，界面上原来的变化只有两处：圈变色、下面进度那一格的数字变一下。
 * 两处都发生在**手指离开之后要去找的地方**——用户点的是这一行，
 * 而反馈出现在别处。飘字把反馈放回**手按下的那个位置**，眼睛不用重新找。
 *
 * ---- 为什么它是 D14 允许的那个动效 ----
 *
 * D14 说全 App 只保留一个编排过的动效：记录完成时的亮起。
 * 这个飘字、火带推进、圈的收缩，都是**同一个时刻的同一件事**，
 * 不是一个新增的动画。它不循环、不在入场时播、不自己动。
 *
 * ---- 为什么是 700ms、向上 14px、淡出 ----
 *
 * 再短看不清，再长会挡住下一次点击的判断（人连着记三件时每件的间隔约 1 秒）。
 * 14px 是「离开原位但不跑远」的距离；超过行高一半，它就会飘到上一行去。
 * 只淡出、不缩放：缩放会让一个字看起来像在长大，那是「庆祝」的语言。
 *
 * reduce_motion 打开时**完全不画**，不是画一个不动的：
 * 一个悬在那里不消失的数字比没有更让人困惑。
 */

export interface AwardFloatProps {
  /** 要显示的文字，例如「+26」 */
  text: string;
  /**
   * 每一次记录换一个值。
   *
   * 用它而不是布尔：连着记两件时第二件的 key 变了，动画才会重新播。
   * 用布尔的话，第二件不会重播（组件没变化，useEffect 不触发）。
   */
  nonce: number;
  /** 水平位置。默认贴在这一行左侧圈的位置 */
  left?: number;
}

const RISE = 14;
const DURATION = 700;

export function AwardFloat({ text, nonce, left = 2 }: AwardFloatProps) {
  const { theme, palette, reduceMotion } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion) return;
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: DURATION,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [nonce, reduceMotion, anim]);

  if (reduceMotion) return null;

  return (
    <Animated.Text
      accessibilityElementsHidden
      pointerEvents="none"
      style={{
        position: 'absolute',
        left,
        top: -2,
        opacity: anim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
        transform: [
          {
            translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, -RISE] }),
          },
        ],
        fontSize: theme.typography.size.caption,
        lineHeight: theme.typography.lineHeight.caption,
        fontWeight: theme.typography.weight.semibold,
        color: palette.primary,
        fontFamily: theme.typography.fontFamily.body,
      }}
    >
      {text}
    </Animated.Text>
  );
}
