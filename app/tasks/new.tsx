import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { DueDateField } from '../../src/components/DueDateField';
import { createTask } from '../../src/db/repo/tasks';
import { ATTRIBUTE_LABEL } from '../../src/domain/balance';
import { businessDate } from '../../src/domain/date';
import { guessAttribute } from '../../src/domain/task-templates';
import { getSafeDayStartHour } from '../../src/services/today';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 新建任务（docs/02 §3.1）。
 *
 * **必填只有名字。** 其余全部有默认值，第一次创建不展示任何高级项：
 * 没有图标选择、没有提醒、没有目标次数、没有开始日期、没有备注。
 * 每多一个字段，就多一个人在这里放弃。
 *
 * 属性不给选，只显示「会记到『心智』」——它由名字里的关键词猜出来。
 * 猜错了也不影响任何数值（五维纯展示，见 D7），所以不值得为它加一个选择器。
 *
 * 路由是 /tasks/new，不在 (tabs) 里，所以推进来时底栏消失，
 * 「返回」是唯一出口——和设置页同一个范式。
 */

/** 任务类型。v0.1 只开放这两种 */
type DraftType = 'habit' | 'todo';

export default function NewTaskScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<DraftType>('habit');
  /** 截止日 YYYY-MM-DD。null = 不限期。只有「只做一次」才显示这一项 */
  const [dueDate, setDueDate] = useState<string | null>(null);
  /** 保存失败时的提示。null 表示还没出错 */
  const [errorText, setErrorText] = useState<string | null>(null);

  // 首帧就要一个今天的日期给截止日选择器用，所以在渲染期算一次
  const todayKey = useMemo(
    () => businessDate(Date.now(), getSafeDayStartHour()),
    []
  );

  const trimmed = title.trim();
  // 关键词猜测是纯函数，每次输入重算一次，代价可以忽略
  const attribute = useMemo(() => guessAttribute(trimmed), [trimmed]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  /**
   * 保存。
   *
   * createTask 是单表 INSERT，本身就是原子的，不需要再包事务。
   * 写成功才返回上一页：写失败时留在原地，用户输入的标题还在，
   * 不会出现「点了一下、页面关了、任务却没建」。
   */
  const handleSave = () => {
    if (trimmed.length === 0) {
      setErrorText('先给这件事起个名字。');
      return;
    }

    try {
      const today = businessDate(Date.now(), getSafeDayStartHour());
      createTask({
        title: trimmed,
        type,
        attribute,
        startDate: today,
        // 习惯没有截止日：一个「每天做」的事给它一个 deadline 是自相矛盾的
        dueDate: type === 'todo' ? dueDate : null,
        // 习惯默认 daily，待办由 createTask 强制成 once（这时传 recurrence 会被拒）
      });
      setErrorText(null);
      handleBack();
    } catch (err) {
      console.warn('[Ember] 新建任务失败', err);
      // repo 抛的是看得懂的中文（比如「任务标题最多 80 个字」），直接给用户看
      setErrorText(err instanceof Error ? err.message : '没能存下来，稍后再试一次。');
    }
  };

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
          accessibilityLabel="返回今天"
          onPress={handleBack}
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

        <Text
          style={{
            marginTop: theme.spacing.md,
            fontSize: theme.typography.size.title,
            lineHeight: theme.typography.lineHeight.title,
            fontWeight: theme.typography.weight.semibold,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.title,
          }}
        >
          加一件事
        </Text>
      </View>

      {/* 标题：唯一必填 */}
      <View
        style={{
          marginTop: theme.spacing.xl,
          paddingHorizontal: theme.spacing.pageX,
        }}
      >
        <TextInput
          value={title}
          onChangeText={(next) => {
            setTitle(next);
            if (errorText) setErrorText(null);
          }}
          placeholder="比如：睡前读 10 页"
          placeholderTextColor={palette.textMuted}
          maxLength={80}
          autoFocus
          returnKeyType="done"
          onSubmitEditing={handleSave}
          accessibilityLabel="任务名称"
          style={{
            minHeight: theme.touchTarget,
            paddingVertical: theme.spacing.sm,
            fontSize: theme.typography.size.heading,
            lineHeight: theme.typography.lineHeight.heading,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
            borderBottomWidth: 1,
            borderBottomColor: palette.rule,
          }}
        />

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

      {/* 类型：只有两个选项，默认「每天」 */}
      <View
        style={{
          marginTop: theme.spacing.xl,
          paddingHorizontal: theme.spacing.pageX,
        }}
      >
        <Text
          style={{
            marginBottom: theme.spacing.xs,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          类型
        </Text>

        <View accessibilityRole="radiogroup">
          <TypeOption
            label="每天"
            hint="每天都会出现在「今天」里"
            selected={type === 'habit'}
            onPress={() => setType('habit')}
          />
          <TypeOption
            label="只做一次"
            hint="做完就收起来，不会每天出现"
            selected={type === 'todo'}
            onPress={() => setType('todo')}
          />
        </View>
      </View>

      {/*
       * 截止日：只有「只做一次」才出现。
       *
       * 这是 Microsoft To Do 里待办最核心的一个字段——一条待办没有日期，
       * 它就只是一句备忘。但习惯不该有截止日：一个「每天做」的事给它
       * 一个 deadline 是自相矛盾的，而且会让习惯看起来像会过期。
       */}
      {type === 'todo' ? (
        <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
          <DueDateField value={dueDate} todayKey={todayKey} onChange={setDueDate} />
        </View>
      ) : null}

      {/* 属性：只显示猜测结果，不给选 */}
      <View
        style={{
          marginTop: theme.spacing.lg,
          paddingHorizontal: theme.spacing.pageX,
        }}
      >
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {trimmed.length > 0
            ? `会记到「${ATTRIBUTE_LABEL[attribute]}」。它不影响任何数值，只记录你把时间花在哪儿了。`
            : '写完之后，会按名字猜一个属性。它不影响任何数值。'}
        </Text>
      </View>

      {/* 保存 */}
      <View
        style={{
          marginTop: theme.spacing.xxl,
          paddingHorizontal: theme.spacing.pageX,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="放进来"
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
            放进来
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

/** 一个类型选项。圆点 + 名称 + 一句解释，与首页的行同一套语言 */
function TypeOption({
  label,
  hint,
  selected,
  onPress,
}: {
  label: string;
  hint: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme, palette } = useTheme();

  // 两个选项各占一张白卡片：选中态只由左边的圆点表示，卡片本身不变色——
  // 卡片一变蓝，两个选项就会读成「一个按钮一个说明」
  return (
    <Card style={{ marginBottom: theme.spacing.cardGap }} padding={0}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        accessibilityLabel={`${label}。${hint}`}
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
            width: 14,
            height: 14,
            borderRadius: 7,
            borderWidth: selected ? 4 : 1.5,
            borderColor: selected ? palette.primary : palette.secondary,
            marginRight: theme.spacing.md,
          }}
        />
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: selected ? palette.text : palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {label}
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
            {hint}
          </Text>
        </View>
      </Pressable>
    </Card>
  );
}
