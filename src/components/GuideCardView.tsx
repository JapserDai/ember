import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from './Card';
import type { GuideCard } from '../domain/guide';
import { useTheme } from '../theme/ThemeProvider';

/**
 * 一张引导卡（D1–D7）。
 *
 * ---- 它刻意不像一个「浮层」 ----
 *
 * 没有遮罩、没有居中、没有阴影更重的对话框。它就是页面里的一张普通卡片，
 * 跟旁边的习惯卡、待办卡长得一样，只是内容在说「这里还能怎么用」。
 *
 * 为什么不浮层：浮层的意思是「先处理我」。而这个 App 的立场是
 * 「你打开它是为了记一件事，不是为了看说明」——卡片排在内容下面，
 * 用户可以完全不看它直接往下滚。
 *
 * ---- 为什么有一个「知道了」 ----
 *
 * 没有关闭动作的卡片会永远留在那儿，用户会开始怀疑它是不是坏了。
 * 「知道了」只做一件事：今天不再显示这一张（不写库，见 domain/guide.ts）。
 *
 * ---- 主按钮为什么可以没有 ----
 *
 * D1 / D4 / D6 那三张只是说一句话，没有一个「去做点什么」的自然动作。
 * 给它们硬塞一个按钮（「去看看」）会让用户点进一个跟这句话无关的页面。
 * 所以 `action` 为 null 时只画「知道了」。
 */
export interface GuideCardViewProps {
  card: GuideCard;
  /** 点主按钮。action 为 null 时不会调用 */
  onAction: () => void;
  /** 点「知道了」。调用方负责把它从界面上移除 */
  onDismiss: () => void;
}

export function GuideCardView({ card, onAction, onDismiss }: GuideCardViewProps) {
  const { theme, palette } = useTheme();

  return (
    <Card
      style={{ marginTop: theme.spacing.cardGap }}
      accessibilityLabel={`第 ${card.day} 天：${card.title}`}
      accessibilityRole="summary"
    >
      {/*
       * 一个小标签，说明这是第几天。
       *
       * 用「第 3 天」而不是「提示」「小贴士」：后者是一个通用词，
       * 而「第几天」是这个 App 里真实存在的东西（火是按天往前走的），
       * 读起来是同一套语言。
       */}
      <Text
        style={{
          fontSize: theme.typography.size.caption,
          lineHeight: theme.typography.lineHeight.caption,
          fontWeight: theme.typography.weight.semibold,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
          fontVariant: ['tabular-nums'],
        }}
      >
        第 {card.day} 天
      </Text>

      <Text
        style={{
          marginTop: theme.spacing.xs,
          fontSize: theme.typography.size.body,
          lineHeight: theme.typography.lineHeight.body,
          fontWeight: theme.typography.weight.medium,
          color: palette.text,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {card.title}
      </Text>

      <Text
        style={{
          marginTop: theme.spacing.xs,
          fontSize: theme.typography.size.caption,
          lineHeight: theme.typography.lineHeight.body,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {card.body}
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: theme.spacing.sm }}>
        {card.action && card.actionLabel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={card.actionLabel}
            onPress={onAction}
            style={({ pressed }) => ({
              minHeight: theme.touchTarget,
              justifyContent: 'center',
              paddingRight: theme.spacing.lg,
              opacity: pressed ? 0.55 : 1,
            })}
          >
            <Text
              style={{
                fontSize: theme.typography.size.label,
                lineHeight: theme.typography.lineHeight.label,
                fontWeight: theme.typography.weight.medium,
                color: palette.primary,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {card.actionLabel}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="知道了"
          onPress={onDismiss}
          style={({ pressed }) => ({
            minHeight: theme.touchTarget,
            justifyContent: 'center',
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <Text
            style={{
              fontSize: theme.typography.size.label,
              lineHeight: theme.typography.lineHeight.label,
              color: card.action ? palette.textMuted : palette.primary,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            知道了
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}
