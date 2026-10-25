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

import { AwardFloat } from './AwardFloat';
import { Card } from './Card';
import { TodoCheckbox } from './TodoCheckbox';
import { useTheme } from '../theme/ThemeProvider';

/**
 * 首页的一条习惯 —— 一张白卡片。
 *
 * ---- 从「通栏行」改成「卡片」（2026-10-25）----
 *
 * 早先这里是通栏一行、上下各一条发丝线，像账本。理由是不想让五条习惯
 * 变成五张同款圆角卡片。现在改了：要求是「每一个任务都要框起来」，
 * 习惯也是任务，没有理由把它排除在外。框统一来自 `components/Card`。
 *
 * 账本和卡片的区别在语义上：通栏行读起来像一份清单上的条目，
 * 卡片读起来像「一张一张的纸」——后者更接近「这是我今天要做的事」。
 *
 * 完成状态不靠删除线（划线是行政语言，带着「这件事过去了」的评判），
 * 靠「退到灰里」：文字降对比、圈点亮着。
 * 扫一眼，还在等你的那几张自己亮着，做完的自己沉下去。
 * 待办不同：待办完成时加删除线，因为待办「做完了就是结束了」（D29）。
 *
 * 圈是「颜色 + 填充 + 勾」三通道，色盲用户也能分辨（docs/02 §9）。
 *
 * ---- 圆圈与待办那一栏保持一致（2026-10-25）----
 *
 * 首页现在照着 Microsoft To Do 的语汇走，习惯行和待办卡片用**同一个圈**：
 * 20px、1.5px 描边、灰 #605E5C，点着之后填蓝 + 白勾（见 TodoCheckbox）。
 *
 * 早先两者是分开的：习惯行是 18px 的圆点（只换颜色，没有勾），
 * 待办是 20px 的方框。分开的理由是「圆点 = 今天点着了，方框 = 待办清单」。
 * 现在不这么分了——因为**两者在这件事上是同一件事**：勾掉一件今天要做的事。
 * 用两种符号去表达同一件事，只会让人多学一套规则。
 *
 * 这一行的圆点因此换成了 TodoCheckbox 组件本身，不是另画一个。
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
  /**
   * 显示右侧的「删」按钮。
   *
   * 只在首页进入编辑态时传进来，平时是 undefined（行尾什么都不画）。
   * 为什么不用左滑删除：那要装 gesture-handler，而且左滑是隐藏手势，
   * 新用户不会发现；一个明确的「删」字反而更快，也更难误触。
   */
  onDelete?: () => void;
  /**
   * 刚记完要飘出来的字（例如「+26」）。undefined 表示不飘。
   * 与 `floatNonce` 一起用：nonce 变了才重播，连点两件时第二件也会飘。
   */
  floatText?: string;
  /** 飘字的触发器。每次记录 +1 */
  floatNonce?: number;
  style?: StyleProp<ViewStyle>;
}

