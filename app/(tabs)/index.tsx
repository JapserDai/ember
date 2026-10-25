import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmberMeter } from '../../src/components/EmberMeter';
import { TaskRow } from '../../src/components/TaskRow';
import { getSettings } from '../../src/db/repo/settings';
import {
  businessDate,
  DEFAULT_DAY_START_HOUR,
  formatDateLabel,
  greetingForHour,
  hourOf,
} from '../../src/domain/date';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 首页「今天」。
 *
 * 结构是账本，不是卡片墙：
 *   日期 + 问候 → 炭排 → 今天（通栏行）→ 待办 → 今天还可以
 *
 * 通栏的行、极淡的分隔线、没有阴影也没有圆角容器。
 * 全屏只有一个东西带颜色，就是那排点着的炭；其余全部安静。
 *
 * 阶段 1 只渲染假数据，把布局、组件接口和状态流先定下来。
 * 数据来源：下面 TODO(db) 标出的位置，等 db 层与 domain/score 接好后替换。
 */

/** 首页用的任务视图模型。字段与 tasks 表对齐，但只取界面需要的部分 */
export interface TodayTaskView {
  id: string;
  title: string;
  /** 连胜天数。0 表示还没有连胜 */
  streakDays: number;
  /** 今天是否已经记过 */
  done: boolean;
}

/** 首页用的待办视图模型 */
export interface TodayTodoView {
  id: string;
  title: string;
  /** 是否已勾选。v0.1 勾选即完成 */
  done: boolean;
}

/** 首页需要的全部数据。接数据库时由 repo 组装成这个形状 */
export interface TodayData {
  /** 玩家等级。首页顶部显示「Lv.12」 */
  level: number;
  /** 玩家名 */
  playerName: string;
  /** 今日习惯 */
  habits: TodayTaskView[];
  /** 今日待办，最多 3 条 */
  todos: TodayTodoView[];
  /** 底部微行动推荐 */
  microAction: string;
}

/**
 * 阶段 1 的示例数据。
 * 刻意用真实感的内容，方便判断排版；接库后整块删除。
 */
const SAMPLE_DATA: TodayData = {
  level: 12,
  playerName: '旅人',
  habits: [
    { id: 'h1', title: '喝一杯水', streakDays: 3, done: true },
    { id: 'h2', title: '走十分钟', streakDays: 0, done: false },
    { id: 'h3', title: '读两页书', streakDays: 7, done: false },
  ],
  todos: [
    { id: 't1', title: '把洗衣机里的衣服晾起来', done: false },
    { id: 't2', title: '回复那封放了两天的消息', done: false },
  ],
  microAction: '把桌面上的一样东西放回它该在的位置。',
};

/**
 * 读日界。业务日的边界必须来自 settings，不能写死常量——
 * 否则设置页显示的「凌晨 4 点」和首页实际用的边界可能不是同一个值。
 * 读失败时退回默认值，首页照常渲染。
 */
function loadDayStartHour(): number {
  try {
    return getSettings().day_start_hour;
  } catch {
    return DEFAULT_DAY_START_HOUR;
  }
}

