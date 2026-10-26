import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { getSettings, updateSettings } from '../../src/db/repo/settings';
import { DIFFICULTY, type DifficultyKey } from '../../src/domain/balance';
import { getRepairStatus } from '../../src/services/streak';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 难度选择（设置 → 节奏 → 难度，D62）。
 *
 * ---- 这一页为什么现在才有 ----
 *
 * `settings.difficulty` 从 v1 就在表里，`domain/balance.ts` 里的三档配置
 * 也一直是对的，但设置页那一行是 `state: 'readonly'`——点不动。
 * 也就是说：**这个 App 的三档难度从来没有被用户改过**，
 * 所有人在跑的都是默认的「温和」。
 *
 * ---- 为什么改难度有禁改窗口 ----
 *
 * `docs/02 §2.2` 定的规矩：处于 `repairable`（有缺口、还能修）时禁止改难度。
 * 理由很实际——否则「断签之后切到温和」就是一条免费修复路径，
 * 而那把三档难度变成了一个可以随时反悔的选择，等于没有难度。
 *
 * 判断走 `getRepairStatus()`，它不写库、可以随便调。
 *
 * ---- 为什么每一项都写清代价，而不只写名字 ----
 *
 * 「标准」两个字不告诉你任何事。而这一页真正的选择是
 * 「我愿意接受多大的补记折扣 / 修复成本 / 断签扣减」，
 * 所以每一张卡都把那三个数写在明面上。
 */
export default function DifficultyScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [current, setCurrent] = useState<DifficultyKey>(() => {
    try {
      return getSettings().difficulty;
    } catch {
      return 'easy';
    }
  });
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };

  const choose = (key: DifficultyKey) => {
    if (key === current) return;

    // 禁改窗口：有缺口且能修时不允许改，防止「断签后切温和」套利
    let repairable = false;
    try {
      repairable = getRepairStatus().repairable;
    } catch (err) {
      // 读不出来时不拦：拦下来会让「库坏了」变成「设置永远改不了」
      console.warn('[Ember] 读修复状态失败，本次不拦难度修改', err);
    }
    if (repairable) {
      setError('这一段还没修完。先把它处理掉，再改难度。');
      return;
    }

    try {
      updateSettings({ difficulty: key });
      setCurrent(key);
      setError(null);
    } catch (err) {
      console.warn('[Ember] 改难度失败', err);
      setError('刚才没换成，再试一次。');
    }
  };

  const keys: DifficultyKey[] = ['easy', 'standard', 'hard'];

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
          难度
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
          三档都不惩罚。区别只在收益倍率、补记折扣与修复成本。
        </Text>
      </View>

      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <View accessibilityRole="radiogroup">
          {keys.map((key) => (
            <DifficultyCard
              key={key}
              difficultyKey={key}
              selected={current === key}
              onPress={() => choose(key)}
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
          改难度只影响这之后的日子。已经记下的、已经扣掉的都不会变。
        </Text>
      </View>
    </ScrollView>
  );
}

/** 一张难度卡：名字 + 三个真正的差别 */
function DifficultyCard({
  difficultyKey,
  selected,
  onPress,
}: {
  difficultyKey: DifficultyKey;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme, palette } = useTheme();
  const profile = DIFFICULTY[difficultyKey];

  // 收益倍率显示成百分比：×0.85 比 85% 难读
  const reward = `${Math.round(profile.rewardMult * 100)}%`;
  // 补记：窗口 + 折扣。轻松档不打折，所以只写窗口
  const backfill =
    profile.backfillRatio >= 1
      ? `${profile.backfillWindowHours} 小时内可补，不打折`
      : `${profile.backfillWindowHours} 小时内可补，记 ${Math.round(profile.backfillRatio * 100)}%`;

  const lines = [
    `收益 ${reward}`,
    backfill,
    // 断签扣减：轻松档是 0，写「不扣」而不是「0%」——0 这个数在 App 里是个禁忌（D13 的延伸）
    profile.breakPenaltyRate === 0 ? '断签不扣' : `断签扣余烬 ${Math.round(profile.breakPenaltyRate * 100)}%`,
    `修复 ${profile.repairEmber} 余烬`,
  ];

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${profile.label}。${lines.join('，')}`}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
    >
      <Card style={{ marginBottom: theme.spacing.cardGap }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{
              flex: 1,
              fontSize: theme.typography.size.heading,
              lineHeight: theme.typography.lineHeight.heading,
              fontWeight: theme.typography.weight.semibold,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.title,
            }}
          >
            {profile.label}
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

        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {lines.join(' · ')}
        </Text>
      </Card>
    </Pressable>
  );
}
