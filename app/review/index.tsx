import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import {
  REVIEW_FREE_MAX,
  REVIEW_QUESTIONS,
  type ReviewAnswers,
} from '../../src/domain/review';
import { getReviewView, saveReview, type ReviewView } from '../../src/services/review';
import { exportWeekReport } from '../../src/services/weekReport';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 周复盘（阶段 3 第 2 条）。
 *
 * ---- 这一页的规矩 ----
 *
 * 1. **三个固定问题，不允许加字段。** 加第四个字段的代价不是多一个输入框，
 *    而是「这一次算不算写完了」这个问题会变得有歧义。
 * 2. **全部可以空着。** 这是一次「想写就写」的记录，不是一张表单。
 *    全空着点保存 = 这一周不记了（库里不会留一行）。
 * 3. **跳过不惩罚。** 这一页没有任何「你还有 X 周没写」「已连续复盘 N 周」。
 *    上周没写，这周照样是一张空白的。
 *
 * ---- 为什么先给统计再给问题 ----
 *
 * 对着三个空白框想「这周有哪件事想留着」，多数人会卡住。而先看到
 * 「这周有 4 天动过，记了 11 次，最常记的是「喝水」」，那三个问题就有了抓手。
 *
 * 统计只报事实，不报完成率（与统计页 D33 同一个立场）：
 * 「7 天里有 4 天」是评判，「有 4 天动过」是同一件事实的中性说法。
 */
export default function ReviewScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /** 这一页的数据。null 表示还没读出来 */
  const [view, setView] = useState<ReviewView | null>(null);
  const [error, setError] = useState(false);

  /** 正在编辑的答案。与 view 分开：view 是库里的事实，这是还没写下去的 */
  const [answers, setAnswers] = useState<ReviewAnswers>({
    keep: '',
    stuck: '',
    next: '',
    free: '',
  });
  const [savedOnce, setSavedOnce] = useState(false);
  /** 展开自由输入。默认收起：三个固定问题已经够填了 */
  const [freeOpen, setFreeOpen] = useState(false);
  /** 正在导出周报。期间不给点，避免连点分享两次 */
  const [exporting, setExporting] = useState(false);
  /** 导出结果的一句话 */
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    try {
      const next = getReviewView();
      setView(next);
      setAnswers(next.answers);
      setFreeOpen(next.answers.free.length > 0);
      setError(false);
    } catch (err) {
      console.warn('[Ember] 读取周复盘失败', err);
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
    else router.replace('/memories');
  };

  /**
   * 保存。
   *
   * 不做「失焦即保存」：中文输入法下候选词没选完就失焦很常见，
   * 失焦即保存会把半个拼音写进库（与资料页同一条规矩）。
   */
  const handleSave = () => {
    if (!view?.weekKey) return;
    try {
      const result = saveReview(view.weekKey, answers);
      if (!result.ok) return;
      setSavedOnce(true);
      refresh();
      // 存完就回去：这一页是一次性的动作，不是要停留的地方
      handleBack();
    } catch (err) {
      console.warn('[Ember] 保存周复盘失败', err);
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
          周复盘
        </Text>

        {view?.weekKey ? (
          <Text
            style={{
              marginTop: theme.spacing.xs,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {view.rangeLabel}
          </Text>
        ) : null}
      </View>

      {/* 读不出来时说一句实话，不假装「这周没记录」 */}
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

      {/* 最近两周都写过了：不催，只说一句实话 */}
      {view && !view.weekKey ? (
        <Card style={{ marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.pageX }}>
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            最近两周都写过了。
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
            下一周过完之后，这里会再出现一张空白的。
          </Text>
        </Card>
      ) : null}

      {view?.weekKey ? (
        <>
          {/* 先给统计，让三个问题有抓手 */}
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
              这一周
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

            {/* 花在哪几维。只在有记录时出现 */}
            {view.stats.attributes.length > 0 ? (
              <Text
                style={{
                  marginTop: theme.spacing.xs,
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                时间花在：{view.stats.attributes.join('、')}
              </Text>
            ) : null}
          </Card>

          {/* 三个固定问题，每个一张卡 */}
          {REVIEW_QUESTIONS.map((question) => (
            <Card
              key={question.key}
              style={{ marginTop: theme.spacing.cardGap, marginHorizontal: theme.spacing.pageX }}
            >
              <Text
                style={{
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {question.prompt}
              </Text>
              <TextInput
                value={answers[question.key]}
                onChangeText={(next) =>
                  setAnswers((prev) => ({ ...prev, [question.key]: next }))
                }
                placeholder={question.placeholder}
                placeholderTextColor={palette.textMuted}
                maxLength={question.maxLength}
                multiline
                textAlignVertical="top"
                accessibilityLabel={question.prompt}
                style={{
                  marginTop: theme.spacing.xs,
                  minHeight: theme.typography.lineHeight.body * 2,
                  paddingVertical: theme.spacing.xs,
                  fontSize: theme.typography.size.body,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              />
            </Card>
          ))}

          {/* 自由输入。默认收起——三个固定问题已经够填了 */}
          <Card style={{ marginTop: theme.spacing.cardGap, marginHorizontal: theme.spacing.pageX }}>
            {freeOpen ? (
              <>
                <Text
                  style={{
                    fontSize: theme.typography.size.caption,
                    lineHeight: theme.typography.lineHeight.caption,
                    color: palette.textMuted,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  还想说的
                </Text>
                <TextInput
                  value={answers.free}
                  onChangeText={(next) => setAnswers((prev) => ({ ...prev, free: next }))}
                  placeholder="随便写点什么，不写也可以。"
                  placeholderTextColor={palette.textMuted}
                  maxLength={REVIEW_FREE_MAX}
                  multiline
                  textAlignVertical="top"
                  autoFocus
                  accessibilityLabel="还想说的"
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
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="再写一段"
                onPress={() => setFreeOpen(true)}
                style={({ pressed }) => ({
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
                  再写一段
                </Text>
              </Pressable>
            )}
          </Card>

          {/* 保存。文案按「写过没有」变，不按「有没有改动」变 */}
          <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={view.written ? '改一下' : '写下来'}
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
                {savedOnce ? '存好了' : view.written ? '改一下' : '写下来'}
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
              三个问题都可以空着。全空着就是这一周不记了，不会留一条空白记录。
            </Text>
          </View>

          {/*
           * 导出周报。
           *
           * 这一版导出的是**文字**（D39）：图片版要 react-native-view-shot，
           * 而它还没装。文字版已经能「把这周小结发给自己」，且零新依赖、
           * 零新权限——而新权限会直接撞上「不申请网络/存储权限」那条硬约束。
           */}
          <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="导出这一周的周报"
              accessibilityState={{ disabled: exporting }}
              onPress={() => {
                if (exporting) return;
                setExporting(true);
                setExportNotice(null);
                void exportWeekReport()
                  .then((result) => setExportNotice(result.message))
                  .catch(() => setExportNotice('没能导出来，稍后再试一次。'))
                  .finally(() => setExporting(false));
              }}
              disabled={exporting}
              style={({ pressed }) => ({
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
                {exporting ? '正在写…' : '导出这一周'}
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
    </ScrollView>
  );
}
