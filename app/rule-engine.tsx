import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../src/components/Card';
import { breakdownTask, gentleReview, type GentleReview } from '../src/domain/ruleEngine';
import { getGentleReviewInput } from '../src/services/narrative';
import { useTheme } from '../src/theme/ThemeProvider';

/**
 * 温柔复盘 + 任务拆解（阶段 5 第 6 条，「本地规则引擎」）。
 *
 * ---- 为什么叫这个名字，不叫 AI ----
 *
 * 它不联网、不需要 Key、不申请网络权限（docs/02 §7.1）。
 * 界面上不标注「AI 生成」，因为它本来就不是——直接叫功能名。
 *
 * ---- 两个功能各占一半 ----
 *
 * 上半是「温柔复盘」：读最近 7 天，给三句话（一个模式、一件值得留着的、
 * 一个下周可试的微调）。它**不改任何数据**，只是把已有的数字说成人话。
 *
 * 下半是「任务拆解」：输入一件拖着没做的事，给三个 15 分钟内能完成的第一步。
 * 它**不创建任务**——用户看完可以自己去「今天」页加，但这一页不替他加。
 * 这个界限很重要：自动创建任务是「App 替你决定」，而这个 App 不替人决定。
 */
export default function RuleEngineScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /** 复盘的三段话。null 表示还没算 */
  const [review, setReview] = useState<GentleReview | null>(null);
  const [reviewError, setReviewError] = useState(false);

  /** 任务拆解的输入与结果 */
  const [title, setTitle] = useState('');
  const [steps, setSteps] = useState<string[] | null>(null);

  const refresh = useCallback(() => {
    try {
      const input = getGentleReviewInput();
      setReview(gentleReview(input));
      setReviewError(false);
    } catch (err) {
      console.warn('[Ember] 生成温柔复盘失败', err);
      setReviewError(true);
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
          accessibilityLabel="返回回忆"
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
          看看最近
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
          这些都是用内置模板算出来的，不联网，也不会改你的记录。
        </Text>
      </View>

      {/* ---- 温柔复盘 ---- */}
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
          最近七天
        </Text>

        {reviewError ? (
          <Card>
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              这几天的记录暂时读不出来。
            </Text>
          </Card>
        ) : review ? (
          <>
            <Card style={{ marginBottom: theme.spacing.cardGap }}>
              <Text
                style={{
                  fontSize: theme.typography.size.body,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {review.pattern}
              </Text>
            </Card>
            <Card style={{ marginBottom: theme.spacing.cardGap }}>
              <Text
                style={{
                  fontSize: theme.typography.size.body,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {review.keep}
              </Text>
            </Card>
            <Card>
              <Text
                style={{
                  fontSize: theme.typography.size.body,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {review.tweak}
              </Text>
            </Card>
          </>
        ) : null}
      </View>

      {/* ---- 任务拆解 ---- */}
      <View style={{ marginTop: theme.spacing.xxl, paddingHorizontal: theme.spacing.pageX }}>
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
          拆一件事
        </Text>

        <Card>
          <TextInput
            value={title}
            onChangeText={(next) => {
              setTitle(next);
              // 改了输入就把旧结果清掉：不然会看到「拆的是上一件事」
              if (steps) setSteps(null);
            }}
            placeholder="一件拖着没做的事"
            placeholderTextColor={palette.textMuted}
            maxLength={80}
            returnKeyType="done"
            onSubmitEditing={() => setSteps(breakdownTask(title))}
            accessibilityLabel="一件拖着没做的事"
            style={{
              minHeight: theme.touchTarget,
              paddingVertical: theme.spacing.sm,
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.body,
              borderBottomWidth: 1,
              borderBottomColor: palette.rule,
            }}
          />

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="拆成三个第一步"
            onPress={() => setSteps(breakdownTask(title))}
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
              拆成三个第一步
            </Text>
          </Pressable>
        </Card>

        {steps ? (
          <View style={{ marginTop: theme.spacing.sm }}>
            {steps.map((step, index) => (
              <Card key={`${index}-${step}`} style={{ marginBottom: theme.spacing.cardGap }}>
                <View style={{ flexDirection: 'row' }}>
                  <Text
                    style={{
                      marginRight: theme.spacing.md,
                      fontSize: theme.typography.size.body,
                      lineHeight: theme.typography.lineHeight.body,
                      color: palette.textMuted,
                      fontFamily: theme.typography.fontFamily.body,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {index + 1}
                  </Text>
                  <Text
                    style={{
                      flex: 1,
                      fontSize: theme.typography.size.body,
                      lineHeight: theme.typography.lineHeight.body,
                      color: palette.text,
                      fontFamily: theme.typography.fontFamily.body,
                    }}
                  >
                    {step}
                  </Text>
                </View>
              </Card>
            ))}

            <Text
              style={{
                marginTop: theme.spacing.xs,
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              这三步都是十五分钟内能做完的。做完第一步就可以停。
            </Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}
