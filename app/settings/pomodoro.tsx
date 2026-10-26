import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { getSettings } from '../../src/db/repo/settings';
import {
  DEFAULT_POMODORO_PREFS,
  POMODORO_PHASE_OPTIONS,
  parsePomodoroPrefs,
  samePomodoroPrefs,
  type PomodoroPhaseKey,
  type PomodoroPrefs,
} from '../../src/domain/pomodoroPrefs';
import { savePomodoroPrefs } from '../../src/services/pomodoroPrefs';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 番茄钟设置（设置 → 外观 → 番茄钟，D68）。
 *
 * 三项：默认档 / 完成音 / 自动接下一档。
 *
 * 与日记设置同一个形态（改一项写一次库、没有保存按钮、写失败留在原地报一句）。
 * 默认档在番茄钟页里换档时也会被记住——这里给的是改主意的入口，
 * 两处写的是同一列，不存在第二份真相。
 */
export default function PomodoroPrefsScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [prefs, setPrefs] = useState<PomodoroPrefs>(() => {
    try {
      return parsePomodoroPrefs(getSettings().pomodoro_prefs);
    } catch {
      return DEFAULT_POMODORO_PREFS;
    }
  });
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };

  /** 改一项：先写库，写成功才改界面 */
  const patch = (next: Partial<PomodoroPrefs>) => {
    const merged = { ...prefs, ...next };
    if (samePomodoroPrefs(merged, prefs)) return;

    try {
      savePomodoroPrefs(merged);
      setPrefs(merged);
      setError(null);
    } catch (err) {
      console.warn('[Ember] 保存番茄钟偏好失败', err);
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
          番茄钟
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
          计时怎么开始、完成时说什么。
        </Text>
      </View>

      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <SectionLabel text="打开时默认哪一档" />
        <View accessibilityRole="radiogroup">
          {POMODORO_PHASE_OPTIONS.map((option) => (
            <ChoiceRow
              key={option.value}
              label={option.label}
              selected={prefs.defaultPhase === option.value}
              onPress={() => patch({ defaultPhase: option.value as PomodoroPhaseKey })}
            />
          ))}
        </View>

        <View style={{ marginTop: theme.spacing.xl }}>
          <SectionLabel text="完成时响一声" />
          <SwitchRow
            label="响一声"
            note="用系统提示音。这个 App 的提醒刻意无声，这一声是你自己选的。"
            value={prefs.soundEnabled}
            onToggle={() => patch({ soundEnabled: !prefs.soundEnabled })}
          />
        </View>

        <View style={{ marginTop: theme.spacing.xl }}>
          <SectionLabel text="走完自动接下一档" />
          <SwitchRow
            label="自动接续"
            note="专注走完接休息，休息走完接专注。中途随时可以手动停。"
            value={prefs.autoStartNext}
            onToggle={() => patch({ autoStartNext: !prefs.autoStartNext })}
          />
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

function SectionLabel({ text }: { text: string }) {
  const { theme, palette } = useTheme();
  return (
    <Text
      style={{
        marginBottom: theme.spacing.xs,
        fontSize: theme.typography.size.caption,
        lineHeight: theme.typography.lineHeight.caption,
        color: palette.textMuted,
        fontFamily: theme.typography.fontFamily.body,
      }}
    >
      {text}
    </Text>
  );
}

/** 一个开关行。与日记设置页的同一形态 */
function SwitchRow({
  label,
  note,
  value,
  onToggle,
}: {
  label: string;
  note: string;
  value: boolean;
  onToggle: () => void;
}) {
  const { theme, palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={onToggle}
      style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
    >
      <Card>
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

/** 一个单选项。与日记设置页的同一形态 */
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
