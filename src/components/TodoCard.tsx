import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { AwardFloat } from './AwardFloat';
import { Card } from './Card';
import { TodoCheckbox } from './TodoCheckbox';
import { useTheme } from '../theme/ThemeProvider';

/**
 * 一条待办 —— Microsoft To Do 的卡片行。
 *
 * ---- 与早先那版的三处不同 ----
 *
 * 1. **整行不再可点，只有左边的圈可点。**
 *    在 To Do 里，手指落在圈上是「完成它」，落在文字上是「打开它」。
 *    早先整行都可点，等于把这两件事混成一件——而这一页没有「打开」的去处，
 *    于是「点文字」也变成了完成，误触一次就记错一笔。
 *
 * 2. **白卡片压在灰底上**，不是通栏行 + 分隔线。
 *    这是 Fluent 的分组方式：卡片之间留 2px 的缝，缝里露出页面底色。
 *    通栏行是「账本」，卡片是「一张一张的纸」——To Do 是后者。
 *
 * 3. **元信息在标题下面一行**：截止日 + 备注 + 归属目标，
 *    用「·」隔开。这一行只在有内容时才画，没有就不留空行。
 *
 * ---- 完成态的视觉 ----
 *
 * 标题变灰 + 加删除线。早先这个 App 明确不用删除线（D13：划线是行政语言），
 * 但那条决定是给**习惯**定的——习惯是「今天做过了，明天还要做」，
 * 划掉它像是在说这件事结束了。待办不一样：待办就是「做完了就结束」，
 * 删除线在待办里是**准确**的，不是评判。To Do 也是这么做的。
 *
 * 这是对 D13 的一处有意的收窄，已记进决策（D29）。
 */

export interface TodoCardProps {
  title: string;
  /** 截止日的中文说法，例如「10 月 30 日」。null 表示不限期 */
  dueLabel: string | null;
  /** 截止日已过（且还没完成）。过期在 To Do 里是红字 */
  overdue?: boolean;
  /** 备注。null 表示没写 */
  notes?: string | null;
  /** 归属目标名。null 表示没挂目标 */
  goalTitle?: string | null;
  done: boolean;
  /** 点勾选框 */
  onToggle?: () => void;
  /** 长按整行：撤销 */
  onLongPress?: () => void;
  /** 编辑态下的删除。undefined 表示不显示 */
  onDelete?: () => void;
  /** 是否是最后一张卡片（决定下边距） */
  last?: boolean;
  /** 刚记完要飘出来的字。undefined 表示不飘 */
  floatText?: string;
  /** 飘字的触发器。每次记录 +1 */
  floatNonce?: number;
}

export function TodoCard({
  title,
  dueLabel,
  overdue = false,
  notes,
  goalTitle,
  done,
  onToggle,
  onLongPress,
  onDelete,
  last = false,
  floatText,
  floatNonce = 0,
}: TodoCardProps) {
  const { theme, palette } = useTheme();

  // 元信息拼成一行：有哪几段就画哪几段，一段都没有就不画这一行
  const meta = [dueLabel, notes, goalTitle].filter(
    (part): part is string => typeof part === 'string' && part.length > 0
  );

  return (
    <Card style={{ marginBottom: last ? 0 : theme.spacing.cardGap }} padding={0}>
    <Pressable
      accessibilityRole="none"
      accessibilityLabel={title}
      // 长按整行撤销：勾选框太小，长按它是「按住不放」，手感不对
      onLongPress={onLongPress}
      delayLongPress={450}
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.cardPadding,
      }}
    >
      {/*
       * 圈与标题的间距是 12：To Do 里这个距离正好让圈「贴着」标题，
       * 又不会挤。再大一点，圈就会看起来像列表项目符号而不是按钮。
       */}
      <View style={{ marginRight: theme.spacing.md, paddingTop: 1 }}>
        {floatText ? <AwardFloat text={floatText} nonce={floatNonce} /> : null}
        <TodoCheckbox
          checked={done}
          onPress={onToggle}
          disabled={done}
          accessibilityLabel={`${title}，${done ? '已完成' : '未完成'}`}
        />
      </View>

      <View style={{ flex: 1 }}>
        <Text
          /*
           *
           * 外观走查（1.5 倍字号）改的一处：2 → 3 行，理由同 TaskRow。
           * 标题是用户自己写的东西，它是这一行唯一不能让位给排版的内容。
           */
          numberOfLines={3}
          style={{
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: done ? palette.textMuted : palette.text,
            // 删除线只在完成时出现，见文件头注释
            textDecorationLine: done ? 'line-through' : 'none',
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {title}
        </Text>

        {meta.length > 0 ? (
          <Text
            /*
             *
             * 外观走查（1.5 倍字号）改的一处：1 → 2 行。
             *
             * 这一行是「截止日 · 备注 · 归属目标」拼起来的，备注可以有很长，
             * 1 行在 1.5 倍字号下只能放十来个字，往往只剩「10 月 30 日 · 买完…」。
             * 两行仍不足以盖住一个长备注，但至少能看到三类信息各自的开头。
             * 不放开成任意行：元信息是标题的附属，它比标题长就本末倒置了。
             */
            numberOfLines={2}
            style={{
              marginTop: 2,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              // 过期用危险色：To Do 里这是唯一会用红色的元信息
              color: overdue && !done ? palette.danger : palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {meta.join(' · ')}
          </Text>
        ) : null}
      </View>

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