export function TaskRow({
  title,
  streakDays = 0,
  done = false,
  disabled = false,
  onPress,
  onLongPress,
  onDelete,
  floatText,
  floatNonce = 0,
  style,
}: TaskRowProps) {
  const { theme, palette, reduceMotion } = useTheme();

  // 点着的那一刻，圆点先胀一下再回落——一个很小的确认，不需要弹窗
  const dot = useRef(new Animated.Value(1)).current;
  // 按下时轻轻收一下。与 dot 分开：一个是「按到了」，一个是「点着了」，
  // 共用一个值会让两个动效互相打断
  const press = useRef(new Animated.Value(1)).current;

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
    <Card style={{ marginBottom: 8 }} padding={theme.spacing.cardPadding}>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}，${statusText}`}
      accessibilityState={{ disabled, selected: done }}
      /*
       * 这里刻意**不写 disabled={disabled}**。
       *
       * disabled 在 Pressable 上会连同 onLongPress 一起禁用，而「长按撤销」
       * 恰恰只在已完成的行上才用得上——一旦真把它禁掉，撤销入口就永远点不到。
       * 所以改成：单击时自己判断，长按永远可达。
       */
      onPress={disabled ? undefined : onPress}
      onLongPress={onLongPress}
      onPressIn={
        reduceMotion
          ? undefined
          : () => {
              Animated.timing(press, {
                toValue: 0.82,
                duration: theme.motion.fast,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }).start();
            }
      }
      onPressOut={
        reduceMotion
          ? undefined
          : () => {
              Animated.timing(press, {
                toValue: 1,
                duration: theme.motion.fast,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }).start();
            }
      }
      style={({ pressed }) => [
        styles.row,
        {
          minHeight: 44,
          paddingVertical: theme.spacing.xs,
          // 已完成的行按下不变暗：它本来就已经退到灰里了，再变暗像是禁用
          opacity: pressed && !disabled ? 0.55 : 1,
        },
        style,
      ]}
    >
      {/*
       * 圆点：未完成是空心，完成是填满的余烬。
       *
       * 尺寸 18（未完成）/ 18（完成），与正文字高接近。
       * 为什么不做成两个尺寸：切换时圆点会跳一下，而这一行本来就有缩放动效，
       * 两个变化叠在一起会让「点着了」看起来像「抖了一下」。
       * 所以尺寸固定，只换「空心 → 实心」这一件事。
       *
       * 未完成的边框用 text 而不是 secondary：secondary 明显浅于正文，
       * 1.6px 的浅灰细圈在低端屏上会糊掉，
       * 那正是「看不出这里能点」的原因。
       */}
      <View style={{ marginRight: theme.spacing.md }}>
        {/*
         * 飘字挂在这一格上，不是挂在圈里：圈自己有一个缩放动画，
         * 两者叠在一起时「+26」会跟着圈一起放大，看起来像圈在吐字。
         * 这一格的位置正好是手指按下的地方，反馈落在手边。
         */}
        {floatText ? <AwardFloat text={floatText} nonce={floatNonce} /> : null}
        <Animated.View style={{ transform: [{ scale: Animated.multiply(dot, press) }] }}>
          <TodoCheckbox
            checked={done}
            onPress={onPress}
            disabled={disabled}
            accessibilityLabel={`${title}，${statusText}`}
            size={20}
          />
        </Animated.View>
      </View>

      <View style={styles.texts}>
        <Text
          /*
           *
           * 外观走查（1.5 倍字号）改的一处：2 → 3 行。
           *
           * 任务名最长 80 字，而这一行在 360dp 宽、正文 15 号字下每行约 20 字：
           * 2 行只能放下 40 字，剩下的一半原本就看不到；
           * 系统字号放到 1.5 倍后，每行只能放 13 字，2 行只剩 26 字。
           * 而这是用户自己写的任务名——它比行高、比排版整齐都重要。
           * 放到 3 行：1.0 倍时覆盖 60 字（绝大多数任务名一行就完了），
           * 1.5 倍时也有 39 字，不至于把一件习惯显示成半句话。
           *
           * 不直接去掉上限：任务名没有长度上限的渲染会让一个粘贴进来的长段落
           * 把首页整页挤满。3 行是「足够长、又不失控」的那个数。
           */
          numberOfLines={3}
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

      {/*
       * 删除按钮。
       *
       * 只有编辑态才出现（onDelete 有值）。它是这一行里的第二个可点区域，
       * 必须和「记录一次」分开：外面那层 Pressable 只负责记录，
       * 这个按钮自己吃掉点击，不会顺带记一笔。
       *
       * 文字用「删」而不是垃圾桶图标：这里没有图标库，而一个汉字在
       * 比手画的垃圾桶稳。
       */}
      {onDelete ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`删除 ${title}`}
          onPress={onDelete}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={({ pressed }) => ({
            marginLeft: theme.spacing.sm,
            minWidth: theme.touchTarget,
            minHeight: theme.touchTarget,
            alignItems: 'flex-end',
            justifyContent: 'center',
            opacity: pressed ? 0.5 : 1,
          })}
        >
          <Text
            style={{
              fontSize: theme.typography.size.label,
              lineHeight: theme.typography.lineHeight.label,
              color: palette.danger,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            删
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
    </Card>
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
