import React, { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Card } from './Card';
import { useTheme } from '../theme/ThemeProvider';
import { getGraceRemaining, getRepairStatus, repairStreak } from '../services/streak';

/**
 * 连胜修复卡（我的页）。
 *
 * ---- 它什么时候出现 ----
 *
 * 三种状态，对应三种界面：
 *   1. **没断**：整张卡不画。对没断的人来说，「修复」是一个没有意义的问题。
 *   2. **断了、还能修**：说清「空档有几天」「要花多少」「还剩多久」，给一个按钮。
 *   3. **断了、修不了**：说清为什么（过期了 / 余烬不够），**不给按钮**。
 *
 * 第 3 种里「过期」这一档要说一句话而不是默默消失——功能悄悄不见
 * 会让用户以为它被移除了，而实际上是他自己错过了窗口。
 *
 * ---- 为什么文案里没有「失败」「前功尽弃」----
 *
 * 断签本身已经是一个不愉快的事实。这张卡的任务是**提供一个出口**，
 * 不是描述后果。所以：
 *   - 说「这一段有 3 天空着」，不说「你断了 3 天」；
 *   - 说「修复之后连胜接上」，不说「挽救你的连胜」；
 *   - 修不了时说「从这里重新数也可以，历史都还在」——这是事实，也是立场。
 *
 * ---- 为什么显示「还剩几张宽限券」----
 *
 * 宽限券是自动用的，用户看不见它什么时候被消耗。在这里显示余额，
 * 是让那件事有一个可见的落点：月底发现「还剩 0 张」时，
 * 用户至少能回想起「哦，那几天被自动补掉了」。
 */
export function StreakRepairCard({ onRepaired }: { onRepaired?: () => void }) {
  const { theme, palette } = useTheme();

  /**
   * 状态在渲染时读一次。
   *
   * 读库失败时 status 为 null，整张卡不画：修复入口是「出问题时的出口」，
   * 而读库本身出问题时，画一个可能算错的修复按钮比不画更危险
   * （用户可能为此花掉余烬）。
   */
  const [status] = useState(() => {
    try {
      return getRepairStatus();
    } catch (err) {
      console.warn('[Ember] 读取连胜修复状态失败', err);
      return null;
    }
  });

  const [grace] = useState(() => getGraceRemaining());
  const [busy, setBusy] = useState(false);
  /** 修复失败时的一句话（比如余烬不够） */
  const [notice, setNotice] = useState<string | null>(null);

  const handleRepair = useCallback(() => {
    if (busy || !status) return;

    const days = status.gapDates.length;
    const costText =
      status.cost.material > 0
        ? `${status.cost.ember} 余烬和 ${status.cost.material} 个材料`
        : `${status.cost.ember} 余烬`;

    Alert.alert(
      '把这一段接上？',
      `会花掉 ${costText}。修好之后这 ${days} 天算作连着，连胜接上。`,
      [
        { text: '算了', style: 'cancel' },
        {
          text: '接上',
          onPress: () => {
            setBusy(true);
            setNotice(null);
            try {
              const outcome = repairStreak();
              if (!outcome.ok) {
                setNotice(outcome.message);
                return;
              }
              // 修好之后重读这一页（连胜、余烬都变了）
              onRepaired?.();
            } catch (err) {
              console.warn('[Ember] 修复连胜失败', err);
              setNotice('刚才没修上，再试一次。');
            } finally {
              setBusy(false);
            }
          },
        },
      ]
    );
  }, [busy, status, onRepaired]);

  // 没断 / 读不出来 → 整张卡不画
  if (!status || !status.broken) return null;

  const days = status.gapDates.length;

  return (
    <Card style={{ marginTop: theme.spacing.cardGap }}>
      <Text
        style={{
          fontSize: theme.typography.size.caption,
          lineHeight: theme.typography.lineHeight.caption,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        这一段
      </Text>

      {/* 事实：空着几天。不评价，只说数 */}
      <Text
        style={{
          marginTop: 2,
          fontSize: theme.typography.size.body,
          lineHeight: theme.typography.lineHeight.body,
          color: palette.text,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {days === 1 ? '有 1 天空着。' : `有 ${days} 天空着。`}
      </Text>

      {status.repairable ? (
        <>
          <Text
            style={{
              marginTop: theme.spacing.xs,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {status.cost.material > 0
              ? `花 ${status.cost.ember} 余烬和 ${status.cost.material} 个材料，可以把这一段接上。`
              : `花 ${status.cost.ember} 余烬，可以把这一段接上。`}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`用 ${status.cost.ember} 余烬把这一段接上`}
            accessibilityState={{ disabled: busy }}
            onPress={handleRepair}
            disabled={busy}
            style={({ pressed }) => ({
              marginTop: theme.spacing.sm,
              alignSelf: 'flex-start',
              minHeight: theme.touchTarget,
              justifyContent: 'center',
              opacity: busy ? 0.5 : pressed ? 0.55 : 1,
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
              {busy ? '正在接上…' : '把这一段接上'}
            </Text>
          </Pressable>
        </>
      ) : (
        /* 修不了：说清为什么，并给一句立场（历史都还在） */
        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {status.reason === 'deadline_passed'
            ? '修复的时间已经过去了。从这里重新数也可以，历史最佳和累计都还在。'
            : status.reason === 'insufficient_ember'
              ? `余烬还不够（要 ${status.cost.ember}）。从这里重新数也可以，历史都还在。`
              : status.reason === 'insufficient_material'
                ? `材料还不够（要 ${status.cost.material} 个）。从这里重新数也可以，历史都还在。`
                : '这一段暂时接不上。从这里重新数也可以，历史都还在。'}
        </Text>
      )}

      {/* 宽限券余额。只在还有额度时提一句，用完了不反复提醒 */}
      {grace.total > 0 && grace.remaining > 0 ? (
        <Text
          style={{
            marginTop: theme.spacing.sm,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          这个月还有 {grace.remaining} 张宽限券，漏一天时会自动用掉一张。
        </Text>
      ) : null}

      {notice ? (
        <Text
          accessibilityRole="alert"
          style={{
            marginTop: theme.spacing.sm,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.danger,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {notice}
        </Text>
      ) : null}
    </Card>
  );
}