export default function TodayScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();

  // 日界只在挂载时读一次，不在每次渲染时查库
  const [dayStartHour] = useState<number>(loadDayStartHour);

  // 当前业务日与问候语
  const now = Date.now();
  const today = businessDate(now, dayStartHour);
  const dateLabel = formatDateLabel(today);
  const greeting = greetingForHour(hourOf(now));

  // TODO(db): 换成 getTodayData()：
  //   - tasksRepo.listForDate(today) 取今日习惯与待办
  //   - checkinsRepo.listByDate(today) 判断 done
  //   - streakRepo 取每个习惯的连胜
  //   - playerRepo.getPlayer() 取等级与名字
  const data = SAMPLE_DATA;

  const [habits, setHabits] = useState<TodayTaskView[]>(data.habits);
  const [todos, setTodos] = useState<TodayTodoView[]>(data.todos);

  const doneCount = useMemo(
    () => habits.filter((h) => h.done).length + todos.filter((t) => t.done).length,
    [habits, todos],
  );
  const totalCount = habits.length + todos.length;

  const allDone = totalCount > 0 && doneCount >= totalCount;

  // 全部完成时把问候换成一句收尾：不庆祝、不催促，只是告诉你今天到这儿了。
  const headline = allDone ? '今天到这儿了。' : `${greeting}。`;

  /**
   * 记录一次习惯。
   * TODO(db): 改成调用 domain/score.computeScore + checkinsRepo.create，
   *           再刷新本页数据。这里只做乐观更新，证明交互链路是通的。
   */
  const handleHabitPress = (id: string) => {
    setHabits((prev) =>
      prev.map((h) =>
        h.id === id && !h.done ? { ...h, done: true, streakDays: h.streakDays + 1 } : h,
      ),
    );
  };

  /** 勾选待办。TODO(db): tasksRepo.completeTodo(id) */
  const handleTodoPress = (id: string) => {
    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)));
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xxl,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* 顶部：日期、问候、等级。日期小、字距拉开；问候大、左对齐 */}
      <View style={{ paddingHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            letterSpacing: 1.5,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {dateLabel}
        </Text>
        <Text
          style={{
            marginTop: theme.spacing.sm,
            fontSize: theme.typography.size.title,
            lineHeight: theme.typography.lineHeight.title,
            fontWeight: theme.typography.weight.semibold,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.title,
          }}
        >
          {headline}
        </Text>
      </View>

      {/*
       * 今日进度：一整排炭，撑满页面宽度。
       *
       * 这是全屏唯一「有颜色」的地方，没有它首页会塌成一张平铺的清单。
       * 它既是品牌（余烬），也是功能（今天做了几件）。
       */}
      <View
        style={{
          marginTop: theme.spacing.xl,
          paddingHorizontal: theme.spacing.pageX,
        }}
      >
        <EmberMeter
          value={doneCount}
          total={totalCount}
          segmentHeight={6}
          maxSegments={Math.max(3, totalCount)}
          stretch
        />
        <View style={styles.progressCaption}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {totalCount > 0 ? `今天 ${doneCount} / ${totalCount} 件` : '今天还没有安排'}
          </Text>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
              fontVariant: ['tabular-nums'],
            }}
          >
            Lv.{data.level}
          </Text>
        </View>
      </View>

      {/* 今天：标题 + 通栏的习惯行 */}
      <View style={{ marginTop: theme.spacing.xl }}>
        <View style={[styles.sectionHeader, { paddingHorizontal: theme.spacing.pageX }]}>
          <Text
            style={{
              fontSize: theme.typography.size.label,
              lineHeight: theme.typography.lineHeight.label,
              letterSpacing: 1,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            今天
          </Text>
          {/* 计数已经在顶部那排下面了，这里不再重复 */}
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {habits.length > 0 ? `${habits.length} 件` : ''}
          </Text>
        </View>

        {habits.length === 0 ? (
          <View style={{ paddingHorizontal: theme.spacing.pageX }}>
            <EmptyHint text="今天空着。要不要放一件小事进来？" />
          </View>
        ) : (
          <View
            style={{
              paddingHorizontal: theme.spacing.pageX,
              // 区块结束用重一档的线；行与行之间用更淡的 border
              borderBottomWidth: 1,
              borderBottomColor: palette.rule,
            }}
          >
            {habits.map((habit, index) => (
              <TaskRow
                key={habit.id}
                title={habit.title}
                streakDays={habit.streakDays}
                done={habit.done}
                disabled={habit.done}
                divider={index > 0}
                onPress={() => handleHabitPress(habit.id)}
                onLongPress={() => {
                  // TODO: 部分完成 / 跳过菜单（阶段 2）
                }}
              />
            ))}
          </View>
        )}
      </View>

      {/* 待办：最多 3 条 */}
      {todos.length > 0 ? (
        <View
          style={{
            marginTop: theme.spacing.xl,
            paddingHorizontal: theme.spacing.pageX,
          }}
        >
          <Text
            style={{
              marginBottom: theme.spacing.xs,
              fontSize: theme.typography.size.label,
              lineHeight: theme.typography.lineHeight.label,
              letterSpacing: 1,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            待办
          </Text>
          {todos.slice(0, 3).map((todo, index) => (
            <TodoRow
              key={todo.id}
              title={todo.title}
              done={todo.done}
              divider={index > 0}
              onPress={() => handleTodoPress(todo.id)}
            />
          ))}
        </View>
      ) : null}

      {/* 今天还可以：一条 1 分钟微行动。不加边框，用一条稍重的线把它隔开 */}
      <View
        style={{
          marginTop: theme.spacing.xxl,
          paddingHorizontal: theme.spacing.pageX,
          paddingTop: theme.spacing.lg,
          borderTopWidth: 1,
          borderTopColor: palette.rule,
        }}
      >
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            letterSpacing: 1,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          今天还可以
        </Text>
        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {data.microAction}
        </Text>
      </View>
    </ScrollView>
  );
}

/**
 * 一条待办。
 *
 * 方框勾选，跟习惯行的圆点区分开：圆点是「这件事今天点了就点了」，
 * 方框是「这件事做完就收起来了」。
 */
function TodoRow({
  title,
  done,
  divider,
  onPress,
}: {
  title: string;
  done: boolean;
  divider: boolean;
  onPress: () => void;
}) {
  const { theme, palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: 52,
        paddingVertical: theme.spacing.sm,
        opacity: pressed ? 0.55 : 1,
        borderTopWidth: divider ? 1 : 0,
        borderTopColor: palette.border,
      })}
    >
      <View
        style={{
          width: 16,
          height: 16,
          borderRadius: 3,
          borderWidth: done ? 0 : 1.5,
          borderColor: palette.secondary,
          backgroundColor: done ? palette.primary : 'transparent',
          marginRight: theme.spacing.md,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {done ? (
          <Text
            style={{
              fontSize: 11,
              lineHeight: 13,
              color: palette.onPrimary,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            ✓
          </Text>
        ) : null}
      </View>
      <Text
        numberOfLines={2}
        style={{
          flex: 1,
          fontSize: theme.typography.size.body,
          lineHeight: theme.typography.lineHeight.body,
          color: done ? palette.textMuted : palette.text,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}

/** 空状态提示。文案来自 docs/02 §9 的空状态表 */
function EmptyHint({ text }: { text: string }) {
  const { theme, palette } = useTheme();
  return (
    <Text
      style={{
        paddingVertical: theme.spacing.lg,
        fontSize: theme.typography.size.body,
        lineHeight: theme.typography.lineHeight.body,
        color: palette.textMuted,
        fontFamily: theme.typography.fontFamily.body,
      }}
    >
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
});
