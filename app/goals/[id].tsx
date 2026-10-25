import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { DueDateField } from '../../src/components/DueDateField';
import { businessDate } from '../../src/domain/date';
import {
  deleteGoalById,
  editGoal,
  getGoalView,
  linkTask,
  listAttachableTasks,
  setGoalDone,
  type AttachableTask,
  type GoalView,
} from '../../src/services/goals';
import { getSafeDayStartHour } from '../../src/services/today';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 一个目标的详情（docs/02 §4.3「目标」）。
 *
 * 这一页只有两件事：**把那个目标写清楚**，和**决定哪些事算它的一部分**。
 *
 * 文字（标题 / 为什么 / 截止日）改完要按「存下来」才写库——每敲一个字就写一次，
 * 中途的空标题会被 repo 的校验拒掉，输入框会卡住。
 * 挂任务是勾选式，点一下立刻生效：它是个开关，不是一个表单。
 *
 * 完成由人决定。关联任务全部做完时，这里给一句询问和一个按钮，
 * 但系统不会自动把它关掉（docs/02 §3.2）——「做完」和「算完成」不是同一件事。
 */

export default function GoalDetailScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const goalId = typeof params.id === 'string' ? params.id : '';

  /** 存下来的目标。null 表示还没读到 */
  const [goal, setGoal] = useState<GoalView | null>(null);
  const [notFound, setNotFound] = useState(false);

  // 三个可编辑字段的草稿。与 goal 分开存：goal 是库里的事实，草稿是还没写下去的
  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  /** 可以挂的任务（含已挂上的） */
  const [tasks, setTasks] = useState<AttachableTask[]>([]);
  const [todayKey] = useState(() => businessDate(Date.now(), getSafeDayStartHour()));

  /**
   * 从库里重读这一页。
   *
   * resetDrafts 决定要不要用库里的值覆盖三个输入框：
   *   - 进页面、存完字之后 → true，输入框跟库对齐；
   *   - 勾任务之后 → false。勾任务是个即时开关，如果顺手把草稿也刷掉，
   *     用户改了一半的标题会在勾一个任务时无声消失。
   */
  const refresh = useCallback(
    (resetDrafts: boolean) => {
      if (!goalId) {
        setNotFound(true);
        return;
      }
      try {
        const view = getGoalView(goalId);
        if (!view) {
          setNotFound(true);
          return;
        }
        setGoal(view);
        setNotFound(false);
        setTasks(listAttachableTasks(goalId));
        if (resetDrafts) {
          setTitle(view.title);
          setWhy(view.why ?? '');
          setDueDate(view.dueDate);
        }
      } catch (err) {
        console.warn('[Ember] 读取目标详情失败', err);
        // 有旧数据就留着，不把已经看到的内容抽走
        setErrorText('刚才没读到新数据，显示的是上一次的。');
      }
    },
    [goalId]
  );

  /**
   * 每次回到这一页都重读一次库。
   *
   * 用 useFocusEffect 而不是 useEffect：从这一页跳去「加一件事」再回来时，
   * 组件并没有卸载，useEffect 不会再跑，新加的那件就不会出现在可挂清单里。
   *
   * 只有**第一次**进入时用库里的值填满输入框；之后回到这一页只刷新
   * 目标与任务清单，不动草稿——否则改了一半的标题会在跳出去看一眼之后消失。
   */
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      refresh(firstFocus.current);
      firstFocus.current = false;
    }, [refresh])
  );

  /**
   * 当前草稿是否与库里不同。
   *
   * 只比这三个字段：挂任务是即时生效的，不参与「还没存」的判断，
   * 否则用户挂完任务会发现「存下来」一直亮着，以为漏存了什么。
   */
  const dirty =
    goal !== null &&
    (title.trim() !== goal.title ||
      (why.trim() || null) !== (goal.why ?? null) ||
      dueDate !== goal.dueDate);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/goals');
    }
  };

  const handleSave = () => {
    if (!goal) return;
    const nextTitle = title.trim();
    if (nextTitle.length === 0) {
      setErrorText('目标不能是空的。想换个说法的话，先把新的写进去。');
      return;
    }

    try {
      editGoal(goal.id, {
        title: nextTitle,
        why: why.trim().length > 0 ? why.trim() : null,
        dueDate,
      });
      setErrorText(null);
      refresh(true);
    } catch (err) {
      console.warn('[Ember] 保存目标失败', err);
      setErrorText(err instanceof Error ? err.message : '没能存下来，稍后再试一次。');
    }
  };

  /**
   * 有没存的改动时先问一句再走。
   *
   * 只管得到页面上这个「返回」：安卓的系统返回键走的是导航器自己的路径，
   * 要拦它得挂 beforeRemove 监听，而那套在 tab 里行为不稳定。
   * 这一页的字段不多、存一次很快，用一句确认就够，不为此引入导航监听。
   */
  const handleBackSafely = () => {
    if (!dirty) {
      handleBack();
      return;
    }
    Alert.alert('改了还没存。', '存下来再走，还是就这样离开？', [
      { text: '就这样离开', style: 'destructive', onPress: handleBack },
      { text: '存下来', onPress: handleSave },
      { text: '留在这儿', style: 'cancel' },
    ]);
  };

  /** 挂上 / 摘下。即时生效，不需要再按「存下来」 */
  const toggleTask = (task: AttachableTask) => {
    if (!goal) return;
    const attached = task.goalId === goal.id;
    try {
      linkTask(task.id, attached ? null : goal.id);
      refresh(false);
    } catch (err) {
      console.warn('[Ember] 挂任务失败', err);
      setErrorText('刚才没挂上，再试一次。');
    }
  };

  const handleToggleDone = () => {
    if (!goal) return;
    const nextDone = goal.status !== 'done';
    try {
      setGoalDone(goal.id, nextDone);
      refresh(false);
    } catch (err) {
      console.warn('[Ember] 改目标状态失败', err);
      setErrorText('刚才没改成功，再试一次。');
    }
  };

  if (notFound) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: palette.background,
          paddingTop: insets.top + theme.spacing.lg,
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
          这个目标找不到了。它可能已经被删掉。
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="回到目标列表"
          onPress={() => router.replace('/goals')}
          style={({ pressed }) => ({
            alignSelf: 'flex-start',
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
            回到目标列表
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!goal) {
    // 第一帧：库还没读到。不显示骨架屏——这一页的内容是一次同步查询，肉眼看不到这一帧
    return <View style={{ flex: 1, backgroundColor: palette.background }} />;
  }

  const isDone = goal.status === 'done';

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.sm,
        paddingBottom: insets.bottom + theme.spacing.xxl,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: theme.spacing.pageX }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回目标"
          onPress={handleBackSafely}
          style={({ pressed }) => ({
            minHeight: theme.touchTarget,
            minWidth: theme.touchTarget,
            justifyContent: 'center',
            alignSelf: 'flex-start',
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
            返回
          </Text>
        </Pressable>

        {isDone ? (
          <Text
            style={{
              marginTop: theme.spacing.sm,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            已完成
          </Text>
        ) : null}
      </View>

      {/* 那句话 */}
      <View style={{ marginTop: theme.spacing.md, paddingHorizontal: theme.spacing.pageX }}>
        <TextInput
          value={title}
          onChangeText={(next) => {
            setTitle(next);
            if (errorText) setErrorText(null);
          }}
          placeholder="一句话说清方向"
          placeholderTextColor={palette.textMuted}
          maxLength={80}
          multiline
          accessibilityLabel="一句话目标"
          style={{
            paddingVertical: theme.spacing.xs,
            fontSize: theme.typography.size.title,
            lineHeight: theme.typography.lineHeight.title,
            fontWeight: theme.typography.weight.semibold,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.title,
            borderBottomWidth: 1,
            borderBottomColor: palette.rule,
          }}
        />
      </View>

      {/* 为什么 */}
      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          为什么
        </Text>
        <TextInput
          value={why}
          onChangeText={setWhy}
          placeholder="回头时最想读到的那句话。可以不写。"
          placeholderTextColor={palette.textMuted}
          maxLength={200}
          multiline
          textAlignVertical="top"
          accessibilityLabel="为什么想走这一段"
          style={{
            marginTop: theme.spacing.sm,
            minHeight: 88,
            paddingVertical: theme.spacing.sm,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
            borderBottomWidth: 1,
            borderBottomColor: palette.rule,
          }}
        />
      </View>

      {/* 截止日 */}
      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <DueDateField value={dueDate} todayKey={todayKey} onChange={setDueDate} />
      </View>

      {/* 存下来。没有改动时退成一行说明，而不是一个亮着的按钮 */}
      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        {dirty ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="存下来"
            onPress={handleSave}
            style={({ pressed }) => ({
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
              存下来
            </Text>
          </Pressable>
        ) : (
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            现在这些都存好了。改了字之后这里会出现「存下来」。
          </Text>
        )}

        {errorText ? (
          <Text
            accessibilityRole="alert"
            style={{
              marginTop: theme.spacing.sm,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.danger,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {errorText}
          </Text>
        ) : null}
      </View>

      {/* 进度 + 完成询问 */}
      <View style={{ marginTop: theme.spacing.xxl, paddingHorizontal: theme.spacing.pageX }}>
        <View style={styles.row}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            进度
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
            {goal.progressLabel ?? '还没挂任务'}
          </Text>
        </View>

        {goal.allDone ? (
          <View style={{ marginTop: theme.spacing.md }}>
            <Text
              style={{
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              关联的事都做完了。这个目标算完成了吗？
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
              算不算由你定。下面那个「算完成了」就是入口。
            </Text>
          </View>
        ) : null}
      </View>

      {/* 挂着的事 */}
      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <View style={styles.row}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            算这个目标一部分的事
          </Text>
        </View>

        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          勾上的会算进进度。一件任务只属于一个目标。
        </Text>

        {tasks.length === 0 ? (
          <View style={{ marginTop: theme.spacing.md }}>
            <Text
              style={{
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              还没有可挂的事。先去「今天」加一件，再回来。
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="去加一件事"
              onPress={() => router.push('/tasks/new')}
              style={({ pressed }) => ({
                alignSelf: 'flex-start',
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
                去加一件事
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ marginTop: theme.spacing.sm }}>
            {tasks.map((task) => (
              <AttachRow
                key={task.id}
                title={task.title}
                attached={task.goalId === goal.id}
                onPress={() => toggleTask(task)}
              />
            ))}
          </View>
        )}
      </View>

      {/* 完成 / 退回。放在最下面，不抢「写清楚」这件事的注意力 */}
      <View style={{ marginTop: theme.spacing.xxl, paddingHorizontal: theme.spacing.pageX }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isDone ? '退回进行中' : goal.allDone ? '算完成了' : '标记完成'}
          onPress={() => {
            if (isDone) {
              handleToggleDone();
              return;
            }
            Alert.alert('把这个目标收起来？', '它会被放进「已完成」，之后还能退回进行中。', [
              { text: '再想想', style: 'cancel' },
              { text: '收起来', onPress: handleToggleDone },
            ]);
          }}
          style={({ pressed }) => ({
            minHeight: theme.touchTarget,
            justifyContent: 'center',
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: isDone ? palette.textMuted : palette.text,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {isDone ? '退回进行中' : goal.allDone ? '算完成了' : '标记完成'}
          </Text>
        </Pressable>

        {/*
         * 删除。放在「标记完成」下面、隔开一段距离：
         * 两者是相反方向的动作，紧挨着容易点错。
         *
         * 文案只说会发生什么，不劝也不吓：「关联的事不会被删」是这一句里
         * 最要紧的信息——用户担心的往往不是目标没了，而是连带把任务删了。
         */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="删掉这个目标"
          onPress={() => {
            Alert.alert(
              `删掉「${goal.title}」？`,
              '这个目标不会再出现。挂在它上面的事不会被删，只是不再算它的进度。',
              [
                { text: '留着', style: 'cancel' },
                {
                  text: '删掉',
                  style: 'destructive',
                  onPress: () => {
                    try {
                      deleteGoalById(goal.id);
                      handleBack();
                    } catch (err) {
                      console.warn('[Ember] 删除目标失败', err);
                      setErrorText('刚才没能删掉，再试一次。');
                    }
                  },
                },
              ]
            );
          }}
          style={({ pressed }) => ({
            marginTop: theme.spacing.xl,
            minHeight: theme.touchTarget,
            justifyContent: 'center',
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.danger,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            删掉这个目标
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/**
 * 可挂任务的一行。
 *
 * 勾选态用「实心方块 + 对勾」而不是复选框的空心方框：
 * 这一页的勾选是即时的开关，不是表单里待提交的选项。
 */
function AttachRow({
  title,
  attached,
  onPress,
}: {
  title: string;
  attached: boolean;
  onPress: () => void;
}) {
  const { theme, palette } = useTheme();

  // 每件事一张白卡片：这一页列的是任务，和首页的待办是同一类东西，
  // 该用同一种框。早先是通栏行 + 发丝线，那是「账本」，不是「一张一张的纸」
  return (
    <Card style={{ marginBottom: theme.spacing.cardGap }} padding={0}>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: attached }}
        accessibilityLabel={title}
        onPress={onPress}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 52,
          paddingVertical: theme.spacing.sm,
          paddingHorizontal: theme.spacing.cardPadding,
          opacity: pressed ? 0.55 : 1,
        })}
      >
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 4,
            marginRight: theme.spacing.md,
            borderWidth: attached ? 0 : 1.5,
            borderColor: palette.secondary,
            backgroundColor: attached ? palette.primary : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {attached ? (
            <Text
              //
              // 外观走查（1.5 倍字号）改的一处：这个勾是**图标**，不是文字，
              // 所以不跟系统字号缩放。它坐在一个 18×18 的方框里，字是 12、
              // 行高 14；系统把字号放到 1.5 倍时，钩子就把方框撑满并溢出，
              // 看起来像勾跑到格子外面去了。
              //
              allowFontScaling={false}
              style={{
                fontSize: 12,
                lineHeight: 14,
                color: palette.onPrimary,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              ✓
            </Text>
          ) : null}
        </View>
        <Text
          /*
           *
           * 外观走查（1.5 倍字号）改的一处：2 → 3 行，理由同 TaskRow。
           * 任务名是用户自己写的，它是这一行唯一不能让位给排版的内容。
           */
          numberOfLines={3}
          style={{
            flex: 1,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: attached ? palette.text : palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {title}
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
