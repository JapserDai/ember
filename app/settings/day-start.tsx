import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { getSettings, updateSettings } from '../../src/db/repo/settings';
import { DEFAULT_DAY_START_HOUR } from '../../src/domain/date';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 日界选择（设置 → 节奏 → 日界，D62）。
 *
 * ---- 日界是什么 ----
 *
 * 「几点算新的一天」。默认 4 点：凌晨 3:59 记的那一笔仍然算**昨天**。
 * 这一条对夜猫子很关键——凌晨一点想起来今天还没做，
 * 记下去不该把它记到「明天」去。
 *
 * ---- 为什么给 0–23 一整圈，而不是几个预设 ----
 *
 * 预设（0 / 4 / 6）覆盖不了「我上夜班，我的早上是下午两点」这种情况。
 * 而这一页的成本很低：一个可滚动的 24 项列表，没有别的东西。
 * 所以给全，让用户自己挑。
 *
 * ---- 改日界会有什么后果，必须写在页面上 ----
 *
 * 日界只影响**这之后**的划分。已经记下的业务日不会重算——
 * 因为每一条 checkin 的 `local_date` 是写入时定死的（那是事实）。
 * 这一点如果不说明，用户会以为「我把日界改成 6 点，昨天的记录会挪过去」。
 */
export default function DayStartScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [current, setCurrent] = useState<number>(() => {
    try {
      return getSettings().day_start_hour;
    } catch {
      return DEFAULT_DAY_START_HOUR;
    }
  });
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };

  const choose = (hour: number) => {
    if (hour === current) return;
    try {
      updateSettings({ dayStartHour: hour });
      setCurrent(hour);
      setError(null);
    } catch (err) {
      console.warn('[Ember] 改日界失败', err);
      setError('刚才没换成，再试一次。');
    }
  };

  const hours = Array.from({ length: 24 }, (_, i) => i);

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
          日界
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
          现在是凌晨 {current} 点换日。也就是说，凌晨 {current} 点之前记的，都算前一天。
        </Text>
      </View>

      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <View accessibilityRole="radiogroup">
          {hours.map((hour) => (
            <HourRow
              key={hour}
              hour={hour}
              selected={current === hour}
              onPress={() => choose(hour)}
            />
          ))}
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

        <Text
          style={{
            marginTop: theme.spacing.xl,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          改日界只影响这之后怎么算。已经记下的日子不会挪位置——那是当时记下的事实。
        </Text>
      </View>
    </ScrollView>
  );
}

/** 一小时一行。24 行都是同样的形态，选中态用一个实心圆 */
function HourRow({
  hour,
  selected,
  onPress,
}: {
  hour: number;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme, palette } = useTheme();
  const label = `凌晨 ${hour} 点`;

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
    >
      <Card style={{ marginBottom: theme.spacing.xs }} padding={theme.spacing.md}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{
              flex: 1,
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.body,
              fontVariant: ['tabular-nums'],
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
