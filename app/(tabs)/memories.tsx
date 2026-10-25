import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { StageNote } from '../../src/components/StageNote';
import { hasUnwrittenLastWeek, listReviewHistory, type ReviewHistoryItem } from '../../src/services/review';
import {
  listMonthReviewHistory,
  offeredMonthReview,
  type MonthHistoryItem,
} from '../../src/services/monthReview';
import { listMilestones, type Milestone } from '../../src/services/narrative';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 回忆页。
 *
 * ---- 这一页现在有什么 ----
 *
 * 阶段 3 第 2 条（周复盘）落地之后，这里第一次有了真内容：
 * **按周倒序的复盘记录**。每一张卡是一周，卡里是用户自己写过的那几句话。
 *
 * ---- 为什么复盘放在回忆页，而不是单独一个 tab ----
 *
 * 底栏四个 tab 回答的是「今天要做什么」（D17）。复盘是回头看的，
 * 而回忆页的定义就是「走过的日子会留在这里」——周复盘正是其中一种。
 * 给它单独一个 tab，等于把「回顾」抬到和「今天」一样重。
 *
 * ---- 没有记录时说什么 ----
 *
 * 不说「你还没写过复盘」（那是一句欠账），而是说清这一页会变成什么，
 * 并给一个**可以现在就用**的入口。用户点进去就能写，不必先理解什么叫复盘。
 *
 * ---- 还缺什么 ----
 *
 * 时间线倒序（回忆卡、月报、纪念物）在阶段 4/5。这一版只有周复盘。
 */
