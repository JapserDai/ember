import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 目标页。
 *
 * 一个目标 = 一句话 + 一句为什么（可选）+ 一个截止日（可选）+ 若干关联任务。
 * 进度是「关联任务完成了几个 / 一共几个」，现算，不存字段。
 *
 * 没有子目标、没有阶段、没有百分比。
 * 百分比会让人盯着 37% 焦虑；「3 / 5 件」是能数清的事实。
 *
 * 阶段 1 只渲染示例数据。goals 表和仓储层已经写好了（src/db/repo/goals.ts），
 * 接界面时把 SAMPLE_GOALS 换成 goalsRepo.listGoalsWithProgress() 即可。
 */

/** 目标卡片要展示的数据 */
interface GoalView {
  id: string;
  title: string;
  /** 为什么想走这一段。空字符串表示没写 */
  why: string;
  /** 截止日，空表示不限期 */
  dueDate?: string;
  /** 关联任务已完成数 */
  done: number;
  /** 关联任务总数。0 表示还没挂任务 */
  total: number;
}

/** 阶段 1 的示例数据。接库后整块删除 */
const SAMPLE_GOALS: GoalView[] = [
  {
    id: 'g1',
    title: '把睡眠找回来',
    why: '早上醒不来这件事，已经在影响我白天所有的判断了。',
    dueDate: '12 月 31 日',
    done: 2,
    total: 5,
  },
  {
    id: 'g2',
    title: '让桌面能呼吸',
    why: '想有一个坐下来就能开始做事的地方。',
    done: 0,
    total: 3,
  },
  {
    id: 'g3',
    title: '重新联系三个人',
    why: '',
    done: 3,
    total: 3,
  },
];

export default function GoalsScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();

  const [goals] = useState<GoalView[]>(SAMPLE_GOALS);

  const active = goals.filter((g) => !(g.total > 0 && g.done >= g.total));
  const finished = goals.filter((g) => g.total > 0 && g.done >= g.total);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xxl,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.title,
            lineHeight: theme.typography.lineHeight.title,
            fontWeight: theme.typography.weight.semibold,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.title,
          }}
        >
          目标
        </Text>
        <Text
          style={{
            marginTop: theme.spacing.sm,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          走得久一点的事，写在这里。
        </Text>
      </View>

      {active.length === 0 && finished.length === 0 ? (
        <View
          style={{
            marginTop: theme.spacing.xxl,
            paddingHorizontal: theme.spacing.pageX,
          }}
        >
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            还没有目标。可以先在「今天」记几天，看看自己真正在意哪件事，再回来写一句。
          </Text>
        </View>
      ) : null}

      {/* 进行中 */}
      {active.length > 0 ? (
        <View style={{ marginTop: theme.spacing.xl }}>
          <Text
            style={{
              paddingHorizontal: theme.spacing.pageX,
              marginBottom: theme.spacing.xs,
              fontSize: theme.typography.size.label,
              lineHeight: theme.typography.lineHeight.label,
              letterSpacing: 1,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            进行中
          </Text>
          <View
            style={{
              paddingHorizontal: theme.spacing.pageX,
              borderBottomWidth: 1,
              borderBottomColor: palette.rule,
            }}
          >
            {active.map((goal, index) => (
              <GoalRow key={goal.id} goal={goal} divider={index > 0} />
            ))}
          </View>
        </View>
      ) : null}

      {/* 已完成。折叠成一行，不占版面 */}
      {finished.length > 0 ? (
        <View
          style={{
            marginTop: theme.spacing.xl,
            paddingHorizontal: theme.spacing.pageX,
          }}
        >
          <Text
            style={{
              fontSize: theme.typography.size.label,
              lineHeight: theme.typography.lineHeight.label,
              letterSpacing: 1,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            已完成 {finished.length}
          </Text>
          {finished.map((goal) => (
            <Text
              key={goal.id}
              style={{
                marginTop: theme.spacing.sm,
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {goal.title}
            </Text>
          ))}
        </View>
      ) : null}

      {/* 新建入口。阶段 1 是占位，阶段 3 接表单 */}
      <View
        style={{
          marginTop: theme.spacing.xxl,
          paddingHorizontal: theme.spacing.pageX,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="新建目标"
          style={({ pressed }) => ({
            paddingVertical: theme.spacing.md,
            borderTopWidth: 1,
            borderTopColor: palette.border,
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.primary,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            写一个新目标
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/**
 * 一个目标。
 *
 * 排版顺序刻意是「那句话 → 为什么 → 进度」：
 * 先让你想起为什么想走这一段，再告诉你走到哪儿了。
 * 反过来（先看进度）就变成 KPI 了。
 */
function GoalRow({ goal, divider }: { goal: GoalView; divider: boolean }) {
  const { theme, palette } = useTheme();
  const allDone = goal.total > 0 && goal.done >= goal.total;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${goal.title}，${goal.total > 0 ? `${goal.done} / ${goal.total} 件` : '还没挂任务'}`}
      style={({ pressed }) => ({
        paddingVertical: theme.spacing.lg,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: palette.border,
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <Text
        style={{
          fontSize: theme.typography.size.heading,
          lineHeight: theme.typography.lineHeight.heading,
          fontWeight: theme.typography.weight.medium,
          color: allDone ? palette.textMuted : palette.text,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {goal.title}
      </Text>

      {goal.why ? (
        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {goal.why}
        </Text>
      ) : null}

      <View style={[styles.meta, { marginTop: theme.spacing.sm }]}>
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
            fontVariant: ['tabular-nums'],
          }}
        >
          {goal.total > 0 ? `${goal.done} / ${goal.total} 件` : '还没挂任务'}
        </Text>
        {goal.dueDate ? (
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {goal.dueDate}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
