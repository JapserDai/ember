import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { getPlayerSnapshot } from '../../src/db/repo/player';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABEL, type AttributeKey } from '../../src/domain/balance';
import { TITLES, titleProgress, titlesOf, type Title } from '../../src/domain/titles';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 称号图鉴（阶段 4 第 4 条）。
 *
 * ---- 未解锁的显示成什么 ----
 *
 * 显示**剪影**：名字与说明都画出来，但名字换成「？」、说明换成阈值。
 *
 * 为什么不整条藏起来：藏起来的话，用户永远不知道还有哪些称号存在，
 * 也就不知道「再走一点会拿到什么」。而全部显示出来又会让 15 个称号
 * 变成 15 张待办——所以未解锁的**只显示条件，不显示名字**：
 * 「体魄 · 再走 9 点」是一个方向，不是一个欠账。
 *
 * ---- 为什么按维度分组，而不是按解锁状态分组 ----
 *
 * 按解锁状态分组（已解锁 / 未解锁）会让这一页变成一张成绩单：
 * 上半部分是「你做到了」，下半部分是「你没做到」。
 * 按维度分组则是「五个方向各自的进度」，每组三档，读起来是一段路。
 *
 * ---- 没有「已解锁 3 / 15」的大字 ----
 *
 * 那个数字会立刻变成一个要填满的进度条。进度只在页尾用一行小字给，
 * 而且它不进「我的」页。
 */
export default function TitlesScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [points, setPoints] = useState<Record<AttributeKey, number> | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(() => {
    try {
      const player = getPlayerSnapshot();
      const next = {} as Record<AttributeKey, number>;
      for (const key of ATTRIBUTE_KEYS) next[key] = player.attributes[key].points;
      setPoints(next);
      setError(false);
    } catch (err) {
      console.warn('[Ember] 读取称号进度失败', err);
      setError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/me');
  };

  const progress = points ? titleProgress(points) : { unlocked: 0, total: TITLES.length };

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
          accessibilityLabel="返回我的"
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
          称号
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
          五维走到一定点数，会有一个名字。它只是记录你把时间花在哪儿，不影响任何数值。
        </Text>
      </View>

      {error ? (
        <Card style={{ marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.pageX }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {points ? '刚才没读到新数据，显示的是上一次的。' : '这些暂时读不出来。'}
          </Text>
        </Card>
      ) : null}

      {points
        ? ATTRIBUTE_KEYS.map((key) => (
            <View key={key} style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  marginBottom: theme.spacing.sm,
                }}
              >
                <Text
                  style={{
                    fontSize: theme.typography.size.label,
                    lineHeight: theme.typography.lineHeight.label,
                    fontWeight: theme.typography.weight.medium,
                    color: palette.textMuted,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  {ATTRIBUTE_LABEL[key]}
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
                  {points[key]} 点
                </Text>
              </View>

              {titlesOf(key).map((title) => (
                <TitleRow key={title.id} title={title} points={points[key]} />
              ))}
            </View>
          ))
        : null}

      {/* 进度只在页尾用一行小字给，不做进度条 */}
      {points ? (
        <View style={{ marginTop: theme.spacing.xxl, paddingHorizontal: theme.spacing.pageX }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
              fontVariant: ['tabular-nums'],
            }}
          >
            现在拿到了 {progress.unlocked} 个，一共 {progress.total} 个。
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

/**
 * 一个称号。
 *
 * 已解锁：名字 + 一句说明。
 * 未解锁：名字位置写「？」，说明位置写「再走 X 点」。
 *
 * 为什么未解锁的也给一张卡（而不是折起来）：折起来会让人不知道
 * 这一维还有几档。三张卡并排看，读起来是一段路的三站。
 */
function TitleRow({ title, points }: { title: Title; points: number }) {
  const { theme, palette } = useTheme();
  const unlocked = points >= title.threshold;
  const remaining = Math.max(0, title.threshold - points);

  return (
    <Card style={{ marginBottom: theme.spacing.cardGap }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* 一个方块：已解锁是实心主色，未解锁是空心描边。
            不用图标——这一版没有图标库，而一个方块已经能表达「亮着 / 没亮」 */}
        <View
          style={{
            width: 12,
            height: 12,
            borderRadius: 2,
            marginRight: theme.spacing.md,
            backgroundColor: unlocked ? palette.primary : 'transparent',
            borderWidth: unlocked ? 0 : 1.5,
            borderColor: palette.secondary,
          }}
        />

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              fontWeight: unlocked
                ? theme.typography.weight.medium
                : theme.typography.weight.regular,
              color: unlocked ? palette.text : palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {unlocked ? title.name : '？'}
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
            {unlocked ? title.note : `再走 ${remaining} 点`}
          </Text>
        </View>
      </View>
    </Card>
  );
}
