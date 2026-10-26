import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { MONTH_NOTE_MAX } from '../../src/domain/monthReview';
import { getMonthReviewView, saveMonthReview, type MonthReviewView } from '../../src/services/monthReview';
import { useExportCard } from '../../src/services/exportImage';
import { buildMonthCard } from '../../src/services/exportCards';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 月复盘（阶段 3 第 3 条）。
 *
 * ---- 这一页是「看」的，不是「写」的 ----
 *
 * 周复盘是三个问题一张空白的纸；月复盘反过来：
 * 先把这一个月摆出来（有几天动过、五维涨了多少、目标进展），
 * 最后只留一句「这个月想说的」，可写可不写。
 *
 * 为什么不在月复盘里再问三个问题：周复盘一个月问四次，
 * 月末再来三个，一个月就要写八个。复盘的目的是让人**愿意回头看**，
 * 而不是让他多填几个框。
 *
 * ---- 不做什么 ----
 *
 * 不做跨月对比（「比上个月少记了 12 次」是一句评判，而且它的另一端
 * 永远指向「你在退步」）、不做完成率、不做目标达成率。
 *
 * 五维的**变化**是唯一保留的「对比」：它回答「这一个月我把时间花在哪几维」，
 * 而「心智涨了 12 点」没有好坏。
 */
export default function MonthReviewScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [view, setView] = useState<MonthReviewView | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);

  /** 导出这一月的卡片。`host` 要渲染在本页，否则离屏节点不存在 */
  const { exportAndShare, host: exportHost } = useExportCard();
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    try {
      const next = getMonthReviewView();
      setView(next);
      setNote(next.note);
      setError(false);
    } catch (err) {
      console.warn('[Ember] 读取月复盘失败', err);
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

  const handleSave = () => {
    if (!view?.monthKey) return;
    try {
      const result = saveMonthReview(view.monthKey, note);
      if (!result.ok) return;
      setSavedOnce(true);
      refresh();
      handleBack();
    } catch (err) {
      console.warn('[Ember] 保存月复盘失败', err);
      setError(true);
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
          accessibilityLabel="返回"
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
          月复盘
        </Text>

        {view?.monthKey ? (
          <Text
            style={{
              marginTop: theme.spacing.xs,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {view.label}
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

      {view && !view.monthKey ? (
        <Card style={{ marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.pageX }}>
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            最近两个月都写过了。
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
            下个月过完之后，这里会再出现一份。
          </Text>
        </Card>
      ) : null}

      {view?.monthKey ? (
        <>
          {/* 一句话摘要 */}
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
              这个月
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
              {view.summary ?? ''}
            </Text>
          </Card>

          {/* 五维变化：这个月每一维涨了多少点。点数为 0 的不列 */}
          {view.stats.attributeGains.length > 0 ? (
            <Card style={{ marginTop: theme.spacing.cardGap, marginHorizontal: theme.spacing.pageX }}>
              <Text
                style={{
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  fontWeight: theme.typography.weight.semibold,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                五维这个月涨了多少
              </Text>
              {view.stats.attributeGains.map((item) => (
                <View
                  key={item.label}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginTop: theme.spacing.xs,
                  }}
                >
                  <Text
                    style={{
                      fontSize: theme.typography.size.body,
                      lineHeight: theme.typography.lineHeight.body,
                      color: palette.text,
                      fontFamily: theme.typography.fontFamily.body,
                    }}
                  >
                    {item.label}
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
                    +{item.gained} 点
                  </Text>
                </View>
              ))}
            </Card>
          ) : null}

          {/* 目标进展。两个数，不做达成率 */}
          {view.stats.goalsActive > 0 || view.stats.goalsDoneThisMonth > 0 ? (
            <Card style={{ marginTop: theme.spacing.cardGap, marginHorizontal: theme.spacing.pageX }}>
              <Text
                style={{
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  fontWeight: theme.typography.weight.semibold,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                目标
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
                {view.stats.goalsDoneThisMonth > 0
                  ? `这个月收起了 ${view.stats.goalsDoneThisMonth} 个，还有 ${view.stats.goalsActive} 个在进行。`
                  : `还有 ${view.stats.goalsActive} 个在进行。`}
              </Text>
            </Card>
          ) : null}

          {/* 一句想说的。可写可不写 */}
          <Card style={{ marginTop: theme.spacing.cardGap, marginHorizontal: theme.spacing.pageX }}>
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              这个月想说的
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="一句话就够。不写也可以。"
              placeholderTextColor={palette.textMuted}
              maxLength={MONTH_NOTE_MAX}
              multiline
              textAlignVertical="top"
              accessibilityLabel="这个月想说的"
              style={{
                marginTop: theme.spacing.xs,
                minHeight: theme.typography.lineHeight.body * 3,
                paddingVertical: theme.spacing.xs,
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.body,
              }}
            />
          </Card>

          <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={view.written ? '改一下' : '存下来'}
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
                {savedOnce ? '存好了' : view.written ? '改一下' : '存下来'}
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
              这一句可以空着。空着就是这一个月不写，不会留一条空白记录。
            </Text>

            {/*
             * 存成图片。与周报同一条路（services/exportImage），
             * 只是内容换成这张月报卡。放在保存按钮下面：先存下来，再分享。
             */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="把这个月存成图片"
              accessibilityState={{ disabled: exporting }}
              onPress={() => {
                if (exporting) return;
                setExporting(true);
                setExportNotice(null);
                void (async () => {
                  try {
                    // 先把当前输入存下来，否则卡上是上次保存的版本
                    if (view.monthKey) saveMonthReview(view.monthKey, note);
                    const { card, monthKey } = buildMonthCard();
                    const result = await exportAndShare({
                      data: card,
                      prefix: 'month',
                      key: monthKey ?? 'current',
                    });
                    setExportNotice(result.message);
                  } catch (err) {
                    console.warn('[Ember] 导出月报图失败', err);
                    setExportNotice('这张卡没能生成，稍后再试一次。');
                  } finally {
                    setExporting(false);
                  }
                })();
              }}
              disabled={exporting}
              style={({ pressed }) => ({
                marginTop: theme.spacing.md,
                minHeight: 52,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.button,
                borderWidth: 1,
                borderColor: palette.primary,
                opacity: exporting ? 0.5 : pressed ? 0.6 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: theme.typography.size.body,
                  lineHeight: theme.typography.lineHeight.body,
                  fontWeight: theme.typography.weight.medium,
                  color: palette.primary,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {exporting ? '正在生成…' : '存成图片'}
              </Text>
            </Pressable>

            {exportNotice ? (
              <Text
                accessibilityRole="alert"
                style={{
                  marginTop: theme.spacing.md,
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {exportNotice}
              </Text>
            ) : null}
          </View>
        </>
      ) : null}

      {/* 离屏导出卡片的挂载点。必须在本页，且不占版面 */}
      {exportHost}
    </ScrollView>
  );
}
