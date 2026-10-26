import React from 'react';
import { Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeProvider';

/**
 * 一条待办 —— To Do 的卡片内容（D55 之后只剩「文字」）。
 *
 * ---- 这一版去掉了什么，为什么 ----
 *
 * 要求是把待办削到只剩「添加、删除」。所以这张卡上不再有：
 *
 *   - **勾选圈**：待办不再有「完成」这个状态。它从「任务」变成了**便签**——
 *     一句「记得做这件事」，做完就去删掉它。
 *   - **长按撤销**：没有打卡，就没有可撤销的东西。
 *   - **行内的「删」**：删除挪到「左滑露出」（D65 从右滑改过来，见 `SwipeToDelete`）。
 *     卡片上一直是干净的，只在手指主动推开它时才亮出红色。
 *
 * 代价要认下来：**待办从这一版起不再产生 XP / 余烬 / 属性点**。
 * `score.ts` 里 `type === 'todo'` 的那条分支留着但没人走，
 * 首页的火带与「今天 N / M 件」也只剩习惯在数。
 *
 * 为什么不做成「勾选但不计分」：那等于把勾选留着换个说法，
 * 而勾选的存在本身会让用户以为「这一项也算在今天的进度里」。
 *
 * ---- 与习惯行的区别 ----
 *
 * 习惯行（`TaskRow`）仍然可点、仍然打卡、仍然计分——那是这个 App 的核心闭环。
 * 待办与习惯靠**元信息行**区分：待办多一行「截止日 · 备注 · 归属目标」。
 */
export interface TodoCardProps {
  title: string;
  /** 截止日的中文说法，例如「10 月 30 日」。null 表示不限期 */
  dueLabel: string | null;
  /** 截止日已过。过期在 To Do 里是红字 */
  overdue?: boolean;
  /** 备注。null 表示没写 */
  notes?: string | null;
  /** 归属目标名。null 表示没挂目标 */
  goalTitle?: string | null;
}

export function TodoCard({ title, dueLabel, overdue = false, notes, goalTitle }: TodoCardProps) {
  const { theme, palette } = useTheme();

  // 元信息拼成一行：有哪几段就画哪几段，一段都没有就不画这一行
  const meta = [dueLabel, notes, goalTitle].filter(
    (part): part is string => typeof part === 'string' && part.length > 0
  );

  return (
    <View
      style={{
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.cardPadding,
      }}
    >
      <Text
        /*
         * 3 行。理由同 TaskRow：任务名是用户自己写的东西，
         * 它是这一行唯一不能让位给排版的内容。
         */
        numberOfLines={3}
        style={{
          fontSize: theme.typography.size.body,
          lineHeight: theme.typography.lineHeight.body,
          color: palette.text,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {title}
      </Text>

      {meta.length > 0 ? (
        <Text
          numberOfLines={2}
          style={{
            marginTop: 2,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            // 过期用危险色：To Do 里这是唯一会用红色的元信息。
            // 只在**还有「完成」这个概念的时候**成立——现在没有完成态了，
            // 所以这里只剩「这个日子已经过去了」这一条事实，不含催促
            color: overdue ? palette.danger : palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {meta.join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}
