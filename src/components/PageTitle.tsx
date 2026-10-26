import React from 'react';
import { Text, View } from 'react-native';

import { NatureMark } from './NatureMark';
import { useTheme } from '../theme/ThemeProvider';
import type { NatureMarkKey } from '../domain/natureMarks';

/**
 * 页面标题 + 一个自然图案（D59）。
 *
 * ---- 为什么抽成一个组件 ----
 *
 * 八个页面的标题长得一模一样（title 字号 + semibold + text 色），
 * 差别只有两处：**写什么字**，以及**旁边那个图形是什么**。
 * 把这八处各写一遍，意味着以后调标题字号要改八处——而这件事已经发生过
 * （D48 把五维从「我的」搬到「状态」时，两个页的标题各改了一次）。
 *
 * ---- 版式 ----
 *
 * ```
 * ┌────────────────────────────────┐
 * │ 状态                     🌱   │  ← 标题与图形同一条基线，图形贴右
 * │ 这些是读数，不是评价。          │  ← 副标题（可选）
 * └────────────────────────────────┘
 * ```
 *
 * 图形**贴右**而不是贴左：贴左时它会插在「读标题的第一眼」与标题之间，
 * 把标题推后半个字；贴右时标题仍然是最先读到的东西，图形是行尾的署名。
 *
 * 图形与标题**底部对齐**（`alignItems: 'flex-end'`）而不是居中：
 * 标题是 24px 的字、图形是 26px 的图，居中会让图形的视觉重心偏高。
 *
 * ---- 图形不是每一页都必须有 ----
 *
 * `mark` 可选。没有合适的语义时不传，而不是硬配一个——「为了每页都有图案
 * 而配一个不相干的图案」比没有更糟。
 */
export interface PageTitleProps {
  /** 标题文字 */
  title: string;
  /** 副标题。可选 */
  subtitle?: string;
  /** 标题右侧的自然图案。可选；没有合适的语义就不传 */
  mark?: NatureMarkKey | 'rainbow';
  /** 图形的边长。默认 26（与副标题行高同高，不抢标题） */
  markSize?: number;
}

export function PageTitle({ title, subtitle, mark, markSize = 26 }: PageTitleProps) {
  const { theme, palette } = useTheme();

  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}>
        <Text
          style={{
            flexShrink: 1,
            fontSize: theme.typography.size.title,
            lineHeight: theme.typography.lineHeight.title,
            fontWeight: theme.typography.weight.semibold,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.title,
          }}
        >
          {title}
        </Text>
        {mark ? <NatureMark mark={mark} size={markSize} /> : null}
      </View>

      {subtitle ? (
        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}
