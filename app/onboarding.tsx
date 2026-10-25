import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../src/components/Card';
import { createTask } from '../src/db/repo/tasks';
import { markOnboardingDone } from '../src/db/repo/player';
import { businessDate } from '../src/domain/date';
import { guessAttribute } from '../src/domain/task-templates';
import { getSafeDayStartHour } from '../src/services/today';
import { useTheme } from '../src/theme/ThemeProvider';

/**
 * 首次启动引导（阶段 6 第 6 条）。
 *
 * ---- 目标：90 秒内拿到第一个奖励 ----
 *
 * 四屏，一条主路径，没有分支：
 *   1. 这是什么（一句话）
 *   2. 先从哪件小事开始（选 1–3 个模板，默认选中「喝一杯水」）
 *   3. 先选温和的（难度说明，默认轻松，**不需要选**）
 *   4. 回到今天页，点一下就算完成
 *
 * ---- 明确不做（docs/02 §5.1 的「禁止」）----
 *
 * 注册、手机号、长问卷、性格测试、一上来就付费墙。
 * 还有一条这份文档没写但同样重要：**不问「你想养成几个习惯」**。
 * 那个数字会被当成一个承诺，而承诺是坚持最大的敌人。
 *
 * ---- 为什么第 3 屏「不需要选」----
 *
 * 难度是这一版唯一有真实后果的设置（宽限券数量、修复成本）。
 * 但新用户还不知道自己会怎么用，让他选等于让他猜。
 * 所以默认轻松，只把「之后随时能改」说清楚——那一句是这一屏的全部内容。
 *
 * ---- 为什么第 4 屏不是一屏，而是回到今天页 ----
 *
 * 引导的终点必须是**真的做成了一件事**，而不是读完四屏字。
 * 所以第 4 屏不是一个页面，而是今天页上的一行提示。
 * 这一页只负责把用户送到那里。
 */