export default function MemoriesScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [history, setHistory] = useState<ReviewHistoryItem[]>([]);
  const [months, setMonths] = useState<MonthHistoryItem[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  /** 上一周过完还没写。只用来决定要不要给一个安静的入口，不催 */
  const [unwritten, setUnwritten] = useState(false);
  /** 这个月到了月末那个周末、还没写。同上，不催 */
  const [monthOffer, setMonthOffer] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(() => {
    try {
      setHistory(listReviewHistory());
      setMonths(listMonthReviewHistory());
      setMilestones(listMilestones());
      setUnwritten(hasUnwrittenLastWeek());
      setMonthOffer(offeredMonthReview());
      setError(false);
    } catch (err) {
      console.warn('[Ember] 读取回忆失败', err);
      setError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.pageX,
        paddingTop: insets.top + theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xxl,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontSize: theme.typography.size.title,
          lineHeight: theme.typography.lineHeight.title,
          fontWeight: theme.typography.weight.semibold,
          color: palette.text,
          fontFamily: theme.typography.fontFamily.title,
        }}
      >
        回忆
      </Text>

      <Text
        style={{
          marginTop: theme.spacing.md,
          fontSize: theme.typography.size.body,
          lineHeight: theme.typography.lineHeight.body,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        不是成绩单，是一份记录。想不起来自己做过什么的时候，可以来这儿看看。
      </Text>

      {/* 周复盘入口。上一周还没写时给一个安静的入口，不弹窗、不加红点 */}
      <Card style={{ marginTop: theme.spacing.xl }}>
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            fontWeight: theme.typography.weight.semibold,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          周复盘
        </Text>
        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {unwritten
            ? '上一周过完了。想记两句的话，这里有一张空白的。'
            : '三个问题，五分钟。想写的时候再写，不写也不会记成欠账。'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unwritten ? '写上一周的复盘' : '写周复盘'}
          onPress={() => router.push('/review')}
          style={({ pressed }) => ({
            marginTop: theme.spacing.sm,
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
              fontWeight: theme.typography.weight.medium,
              color: palette.primary,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {unwritten ? '写上一周的' : '写一份'}
          </Text>
        </Pressable>
      </Card>

      {/* 月复盘入口。只在月末那个周末之后、且本月还没写过时出现 */}
      {monthOffer ? (
        <Card style={{ marginTop: theme.spacing.cardGap }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              fontWeight: theme.typography.weight.semibold,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            月复盘
          </Text>
          <Text
            style={{
              marginTop: theme.spacing.xs,
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            这个月快过完了。这里有一份数字和一句可以写的话。
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="写月复盘"
            onPress={() => router.push('/review/month')}
            style={({ pressed }) => ({
              marginTop: theme.spacing.sm,
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
                fontWeight: theme.typography.weight.medium,
                color: palette.primary,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              看一眼这个月
            </Text>
          </Pressable>
        </Card>
      ) : null}

      {/* 读不出来时说一句实话，而不是显示成「你什么都没写过」 */}
      {error ? (
        <Card style={{ marginTop: theme.spacing.cardGap }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {history.length > 0
              ? '刚才没读到新数据，显示的是上一次的。'
              : '这些记录暂时读不出来。'}
          </Text>
        </Card>
      ) : null}

      {/* 叙事与规则引擎入口。这两个都是「读」的东西，放在复盘入口下面 */}
      <Card style={{ marginTop: theme.spacing.cardGap }}>
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            fontWeight: theme.typography.weight.semibold,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          这一季
        </Text>
        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          一段故事、一个在等的东西、这个月的主题。按累计记录天数慢慢出来。
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <EntryLink label="去看这一季" onPress={() => router.push('/narrative')} first />
          <EntryLink label="看看最近" onPress={() => router.push('/rule-engine')} />
        </View>
      </Card>

      {/* 关键节点（阶段 5 第 4 条）。只在真的发生过时出现 */}
      {milestones.length > 0 ? (
        <View style={{ marginTop: theme.spacing.xxl }}>
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
            几个节点
          </Text>

          {milestones.map((item) => (
            <Card key={item.id} style={{ marginBottom: theme.spacing.cardGap }}>
              <Text
                style={{
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {item.date}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: theme.typography.size.body,
                  lineHeight: theme.typography.lineHeight.body,
                  fontWeight: theme.typography.weight.medium,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {item.title}
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
                {item.note}
              </Text>
            </Card>
          ))}
        </View>
      ) : null}

      {/* 月复盘历史：一月一张卡 */}
      {months.length > 0 ? (
        <View style={{ marginTop: theme.spacing.xxl }}>
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
            写过的月
          </Text>

          {months.map((item) => (
            <Card key={item.monthKey} style={{ marginBottom: theme.spacing.cardGap }}>
              <Text
                style={{
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {item.label}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: theme.typography.size.body,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {item.note}
              </Text>
            </Card>
          ))}
        </View>
      ) : null}

      {/* 复盘历史：一周一张卡 */}
      {history.length > 0 ? (
        <View style={{ marginTop: theme.spacing.xxl }}>
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
            写过的周
          </Text>

          {history.map((item) => (
            <Card key={item.weekKey} style={{ marginBottom: theme.spacing.cardGap }}>
              <Text
                style={{
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {item.rangeLabel}
              </Text>

              {item.entries.map((entry, index) => (
                <View key={`${item.weekKey}-${index}`} style={{ marginTop: theme.spacing.sm }}>
                  <Text
                    style={{
                      fontSize: theme.typography.size.caption,
                      lineHeight: theme.typography.lineHeight.caption,
                      color: palette.textMuted,
                      fontFamily: theme.typography.fontFamily.body,
                    }}
                  >
                    {entry.prompt}
                  </Text>
                  <Text
                    style={{
                      marginTop: 2,
                      fontSize: theme.typography.size.body,
                      lineHeight: theme.typography.lineHeight.body,
                      color: palette.text,
                      fontFamily: theme.typography.fontFamily.body,
                    }}
                  >
                    {entry.answer}
                  </Text>
                </View>
              ))}
            </Card>
          ))}
        </View>
      ) : (
        /* 一条复盘都没有时：不指责，只说这一页会变成什么 */
        <View style={{ marginTop: theme.spacing.xxl }}>
          <StageNote title="还没有回忆">
            写过第一份周复盘之后，它会出现在这里。所有内容都只存在这台手机上。
          </StageNote>
        </View>
      )}

      <View style={{ marginTop: theme.spacing.xxl }}>
        <StageNote title="还没做的">
          回忆卡会导出成图片（需要装 react-native-view-shot），以及材料的图鉴。
        </StageNote>
      </View>
    </ScrollView>
  );
}

/**
 * 一个文字入口。
 *
 * 与「写一份」「看看全部」同一套：纯文字、主色、44 高。
 * 放在一行里可换行：两个入口并排时，窄屏上第二个会落到下一行。
 */
function EntryLink({
  label,
  onPress,
  first = false,
}: {
  label: string;
  onPress: () => void;
  first?: boolean;
}) {
  const { theme, palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        marginLeft: first ? 0 : theme.spacing.md,
        minHeight: theme.touchTarget,
        justifyContent: 'center',
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <Text
        style={{
          fontSize: theme.typography.size.label,
          lineHeight: theme.typography.lineHeight.label,
          fontWeight: theme.typography.weight.medium,
          color: palette.primary,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
