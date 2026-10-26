import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../src/components/Card';
import { SEASONS } from '../src/content/stories';
import { getNarrativeView, type NarrativeView } from '../src/services/narrative';
import { useTheme } from '../src/theme/ThemeProvider';

/**
 * 叙事页（阶段 5）。
 *
 * 三块内容，从上到下：
 *   1. **这一季的故事**：按累计记录天数解锁的短文本；
 *   2. **这一季的 Boss**：一条血条，打卡就是伤害；
 *   3. **这个月的主题**：一句主题 + 三个方向（不是任务）。
 *
 * ---- 为什么它不是一个 tab ----
 *
 * 底栏四个 tab 回答「今天要做什么」（D17）。叙事是**读**的，
 * 一个月看一两次。给它一个常驻 tab 等于把「看故事」抬到和「今天做什么」一样重。
 * 所以它从「回忆」页进去。
 *
 * ---- 三条硬规矩（验收标准里写着）----
 *
 *   - 解锁用**累计**天数，不用连续天数——断更不会让已经读到的段落退回去；
 *   - Boss **没有死亡、没有失败惩罚**，一季没打完它不会变成「你输过」；
 *   - 剧情文本不出现「你失败了」（40 条内容全部过禁用词表）。
 */
export default function NarrativeScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [view, setView] = useState<NarrativeView | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(() => {
    try {
      setView(getNarrativeView());
      setError(false);
    } catch (err) {
      console.warn('[Ember] 读取叙事失败', err);
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
    else router.replace('/journal');
  };

  const seasonName = view ? SEASONS.find((s) => s.id === view.season)?.name ?? '' : '';
  const seasonTheme = view ? SEASONS.find((s) => s.id === view.season)?.theme ?? '' : '';

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
          accessibilityLabel="返回日记"
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
          {seasonName}
        </Text>

        {view ? (
          <Text
            style={{
              marginTop: theme.spacing.xs,
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            这一季讲的是{seasonTheme}。
          </Text>
        ) : null}
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
            {view ? '刚才没读到新数据，显示的是上一次的。' : '这一页暂时读不出来。'}
          </Text>
        </Card>
      ) : null}

      {view ? (
        <>
          {/* ---- 故事 ---- */}
          <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
            <Text
              style={{
                marginBottom: theme.spacing.sm,
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                fontWeight: theme.typography.weight.semibold,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              这一季
            </Text>

            {view.unlocked.length === 0 ? (
              <Card>
                <Text
                  style={{
                    fontSize: theme.typography.size.body,
                    lineHeight: theme.typography.lineHeight.body,
                    color: palette.textMuted,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  这一段还没有东西。攒够 {view.nextGap ?? 3} 天记录，第一段会出来。
                </Text>
              </Card>
            ) : (
              view.unlocked.map((segment) => (
                <Card key={segment.id} style={{ marginBottom: theme.spacing.cardGap }}>
                  <Text
                    style={{
                      fontSize: theme.typography.size.body,
                      lineHeight: theme.typography.lineHeight.body,
                      color: palette.text,
                      fontFamily: theme.typography.fontFamily.body,
                    }}
                  >
                    {segment.text}
                  </Text>
                </Card>
              ))
            )}

            {/* 下一段的门槛。只说「再记几天」，不说「你还差多少」 */}
            {view.nextGap !== null ? (
              <Text
                style={{
                  marginTop: theme.spacing.xs,
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                再记 {view.nextGap} 天，下一段会出来。现在累计 {view.totalDays} 天。
              </Text>
            ) : (
              <Text
                style={{
                  marginTop: theme.spacing.xs,
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                这一季读完了。下一季会换一段新的。
              </Text>
            )}
          </View>

          {/* ---- Boss ---- */}
          {view.boss ? (
            <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
              <Text
                style={{
                  marginBottom: theme.spacing.sm,
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  fontWeight: theme.typography.weight.semibold,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                这一季在等的东西
              </Text>

              <Card>
                <Text
                  style={{
                    fontSize: theme.typography.size.body,
                    lineHeight: theme.typography.lineHeight.body,
                    fontWeight: theme.typography.weight.medium,
                    color: palette.text,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  {view.boss.boss.name}
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
                  {view.boss.boss.note}
                </Text>

                {/* 血条。轨道用 border，填充用 primary */}
                <View
                  style={{
                    marginTop: theme.spacing.sm,
                    height: 8,
                    borderRadius: 2,
                    backgroundColor: palette.border,
                    overflow: 'hidden',
                  }}
                >
                  <View
                    style={{
                      width: `${Math.round(view.boss.ratio * 100)}%`,
                      height: '100%',
                      borderRadius: 2,
                      backgroundColor: palette.primary,
                    }}
                  />
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
                  {view.boss.cleared
                    ? '打完了。'
                    : `这一季记了 ${view.boss.damage} 次，还差 ${view.boss.remaining} 次。`}
                </Text>
              </Card>
            </View>
          ) : null}

          {/* ---- 这个月的主题 ---- */}
          {view.event ? (
            <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
              <Text
                style={{
                  marginBottom: theme.spacing.sm,
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  fontWeight: theme.typography.weight.semibold,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                这个月
              </Text>

              <Card>
                <Text
                  style={{
                    fontSize: theme.typography.size.body,
                    lineHeight: theme.typography.lineHeight.body,
                    color: palette.text,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  {view.event.theme}
                </Text>

                {/* 三个方向。不是任务：没有圈、没有勾、不计进度 */}
                {view.event.goals.map((goal) => (
                  <Text
                    key={goal}
                    style={{
                      marginTop: theme.spacing.sm,
                      fontSize: theme.typography.size.caption,
                      lineHeight: theme.typography.lineHeight.body,
                      color: palette.textMuted,
                      fontFamily: theme.typography.fontFamily.body,
                    }}
                  >
                    · {goal}
                  </Text>
                ))}

                <Text
                  style={{
                    marginTop: theme.spacing.sm,
                    fontSize: theme.typography.size.caption,
                    lineHeight: theme.typography.lineHeight.caption,
                    color: palette.textMuted,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  {view.eventQualified
                    ? `这个月已经有记录了，月末会收到 ${view.event.rewardMaterial} 个材料。`
                    : `这个月记过一件就会收到 ${view.event.rewardMaterial} 个材料。不用领取。`}
                </Text>
              </Card>
            </View>
          ) : null}

          <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              故事按累计记录天数解锁。中间空了几天，已经读到的不会退回去。
            </Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}