export default function OnboardingScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /** 当前在第几屏（0–2，第 3 屏是今天页的事） */
  const [step, setStep] = useState(0);
  /** 选中的模板索引。默认第 0 个（「喝一杯水」） */
  const [picked, setPicked] = useState<number[]>([0]);
  const [error, setError] = useState<string | null>(null);

  /**
   * 可选的三件小事。
   *
   * 为什么只有三个而不是八个（docs/02 §5.1 写的是 8 个）：
   * 一屏放 8 个会让「选一个」变成「挑一挑」，而这一步要的是「随手点一个就往下走」。
   * 三个是「一眼看完、不用比较」的数量。
   */
  const choices = [
    { title: '喝一杯水', hint: '最容易开始的一件' },
    { title: '睡前读 10 页', hint: '安静下来的那一段' },
    { title: '整理桌面', hint: '五分钟就能做完' },
  ];

  const toggle = useCallback((index: number) => {
    setPicked((prev) => {
      if (prev.includes(index)) {
        // 至少留一个：全不选会让下一步变成「什么都没建」
        return prev.length === 1 ? prev : prev.filter((item) => item !== index);
      }
      // 最多三个
      return prev.length >= 3 ? prev : [...prev, index];
    });
  }, []);

  /**
   * 建好选中的任务，标记引导完成，回到今天页。
   *
   * 顺序很重要：**先建任务，再标记完成**。
   * 反过来的话，建任务失败时引导已经标记为完成，用户再也看不到它了，
   * 而他的今天页是空的——那是最糟的第一印象。
   */
  const finish = useCallback(() => {
    try {
      const today = businessDate(Date.now(), getSafeDayStartHour());
      for (const index of picked) {
        const choice = choices[index];
        if (!choice) continue;
        createTask({
          title: choice.title,
          type: 'habit',
          // 属性由名字猜（与新建任务页同一套规则）。五维纯展示，猜错也不影响数值。
          attribute: guessAttribute(choice.title),
          startDate: today,
        });
      }
      markOnboardingDone();
      setError(null);
      // 回到今天页。用 replace 而不是 push：引导不该留在返回栈里
      router.replace('/');
    } catch (err) {
      console.warn('[Ember] 引导建任务失败', err);
      setError('刚才没建上，再试一次。');
    }
  }, [picked, router]);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        flexGrow: 1,
        paddingTop: insets.top + theme.spacing.xxl,
        paddingBottom: insets.bottom + theme.spacing.xl,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ flex: 1, paddingHorizontal: theme.spacing.pageX }}>
        {step === 0 ? (
          <>
            <Text
              style={{
                marginTop: theme.spacing.xxl,
                fontSize: theme.typography.size.title,
                lineHeight: theme.typography.lineHeight.title,
                fontWeight: theme.typography.weight.semibold,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.title,
              }}
            >
              这是你的火堆。
            </Text>
            <Text
              style={{
                marginTop: theme.spacing.sm,
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              它不需要你每天做很多。记下一件小事，火就旺一点。
            </Text>
            <Text
              style={{
                marginTop: theme.spacing.md,
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              没有账号，没有服务器，也没有排行榜。这些记录只在这台手机上。
            </Text>
          </>
        ) : null}

        {step === 1 ? (
          <>
            <Text
              style={{
                fontSize: theme.typography.size.title,
                lineHeight: theme.typography.lineHeight.title,
                fontWeight: theme.typography.weight.semibold,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.title,
              }}
            >
              先从哪件小事开始？
            </Text>
            <Text
              style={{
                marginTop: theme.spacing.sm,
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              选一到三个。以后随时能加、能删、能改。
            </Text>

            <View style={{ marginTop: theme.spacing.xl }}>
              {choices.map((choice, index) => {
                const selected = picked.includes(index);
                return (
                  <Card key={choice.title} style={{ marginBottom: theme.spacing.cardGap }} padding={0}>
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={`${choice.title}。${choice.hint}`}
                      onPress={() => toggle(index)}
                      style={({ pressed }) => ({
                        flexDirection: 'row',
                        alignItems: 'center',
                        minHeight: 64,
                        paddingVertical: theme.spacing.md,
                        paddingHorizontal: theme.spacing.cardPadding,
                        opacity: pressed ? 0.55 : 1,
                      })}
                    >
                      <View
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          marginRight: theme.spacing.md,
                          backgroundColor: selected ? palette.primary : 'transparent',
                          borderWidth: selected ? 0 : 1.5,
                          borderColor: palette.secondary,
                        }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={{
                            fontSize: theme.typography.size.body,
                            lineHeight: theme.typography.lineHeight.body,
                            color: palette.text,
                            fontFamily: theme.typography.fontFamily.body,
                          }}
                        >
                          {choice.title}
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
                          {choice.hint}
                        </Text>
                      </View>
                    </Pressable>
                  </Card>
                );
              })}
            </View>
          </>
        ) : null}

        {step === 2 ? (
          <>
            <Text
              style={{
                fontSize: theme.typography.size.title,
                lineHeight: theme.typography.lineHeight.title,
                fontWeight: theme.typography.weight.semibold,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.title,
              }}
            >
              先选温和的。
            </Text>
            <Text
              style={{
                marginTop: theme.spacing.sm,
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              之后随时能改。温和这一档不扣任何东西，断了一天也能接上。
            </Text>
          </>
        ) : null}

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
      </View>

      {/* 底部按钮。一屏只有一个动作，没有「跳过」——
          跳过会让用户直接进到一个空页面，那不是更好的体验 */}
      <View style={{ paddingHorizontal: theme.spacing.pageX, marginTop: theme.spacing.xl }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={step === 2 ? '开始记录' : '下一步'}
          onPress={() => {
            if (step < 2) setStep(step + 1);
            else finish();
          }}
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
            {step === 2 ? '开始' : '下一步'}
          </Text>
        </Pressable>

        {/* 进度点。三个小点，不用「1 / 3」那种计数 */}
        <View
          style={{
            marginTop: theme.spacing.md,
            flexDirection: 'row',
            justifyContent: 'center',
            columnGap: theme.spacing.xs,
          }}
        >
          {[0, 1, 2].map((index) => (
            <View
              key={index}
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: index === step ? palette.primary : palette.border,
              }}
            />
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
