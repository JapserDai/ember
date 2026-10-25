import React from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';

/**
 * 右下角的圆形「+」。
 *
 * Microsoft To Do 的第二个标志性按钮（第一个是那个勾选圈）。
 * 它一直浮在列表右下角，不随滚动移动——所以不管列表多长，
 * 「加一件」永远在同一个位置，手指不用去找。
 *
 * ---- 为什么是圆的、为什么浮着 ----
 *
 * 圆形 + 主色填充 = 「这是这一页唯一的主动作」。方角按钮会混进
 * 卡片里，看起来像某一行的操作；浮起来则明确表示「它不属于任何一行」。
 *
 * 尺寸 56：Material 的 FAB 标准，也是 To Do 的取值。比 44 的触控下限
 * 大一圈——因为它是**唯一一个**不靠文字说明的按钮，得靠体量自己站住。
 *
 * ---- 为什么是 SVG 画的加号 ----
 *
 * 与勾选框同一个理由：文字「+」的字形粗细与垂直位置随字体变，
 * 在不同 Android 厂商的字体上会歪。两条线段永远一样。
 */

export interface AddButtonProps {
  onPress: () => void;
  /** 读屏用的描述，默认「加一件事」 */
  accessibilityLabel?: string;
  /** 底部额外留白（通常是 tab 栏高度 + 安全区） */
  bottomOffset?: number;
}

export function AddButton({
  onPress,
  accessibilityLabel = '加一件事',
  bottomOffset = 0,
}: AddButtonProps) {
  const { theme, palette, reduceMotion } = useTheme();
  const size = 56;

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        right: theme.spacing.pageX,
        bottom: bottomOffset + theme.spacing.lg,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: palette.primary,
          //
          // 按下时缩一点，和勾选框同一套按压反馈。
          //
          // 外观走查改的一处：这里原先是无条件缩放的，没有看 reduceMotion。
          // 而「减少动效」的承诺是关掉位移与缩放（docs/02 §9），
          // 这一处是整页唯一还漏着的一个缩放——它很小，但恰恰是这一页
          // 每加一件事都要碰一次的按钮。关掉之后仍然有透视度变化作为按下反馈。
          //
          transform: [{ scale: pressed && !reduceMotion ? 0.94 : 1 }],
          // FAB 是这一页唯一浮起来的东西。颜色仍从 token 取（主题规则：
          // 组件里不写死色值），只是把不透明度与半径调重一档
          shadowColor: theme.shadow.card.shadowColor,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.18,
          shadowRadius: 6,
          elevation: 6,
        })}
      >
        <Svg width={22} height={22} viewBox="0 0 22 22">
          <Path
            d="M11 4.5 L11 17.5 M4.5 11 L17.5 11"
            stroke={palette.onPrimary}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
          />
        </Svg>
      </Pressable>
    </View>
  );
}
