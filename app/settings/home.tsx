import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { getSettings, updateSettings } from '../../src/db/repo/settings';
import {
  DEFAULT_HOME_PREFS,
  parseHomePrefs,
  samePrefs,
  TODO_LIMIT_OPTIONS,
  type HomePrefs,
  type TodoLimit,
} from '../../src/domain/homePrefs';
import { saveHomePrefs } from '../../src/services/homePrefs';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 首页设置（设置 → 外观 → 首页，D62）。
 *
 * ---- 这一页回答什么 ----
 *
 * 「我的首页长什么样」。四项：月历要不要、火带要不要、
 * 「左滑可以删」那句提示要不要、待办最多显示几条。
 *
 * ---- 为什么是开关而不是拖拽排序 ----
 *
 * 拖拽排序要写 `tasks.sort_order` 列 + 一条迁移 + 一整套手势，
 * 而它回答的是「先看习惯还是先看待办」——一件用户其实只在
 * 刚建完 App 那两天会在意的事。四个开关覆盖了同样的问题，
 * 代价小两个数量级。
 *
 * ---- 为什么改完立刻生效、没有「保存」按钮 ----
 *
 * 每一项都是一个即时可见的取舍（关掉月历，首页就少一块），
 * 而「保存」会让用户在一个只有四个开关的页面上做一次多余的确认。
 * 写库失败时**留在原地并报一句**——不能假装成功（那是会自己忘事的设置）。
 */
export default function HomePrefsScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // 首帧同步读一次。读失败时 getHomePrefs 自己退回默认值，不会抛
  const [prefs, setPrefs] = useState<HomePrefs>(() => {
    try {
      return parseHomePrefs(getSettings().home_prefs);
    } catch {
      return DEFAULT_HOME_PREFS;
    }
  });
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };

  /** 改一项：先写库，写成功才改界面 */
  const patch = (next: Partial<HomePrefs>) => {
    const merged = { ...prefs, ...next };
    if (samePrefs(merged, prefs)) return;

    try {
      saveHomePrefs(merged);
      setPrefs(merged);
      setError(null);
    } catch (err) {
      console.warn('[Ember] 保存首页偏好失败', err);
      setError('刚才没存下来，再试一次。');
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.sm,
        paddingBottom: insets.bottom + theme.spacing.xxl,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: theme.spacing.pageX }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回设置"
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
              color: palette.primary,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            ‹ 设置
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
          首页
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
          改的是「今天」那一页的样子，不影响任何记录。
        </Text>
      </View>

      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <ToggleRow
          label="月历"
          note="有记录的那一天会点一个点"
          value={prefs.showCalendar}
          onToggle={(next) => patch({ showCalendar: next })}
        />
        <ToggleRow
          label="今日进度"
          note="那条正在烧的火带"
          value={prefs.showHearth}
          onToggle={(next) => patch({ showHearth: next })}
        />
        <ToggleRow
          label="左滑提示"
          note="「左滑可以删」那句小字。用熟了可以关掉"
          value={prefs.showSwipeHint}
          onToggle={(next) => patch({ showSwipeHint: next })}
        />

        <View style={{ marginTop: theme.spacing.xl }}>
          <Text
            style={{
              marginBottom: theme.spacing.xs,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            待办最多显示几条
          </Text>
          <View accessibilityRole="radiogroup">
            {TODO_LIMIT_OPTIONS.map((option) => (
              <ChoiceRow
                key={String(option.value)}
                label={option.label}
                selected={prefs.todoLimit === option.value}
                onPress={() => patch({ todoLimit: option.value as TodoLimit })}
              />
            ))}
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
            选「全部」时，有再多的待办也会一次列出来。
          </Text>
        </View>

        {error ? (
          <Text
            accessibilityRole="alert"
            style={{
              marginTop: theme.spacing.md,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.danger,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {error}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

/**
 * 一个开关行。
 *
 * 用「是 / 否」两个字而不是一个滑轨开关：这一版没有 Switch 组件的样式，
 * 而 RN 自带的 Switch 在各 Android 厂商上的配色不一致（有的默认绿色），
 * 与 Fluent 的白纸语汇打架。文字右侧写当前值，与设置页其余行的写法一致。
 */
function ToggleRow({
  label,
  note,
  value,
  onToggle,
}: {
  label: string;
  note: string;
  value: boolean;
  onToggle: (next: boolean) => void;
}) {
  const { theme, palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onToggle(!value)}
      style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
    >
      <Card style={{ marginBottom: theme.spacing.cardGap }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.text,
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
              {note}
            </Text>
          </View>

          <Text
            style={{
              marginLeft: theme.spacing.md,
              fontSize: theme.typography.size.label,
              lineHeight: theme.typography.lineHeight.label,
              color: value ? palette.primary : palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
              fontWeight: theme.typography.weight.medium,
            }}
          >
            {value ? '开' : '关'}
          </Text>
        </View>
      </Card>
    </Pressable>
  );
}

/** 一个单选项。与开关行同一个卡片形态，右侧是一个圈 */
function ChoiceRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme, palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
    >
      <Card style={{ marginBottom: theme.spacing.cardGap }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{
              flex: 1,
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {label}
          </Text>
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              borderWidth: selected ? 0 : 1.5,
              borderColor: palette.secondary,
              backgroundColor: selected ? palette.primary : 'transparent',
            }}
          />
        </View>
      </Card>
    </Pressable>
  );
}
