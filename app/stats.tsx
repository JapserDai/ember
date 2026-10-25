import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../src/components/Card';
import { StatBarList } from '../src/components/StatBarList';
import { getStatsData, STATS_WINDOW_DAYS, type StatsData } from '../src/services/stats';
import { useTheme } from '../src/theme/ThemeProvider';

/**
 * 统计页（我的 → 统计）。
 *
 * ---- 这一页的三条底线 ----
 *
 * 1. **不出现完成率、不出现目标线、不出现「还差几天」。**
 *    这个 App 的立场是永不惩罚（docs/02 §2.4），而完成率是这一页最容易
 *    滑进去的地方：一旦有了「20 天里你只做到了 12 天」，剩下的 8 天就变成了欠账。
 *    所以这里只报「有多少天动过」这个**事实**，不把它和天数总量放在一起比。
 * 2. **数据不够时不说空话。** 一条记录都没有时，三张卡各自给一句「还看不出来」，
 *    而不是画一排空条——空条看起来像五个零分。
 * 3. **不排名、不给建议。** 峰值时段只说「你大多在晚上记」，不说「你应该早点睡」。
 *
 * ---- 为什么放在「我的」页的入口，而不是第五个 tab ----
 *
 * 底栏四个 tab 是「今天要做什么」的四个面（今天 / 目标 / 回忆 / 我的）。
 * 统计是回头看的，一周看一次的东西；给它一个常驻 tab，等于把「复盘」
 * 抬到和「今天做什么」一样重。放在我的页，从设置上方那一块进。
 */
export default function StatsScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /** 统计结果。null 表示还没读出来（或者读失败了） */
  const [data, setData] = useState<StatsData | null>(null);
  /** 读库失败。有旧数据时只加一行小字，没有时给一句实话 */
  const [error, setError] = useState(false);

  const refresh = useCallback(() => {
    try {
      setData(getStatsData());
      setError(false);
    } catch (err) {
      console.warn('[Ember] 读取统计失败', err);
      setError(true);
    }
  }, []);

  // 每次进这一页重读：用户可能刚在「今天」页记了几笔
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/me');
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
          统计
        </Text>
      </View>

      {/*
       * 读不出来时：有旧数据就留着，只加一行小字；没有就给一句实话 + 重试。
       * 与首页同一个策略——把「读库出问题」和「你什么都没做」分开说。
       */}
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
            {data ? '刚才没读到新数据，显示的是上一次的。' : '这些数字暂时读不出来。'}
          </Text>
          {!data ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="再试一次"
              onPress={refresh}
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
                再试一次
              </Text>
            </Pressable>
          ) : null}
        </Card>
      ) : null}

      {data ? <StatsBody data={data} /> : null}
    </ScrollView>
  );
}

function StatsBody({ data }: { data: StatsData }) {
  const { theme, palette } = useTheme();

  const rangeLabel = `${data.since} 到 ${data.today}`;

  return (
    <>
      {/*
       * 近 30 天。
       *
       * 只报「有记录的天数」这一个数，**不报分母**。
       * 「30 天里有 12 天」这句话本身就是一句评判，而「有 12 天动过」
       * 是同一件事实的中性说法。分母在这里没有信息价值：
       * 用户知道自己过了 30 天。
       */}
      <Card style={{ marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            fontWeight: theme.typography.weight.semibold,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          最近 {STATS_WINDOW_DAYS} 天
        </Text>

        {data.totalCheckins === 0 ? (
          <Text
            style={{
              marginTop: theme.spacing.sm,
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            这段还没有记录。记下第一件之后，这里会开始有东西。
          </Text>
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 2 }}>
              {/*
               * 这个数是这一页的主角，用大字号（heading 20，不是 hero 48）：
               * hero 尺寸在手机上会把「天」这个字挤到下一行，
               * 而这一页有四个数，不该有一个抢走全部注意力。
               */}
              <Text
                style={{
                  fontSize: theme.typography.size.heading,
                  lineHeight: theme.typography.lineHeight.heading,
                  fontWeight: theme.typography.weight.semibold,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.title,
                }}
              >
                {data.activeDays}
              </Text>
              <Text
                style={{
                  marginLeft: theme.spacing.xs,
                  fontSize: theme.typography.size.body,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                天动过
              </Text>
            </View>

            <Text
              style={{
                marginTop: theme.spacing.xs,
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
                fontVariant: ['tabular-nums'],
              }}
            >
              一共记了 {data.totalCheckins} 次，拿到 {data.totalXp} 点经验
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
              {rangeLabel}
            </Text>
          </>
        )}
      </Card>

      {/* 时段分布 */}
      <View style={{ marginTop: theme.spacing.cardGap }}>
        <StatBarList
          title="什么时候记的"
          bars={data.byTime}
          unit=" 次"
          emptyHint="这段还没有记录，还看不出你习惯在什么时候记。"
        />
        {data.peakTimeLabel ? (
          <Text
            style={{
              marginTop: theme.spacing.sm,
              paddingHorizontal: theme.spacing.pageX,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            你大多在{data.peakTimeLabel}记。这只是个观察，不是建议。
          </Text>
        ) : null}
      </View>

      {/* 五维分布 */}
      <View style={{ marginTop: theme.spacing.xl }}>
        <StatBarList
          title="时间花在哪几维"
          bars={data.byAttribute}
          emptyHint="这段还没有记录，还看不出时间花在哪儿了。"
        />
        {data.topAttributeLabel ? (
          <Text
            style={{
              marginTop: theme.spacing.sm,
              paddingHorizontal: theme.spacing.pageX,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            走得最远的是{data.topAttributeLabel}。五维只记录你把时间花在哪儿了，不影响任何数值。
          </Text>
        ) : null}
      </View>
    </>
  );
}
