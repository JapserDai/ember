import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DueDateField } from '../../src/components/DueDateField';
import { businessDate } from '../../src/domain/date';
import { createNewGoal } from '../../src/services/goals';
import { getSafeDayStartHour } from '../../src/services/today';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 写一个新目标（docs/02 §3.2）。
 *
 * 只有三个字段，其中只有第一个必填：
 *   1. 一句话目标；
 *   2. 为什么（可选）；
 *   3. 截止日（可选，默认不限期）。
 *
 * 「关联任务」不在这一步问。写目标时还不知道要挂什么，先让人把那句话写下来，
 * 挂任务是之后在详情页里慢慢加的事。新建页少一个字段，就少一个人在这里卡住。
 *
 * 「为什么」是可选的，但排版上给了它一整块——它不是备注，
 * 是三个月后回来看这一页时唯一还起作用的那句话。
 */

export default function NewGoalScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [why, setWhy] = useState('');
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const trimmedTitle = title.trim();

  /**
   * 今天的业务日。
   *
   * 在渲染时算一次：这一页开着的几十秒里跨过凌晨 4 点的概率可以忽略，
   * 而每帧重算会让相对日期的胶囊在输入时闪烁。
   */
  const [todayKey] = useState(() => businessDate(Date.now(), getSafeDayStartHour()));

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      // 直接深链进这一页时没有上一页，退回目标列表（D48 起是二级页）
      router.replace('/goals');
    }
  };

  const handleSave = () => {
    if (trimmedTitle.length === 0) {
      setErrorText('先写一句话。比如「把睡眠找回来」。');
      return;
    }

    try {
      createNewGoal({
        title: trimmedTitle,
        why: why.trim().length > 0 ? why.trim() : null,
        dueDate,
      });
      setErrorText(null);
      handleBack();
    } catch (err) {
      console.warn('[Ember] 新建目标失败', err);
      // repo 抛的是看得懂的中文（比如「目标名请写 1–80 个字」），直接给用户看
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
          accessibilityLabel="返回目标"
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
          写一个目标
        </Text>

        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          一句话说清方向，不写指标。
        </Text>
      </View>

      {/* 一句话目标：唯一必填 */}
      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <TextInput
          value={title}
          onChangeText={(next) => {
            setTitle(next);
            if (errorText) setErrorText(null);
          }}
          placeholder="比如：把睡眠找回来"
          placeholderTextColor={palette.textMuted}
          maxLength={80}
          autoFocus
          returnKeyType="next"
          accessibilityLabel="一句话目标"
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

      {/* 为什么：可选，但给足版面 */}
      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          为什么（可以不写）
        </Text>
        <TextInput
          value={why}
          onChangeText={setWhy}
          placeholder="三个月后回来看，你最想读到哪句话？"
          placeholderTextColor={palette.textMuted}
          maxLength={200}
          multiline
          textAlignVertical="top"
          accessibilityLabel="为什么想走这一段"
          style={{
            marginTop: theme.spacing.sm,
            minHeight: 96,
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

      {/* 截止日：默认不限期 */}
      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <DueDateField value={dueDate} todayKey={todayKey} onChange={setDueDate} />
      </View>

      <View style={{ marginTop: theme.spacing.xxl, paddingHorizontal: theme.spacing.pageX }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="写下来"
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
            写下来
          </Text>
        </Pressable>

        <Text
          style={{
            marginTop: theme.spacing.md,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          目标可以先空着。挂上要做的事之后，进度会自己长出来。
        </Text>
      </View>
    </ScrollView>
  );
}
