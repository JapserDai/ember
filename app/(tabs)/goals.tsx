import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  countOpenTasksToday,
  getGoalsData,
  type GoalView,
  type GoalsData,
} from '../../src/services/goals';
import { Card } from '../../src/components/Card';
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
 * 排版顺序是「那句话 → 为什么 → 进度」：先让你想起为什么想走这一段，
 * 再看走到哪儿了。反过来就变成 KPI 了。
 *
 * 数据全部来自 SQLite（src/services/goals.ts 装配）。每次回到这一页重读一次：
 * 在「今天」打完卡切过来，「3 / 5」必须变成「4 / 5」。
 */

export default function GoalsScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [data, setData] = useState<GoalsData | null>(null);
  const [lastGood, setLastGood] = useState<GoalsData | null>(null);
  const [hardError, setHardError] = useState(false);
  /** 已完成组是否展开。默认折叠（docs/02 §3.2） */
  const [showDone, setShowDone] = useState(false);
  /** 今天还有几件排期的事没做。只用于空状态那句邀请 */
  const [openToday, setOpenToday] = useState(0);

  /**
   * 重读这一页。
   *
   * 两个查询分开处理：`countOpenTasksToday` 只影响空状态那一句话，
   * 它自己出错时会退回 0（不抛），所以不该把整页标成「读不出来」——
   * 那时目标其实是读到了的。
   */
  const refresh = useCallback(() => {
    try {
      const next = getGoalsData(Date.now());
      setData(next);
      setLastGood(next);
      setHardError(false);
    } catch (err) {
      console.warn('[Ember] 读取目标失败', err);
      setHardError(true);
      // 有上一份好数据就留着，不把已经看到的内容抽走
      return;
    }

    setOpenToday(countOpenTasksToday(Date.now()));
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const view = data ?? lastGood;
  const active = view?.active ?? [];
  const done = view?.done ?? [];
  const isEmpty = view !== null && active.length === 0 && done.length === 0;

  const goNewGoal = () => router.push('/goals/new');

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
        <View style={styles.titleRow}>
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

          {/*
           * 有目标之后，新建入口贴在标题右侧，不再占一整块版面。
           * 条件用「进行中或已完成有任意一个」，不是只看进行中——
           * 全部收起来之后如果入口消失，用户就没有地方写下一个目标了。
           */}
          {active.length > 0 || done.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="写一个新目标"
              onPress={goNewGoal}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={({ pressed }) => ({
                minHeight: theme.touchTarget,
                justifyContent: 'center',
                opacity: pressed ? 0.55 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                写一个
              </Text>
            </Pressable>
          ) : null}
        </View>

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

        {hardError ? (
          <View style={{ marginTop: theme.spacing.md }}>
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {view ? '刚才没读到新数据，显示的是上一次的。' : '目标暂时读不出来。'}
            </Text>
            {!view ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="再试一次"
                onPress={refresh}
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
                    color: palette.primary,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  再试一次
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {isEmpty ? (
        <View
          style={{
            marginTop: theme.spacing.xxl,
            paddingHorizontal: theme.spacing.pageX,
          }}
        >
          {/*
           * 空状态不是一句「还没有目标」就完了。
           * 目标这件事对多数人是抽象的，先给一句具体的话当例子，
           * 再说明「写一句就够」——比一个空白的输入框更容易开始。
           */}
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {openToday > 0
              ? '还没有目标。可以先在「今天」记几天，看看自己真正在意哪件事，再回来写一句。'
              : '还没有目标。一句话就够——比如「把睡眠找回来」。'}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="写一个新目标"
            onPress={goNewGoal}
            style={({ pressed }) => ({
              marginTop: theme.spacing.lg,
              minHeight: 52,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: theme.radius.button,
              backgroundColor: palette.primary,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Text
              style={{
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                fontWeight: theme.typography.weight.medium,
                color: palette.onPrimary,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              写一句
            </Text>
          </Pressable>
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
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            进行中
          </Text>
          <View style={{ paddingHorizontal: theme.spacing.pageX }}>
            {active.map((goal) => (
              <GoalRow key={goal.id} goal={goal} onPress={() => router.push(`/goals/${goal.id}`)} />
            ))}
          </View>
        </View>
      ) : null}

      {/* 已完成。折叠成一行，点开才展开 */}
      {done.length > 0 ? (
        <View
          style={{
            marginTop: theme.spacing.xl,
            paddingHorizontal: theme.spacing.pageX,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: showDone }}
            accessibilityLabel={`已完成 ${done.length} 个${showDone ? '，点一下收起' : '，点一下展开'}`}
            onPress={() => setShowDone((prev) => !prev)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: theme.touchTarget,
              opacity: pressed ? 0.55 : 1,
            })}
          >
            <Text
              style={{
                fontSize: theme.typography.size.label,
                lineHeight: theme.typography.lineHeight.label,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              已完成 {done.length}
            </Text>
            {/* 不用箭头图标：一个「展开 / 收起」的字更直接，也不用为它引图标库 */}
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {showDone ? '收起' : '展开'}
            </Text>
          </Pressable>

          {showDone ? (
            <View>
              {done.map((goal) => (
                <GoalRow key={goal.id} goal={goal} onPress={() => router.push(`/goals/${goal.id}`)} />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

/**
 * 一个目标。
 *
 * 关联的事都做完了但还没被标记完成时，多一行询问。
 * **系统不自动关掉它**：完成是一件由人决定的事（docs/02 §3.2）。
 */
function GoalRow({ goal, onPress }: { goal: GoalView; onPress: () => void }) {
  const { theme, palette } = useTheme();
  const isDone = goal.status === 'done';

  return (
    <Card style={{ marginBottom: theme.spacing.cardGap }} padding={0}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${goal.title}，${
          isDone ? '已完成' : goal.progressLabel ?? '还没挂任务'
        }`}
        onPress={onPress}
        style={({ pressed }) => ({
          paddingVertical: theme.spacing.lg,
          paddingHorizontal: theme.spacing.cardPadding,
          opacity: pressed ? 0.55 : 1,
        })}
      >
        <Text
          style={{
            fontSize: theme.typography.size.heading,
            lineHeight: theme.typography.lineHeight.heading,
            fontWeight: theme.typography.weight.medium,
            color: isDone ? palette.textMuted : palette.text,
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

        {goal.progressLabel || goal.dueLabel ? (
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
              {goal.progressLabel ?? ''}
            </Text>
            {goal.dueLabel ? (
              <Text
                style={{
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {goal.dueLabel}
              </Text>
            ) : null}
          </View>
        ) : null}

        {goal.allDone ? (
          <Text
            style={{
              marginTop: theme.spacing.sm,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            关联的事都做完了。这个目标算完成了吗？
          </Text>
        ) : null}
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
