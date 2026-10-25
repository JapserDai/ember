import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from './Card';
import type { TaskTemplate } from '../domain/task-templates';
import { useTheme } from '../theme/ThemeProvider';

/**
 * 首页空状态下的快捷开始。
 *
 * 一个任务都没有的时候，「今天空着」这句话本身没有出路——
 * 用户得先知道下一步点哪儿。这里给三个能直接落地的模板，
 * 一次点击就建好、立刻可以打卡（docs/02 §8）。
 *
 * 为什么不做成「跳到新建页再填」：新用户的第一件事应该是完成一次记录，
 * 而不是配置一个任务。想自己写的走最后那一行。
 *
 * ---- 两个框，不是四个 ----
 *
 * 三个模板**合成一张卡**：它们是同一件事的三个选项，彼此之间只有一行之隔，
 * 拆成三张卡会让空状态看起来像已经有三个任务了。最后那一行是另一件事
 * （不是选一个模板，而是自己写），所以单独一张卡。
 */
export interface QuickStartProps {
  templates: readonly TaskTemplate[];
  /** 点某个模板：直接建这个任务 */
  onPick: (template: TaskTemplate) => void;
  /** 点「自己写一件」：去新建页 */
  onCreateOwn: () => void;
}

export function QuickStart({ templates, onPick, onCreateOwn }: QuickStartProps) {
  const { theme, palette } = useTheme();

  return (
    <View>
      <Card padding={0}>
        {templates.map((template, index) => (
          <Pressable
            key={template.key}
            accessibilityRole="button"
            accessibilityLabel={`添加：${template.title}`}
            onPress={() => onPick(template)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: 52,
              paddingVertical: theme.spacing.sm,
              paddingHorizontal: theme.spacing.cardPadding,
              // 同一条卡里的三行靠一条发丝线分开——它们不是三张纸，是一张纸上的三行
              borderTopWidth: index > 0 ? 1 : 0,
              borderTopColor: palette.border,
              opacity: pressed ? 0.55 : 1,
            })}
          >
            {/* 一个细细的加号，和待办的方框、习惯的圆点都不冲突 */}
            <Text
              //
              // 外观走查（1.5 倍字号）改的一处：这个「＋」是**图标**，不是正文，
              // 所以不跟着系统字号缩放（allowFontScaling={false}）。
              // 早先它会缩：格子固定 16 宽，而「＋」是 15 号字，
              // 系统放到 1.5 倍时一个全角字符就比格子宽，左右各被裁掉一截。
              // 图标本来就不该缩——它后面跟的标题会缩，那才是真正需要放大读的字。
              //
              allowFontScaling={false}
              style={{
                width: 16,
                marginRight: theme.spacing.md,
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              ＋
            </Text>
            <Text
              style={{
                flex: 1,
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {template.title}
            </Text>
          </Pressable>
        ))}
      </Card>

      {/*
       * 「自己写一件」用主色：它和上面三个模板不是同一类选项——
       * 上面是「挑一个现成的」，这个是「从零写一个」，是这一屏真正的出口。
       */}
      <Card style={{ marginTop: theme.spacing.cardGap }} padding={0}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="自己写一件"
          onPress={onCreateOwn}
          style={({ pressed }) => ({
            minHeight: 52,
            justifyContent: 'center',
            paddingHorizontal: theme.spacing.cardPadding,
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              fontWeight: theme.typography.weight.medium,
              color: palette.primary,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            自己写一件
          </Text>
        </Pressable>
      </Card>
    </View>
  );
}
