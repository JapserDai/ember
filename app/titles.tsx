import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../src/components/Card';
import { PageTitle } from '../src/components/PageTitle';
import { TitleMark } from '../src/components/TitleMark';
import { getPlayerSnapshot } from '../src/db/repo/player';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABEL,
  type AttributeKey,
} from '../src/domain/balance';
import {
  JOURNEY_TITLES,
  TITLES,
  titleProgress,
  titlesOf,
  type Title,
} from '../src/domain/titles';
import { useTheme } from '../src/theme/ThemeProvider';

/**
 * 称号图鉴（阶段 4 第 4 条；D52 起两层 + 图形）。
 *
 * ---- 版式的核心决定：三个容器并排，而不是三张卡竖排 ----
 *
 * 称号图形是**一只容器 + 一条水位**（`domain/titleMarks.ts`）。三个档位
 * 竖着排成三张卡时，读者看到的是「三个方框，前两个有东西、第三个空」——
 * 那还是清单。并排放进同一张卡，读者看到的是**同一只容器的三个水位**：
 * 一眼就知道「这一维的水到哪儿了、还差多少」。
 *
 * 所以这一页的结构是：
 *
 *   五维（5 张卡，每张 3 只容器并排）
 *     ↓
 *   旅程（1 张卡，5 个落点并排 = 一条路）
 *     ↓
 *   页尾一行：现在拿到了 N 个，一共 M 个
 *
 * 15 + 5 = 20 个称号只占 6 张卡。竖向高度比原来的 20 张卡少了三分之二，
 * 而信息一点没少。
 *
 * ---- 未解锁的显示成什么 ----
 *
 * **空容器 + 「？」+ 门槛。** 名字不显示，说明不显示。
 *
 * 为什么不整条藏起来：藏起来的话，用户永远不知道还有哪些称号存在，
 * 也就不知道「再走一点会拿到什么」。而全部显示出来又会让 20 个称号
 * 变成 20 张待办——所以未解锁的**只显示条件，不显示名字**：
 * 「体魄 · 再走 9 点」是一个方向，不是一个欠账。
 *
 * ---- 为什么按维度分组，而不是按解锁状态分组 ----
 *
 * 按解锁状态分组（已解锁 / 未解锁）会让这一页变成一张成绩单：
 * 上半部分是「你做到了」，下半部分是「你没做到」。
 * 按维度分组则是「五个方向各自的进度」，每组三档，读起来是一段路。
 *
 * ---- 没有「已解锁 3 / 20」的大字 ----
 *
 * 那个数字会立刻变成一个要填满的进度条。进度只在页尾用一行小字给，
 * 而且它不进「我的」页。
 */
export default function TitlesScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [points, setPoints] = useState<Record<AttributeKey, number> | null>(null);
  const [level, setLevel] = useState(1);
  const [error, setError] = useState(false);

  const refresh = useCallback(() => {
    try {
      const player = getPlayerSnapshot();
      const next = {} as Record<AttributeKey, number>;
      for (const key of ATTRIBUTE_KEYS) next[key] = player.attributes[key].points;
      setPoints(next);
      setLevel(player.level);
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

  const progress = points
    ? titleProgress(points, level)
    : {
        unlocked: 0,
        total: TITLES.length + JOURNEY_TITLES.length,
        attribute: { unlocked: 0, total: TITLES.length },
        journey: { unlocked: 0, total: JOURNEY_TITLES.length },
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

        <View style={{ marginTop: theme.spacing.md }}>
          <PageTitle
            title="称号"
            mark="globe"
            subtitle="这里有两组。上面五个是「你的时间花在哪儿」，最下面那组是「你一共走了多远」。它们只是记录，不影响任何数值。"
          />
        </View>
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

      {points ? (
        <>
          {/* ---- 第一组：五维。一张卡 = 一只容器的三个水位 ---- */}
          <GroupLabel text="五维" note="每一维有自己的容器，水位到哪儿就是第几档。" />

          {ATTRIBUTE_KEYS.map((key) => (
            <AttributeGroup
              key={key}
              attribute={key}
              points={points[key]}
              // 属性称号表的每一项都有 attribute，所以这里一定有值
              titles={titlesOf(key)}
            />
          ))}

          {/* ---- 第二组：旅程。一条路 + 五个落点 ---- */}
          <GroupLabel text="旅程" note="这一组不看五维，只看你一共走了多远。" />

          <Card style={{ marginHorizontal: theme.spacing.pageX }}>
            <View style={styles.journeyRow}>
              {JOURNEY_TITLES.map((title) => {
                const unlocked = level >= title.threshold;
                return (
                  <View key={title.id} style={styles.journeyCell}>
                    <TitleMark
                      mark="journey"
                      tier={title.tier}
                      unlocked={unlocked}
                      size={28}
                      strokeColor={unlocked ? palette.text : palette.secondary}
                      fillColor={palette.primary}
                    />
                    <Text
                      style={{
                        marginTop: theme.spacing.xs,
                        fontSize: theme.typography.size.caption,
                        lineHeight: theme.typography.lineHeight.caption,
                        color: unlocked ? palette.text : palette.textMuted,
                        fontFamily: theme.typography.fontFamily.body,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      LV.{title.threshold}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* 已经拿到的名字。只列名字，不列说明——说明在下面「下一档」那句里 */}
            <Text
              style={{
                marginTop: theme.spacing.md,
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {progress.journey.unlocked > 0
                ? JOURNEY_TITLES.filter((title) => level >= title.threshold)
                    .map((title) => title.name)
                    .join('、')
                : '还没有。走到 LV.10 会有一个名字。'}
            </Text>

            <Text
              style={{
                marginTop: theme.spacing.xs,
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
                fontVariant: ['tabular-nums'],
              }}
            >
              {(() => {
                const next = JOURNEY_TITLES.find((title) => level < title.threshold);
                if (!next) return `现在是 LV.${level}，这一组的名字都拿到了。`;
                return `现在是 LV.${level}，再走 ${next.threshold - level} 级到「${next.name}」。`;
              })()}
            </Text>
          </Card>
        </>
      ) : null}

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
            （五维 {progress.attribute.unlocked} / {progress.attribute.total}，
            旅程 {progress.journey.unlocked} / {progress.journey.total}）
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

/**
 * 组标题。**不是**全大写的小标签，也不用字距——
 * 它与下面卡片里那个维度名是同一套字号，只是加了半档字重。
 */
function GroupLabel({ text, note }: { text: string; note: string }) {
  const { theme, palette } = useTheme();
  return (
    <View
      style={{
        marginTop: theme.spacing.xl,
        marginBottom: theme.spacing.sm,
        paddingHorizontal: theme.spacing.pageX,
      }}
    >
      <Text
        style={{
          fontSize: theme.typography.size.label,
          lineHeight: theme.typography.lineHeight.label,
          fontWeight: theme.typography.weight.semibold,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {text}
      </Text>
      <Text
        style={{
          marginTop: 2,
          fontSize: theme.typography.size.caption,
          lineHeight: theme.typography.lineHeight.body,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {note}
      </Text>
    </View>
  );
}

/**
 * 一维：一张卡，里面三只容器并排。
 *
 * 每只容器下面两行：名字（未解锁是「？」）+ 门槛 / 说明。
 * 三只并排的宽度在 360dp 屏上是约 96dp 一格，够放「耐久的行者」这种五字名。
 */
function AttributeGroup({
  attribute,
  points,
  titles,
}: {
  attribute: AttributeKey;
  points: number;
  titles: Title[];
}) {
  const { theme, palette } = useTheme();

  return (
    <Card style={{ marginBottom: theme.spacing.cardGap, marginHorizontal: theme.spacing.pageX }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: theme.spacing.md,
        }}
      >
        <Text
          style={{
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            fontWeight: theme.typography.weight.medium,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {ATTRIBUTE_LABEL[attribute]}
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
          {points} 点
        </Text>
      </View>

      <View style={styles.tierRow}>
        {titles.map((title) => {
          const unlocked = points >= title.threshold;
          const remaining = Math.max(0, title.threshold - points);
          return (
            <View key={title.id} style={styles.tierCell}>
              <TitleMark
                mark={attribute}
                tier={title.tier}
                unlocked={unlocked}
                size={32}
                strokeColor={unlocked ? palette.text : palette.secondary}
                fillColor={palette.primary}
              />
              <Text
                numberOfLines={2}
                style={{
                  marginTop: theme.spacing.xs,
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  fontWeight: unlocked
                    ? theme.typography.weight.medium
                    : theme.typography.weight.regular,
                  color: unlocked ? palette.text : palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                  textAlign: 'center',
                }}
              >
                {unlocked ? title.name : '？'}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  marginTop: 2,
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                  textAlign: 'center',
                  fontVariant: ['tabular-nums'],
                }}
              >
                {unlocked ? title.note : `再走 ${remaining} 点`}
              </Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

/*
 * 只留布局，不留尺寸与颜色：间距走 theme.spacing、颜色走 palette（D30 的同一条规矩）。
 */
const styles = {
  /** 三只容器并排。等宽：三个水位要能直接比 */
  tierRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  tierCell: {
    flex: 1,
    alignItems: 'center',
  },
  /** 旅程那五个落点。窄屏上五个并排，每格约 65dp，只放 LV 号不放大字 */
  journeyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  journeyCell: {
    flex: 1,
    alignItems: 'center',
  },
} as const;
