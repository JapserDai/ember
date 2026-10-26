import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { countCheckinsInRange } from '../../src/db/repo/checkins';
import { getPlayerSnapshot, type PlayerSnapshot } from '../../src/db/repo/player';
import {
  ATTRIBUTE_KEYS,
  ATTRIBUTE_LABEL,
  ATTR_POINTS_MAX,
  ATTR_XP_PER_POINT,
  MAX_LEVEL,
  xpToNextLevel,
} from '../../src/domain/balance';
import { addDays, businessDate } from '../../src/domain/date';
import { highestTitles, nextTitles, titleProgress, TITLES } from '../../src/domain/titles';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 状态页（D48：照抄人升 LifeUp 的「状态」页）。
 *
 * ---- 这一页是什么 ----
 *
 * 人升的「状态」页从上到下是三段：**人生等级**（一条全局经验条）→
 * 属性列表（每行：名字 + LV + 进度条 + 百分比 + 分数）→ 其他模块。
 * 这一页照抄的就是这个结构，内容换成 Ember 已有的数据。
 *
 * ---- 为什么五维从「我的」页搬到了这里 ----
 *
 * 用户的原话是「既然人升的『状态』= 属性页，那就把五维删除」。
 * 落到实现上是**搬家而不是删除**：
 *   - 五维是 Ember 里唯一「看自己走到哪了」的东西，删掉就没什么可看的了；
 *   - 但「我的」页原本已经有了等级、经验、余烬、连胜、五维、称号，
 *     一页里塞了七种东西，反而没有一个地方专门回答「我长成什么样了」。
 *
 * 所以分工变成：
 *   - **状态页**：等级 + 五维 + 称号 —— 「我走到了哪里」；
 *   - **我的页**：头像 + 名字 + 余烬 + 连胜 + 入口 —— 「我是谁、我有什么」。
 *
 * 数据一个字段都没改，只是读取它们的地方多了一页。
 *
 * ---- 属性等级怎么算（这一条最容易误会）----
 *
 * 人升的属性 LV 是「这一维自己的等级」。Ember 存了两列：
 *   - `points`：每满 `ATTR_XP_PER_POINT`（200）点属性经验换来的**累计点数**；
 *   - `xp`：不够 200 的**余数**。
 *
 * 所以「这一维的总经验」= `points × 200 + xp`，而等级 = `points + 1`
 * （0 点就是 1 级）。**这不是新加的数值**，只是把已有的两列按人升的方式
 * 重新读一遍——不需要迁移，也不会改变任何结算。
 *
 * 显示上的 `xp / 200` 用的是余数，与进度条同一个口径：
 * 进度条走满的那一下，正好是「攒够 200、换成 1 点」的那一下。
 *
 * ---- D7：这些数字不参与任何计分 ----
 *
 * 属性仍然是**纯展示**（DECISIONS D7）。这一页不 import `score.ts`、
 * 不写 `player` 的任何列。加属性点只发生在打卡与撤销里（`services/checkin.ts`），
 * 这里只读。以后若有人想「让属性加成影响经验」，先读 D7 与 D48。
 *
 * ---- 为什么数字都读得出来才画 ----
 *
 * 读库失败时显示的是「暂时读不出来」，不是「0」。0 是一句假话，
 * 而用户会把它当成真的（断签后绝不出现 0，是同一套规矩）。
 */

/** 属性行要的全部数据 */
interface AttributeRow {
  key: (typeof ATTRIBUTE_KEYS)[number];
  label: string;
  /** 这一维的等级。0 点 = 1 级 */
  level: number;
  /** 不够 200 的余数 */
  xp: number;
  /** 已攒够的整点数（0–99） */
  points: number;
  /** 进度条：余数 / 200 */
  progress: number;
}

/** 状态页需要的全部数据 */
interface StatusView {
  level: number;
  xpInLevel: number;
  /** 升到下一级还要多少。满级是 0 */
  xpForNext: number;
  /** 进度条：级内进度 / 本级所需 */
  xpProgress: number;
  /** 累计记录次数（有效打卡，含撤销掉的？不含——撤销的 status 不是 active） */
  totalRecords: number;
  attributes: AttributeRow[];
  /** 已拿到的称号名（每维只取最高的那一档） */
  earnedTitles: string[];
  /** 下一档称号的提示。全都拿满时是空数组 */
  nextTitleHints: Array<{ label: string; remaining: number }>;
  /** 已解锁 / 总数，只用于页尾一行小字 */
  unlockedTitles: number;
  totalTitles: number;
}

/**
 * 从玩家快照装配这一页。
 *
 * 纯读，没有任何写操作。抽成函数是为了让它能被仓库外的测试直接调用
 * （那套测试跑在 Node 里，不渲染 React）。
 */
export function buildStatusView(player: PlayerSnapshot, totalRecords: number): StatusView {
  const attributes: AttributeRow[] = ATTRIBUTE_KEYS.map((key) => {
    const attr = player.attributes[key];
    // 点数在库里没有 99 的上限约束（只有代码里的钳制），这里再兜一次：
    // 脏数据不该把进度条撑到 100% 以上。
    const points = Math.min(ATTR_POINTS_MAX, Math.max(0, Math.trunc(attr.points)));
    const xp = Math.max(0, Math.trunc(attr.xp));
    return {
      key,
      label: ATTRIBUTE_LABEL[key],
      level: points + 1,
      xp,
      points,
      progress: Math.min(1, xp / ATTR_XP_PER_POINT),
    };
  });

  const pointsMap = {} as Record<(typeof ATTRIBUTE_KEYS)[number], number>;
  for (const key of ATTRIBUTE_KEYS) {
    pointsMap[key] = Math.min(ATTR_POINTS_MAX, Math.max(0, player.attributes[key].points));
  }

  const xpForNext = xpToNextLevel(player.level, player.xpInLevel);
  const xpProgress = xpForNext > 0 ? Math.min(1, player.xpInLevel / xpForNext) : 1;

  return {
    level: player.level,
    xpInLevel: player.xpInLevel,
    xpForNext,
    xpProgress,
    totalRecords: Math.max(0, Math.trunc(totalRecords)),
    attributes,
    earnedTitles: highestTitles(pointsMap).map((title) => title.name),
    nextTitleHints: nextTitles(pointsMap)
      .slice(0, 3)
      .map((item) => ({ label: ATTRIBUTE_LABEL[item.title.attribute], remaining: item.remaining })),
    unlockedTitles: titleProgress(pointsMap).unlocked,
    totalTitles: TITLES.length,
  };
}

export default function StatusScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [view, setView] = useState<StatusView | null>(null);
  const [lastGood, setLastGood] = useState<StatusView | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(() => {
    try {
      const player = getPlayerSnapshot();

      /*
       * 累计记录次数：从「有记录的第一天」到「今天」这一整段里的有效打卡数。
       *
       * 为什么用 `countCheckinsInRange` 而不是 `COUNT(*)`：
       * 撤销掉的打卡 `status = 'reversed'`，它们不该算进「我一共记录了多少次」——
       * 撤销的意思是「那次不算」，这与 D21 的现算口径一致。
       */
      const start = '0000-01-01';
      const end = addDays(businessDate(Date.now(), 4), 0);
      const total = countCheckinsInRange(start, end);

      const next = buildStatusView(player, total);
      setView(next);
      setLastGood(next);
      setError(false);
    } catch (err) {
      console.warn('[Ember] 读取状态失败', err);
      setError(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const data = view ?? lastGood;

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
        状态
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
        这些是读数，不是评价。它们只记录你把时间花在哪儿了。
      </Text>

      {/* 读不出来时说一句实话，而不是画一排 0 */}
      {error ? (
        <Card style={{ marginTop: theme.spacing.xl }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {data ? '刚才没读到新数据，显示的是上一次的。' : '这些暂时读不出来。'}
          </Text>
        </Card>
      ) : null}

      {data ? (
        <>
          {/* ① 人生等级。人升把它放在最上面，是整页唯一的「总进度」 */}
          <Card style={{ marginTop: theme.spacing.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
              <Text
                style={{
                  fontSize: theme.typography.size.label,
                  lineHeight: theme.typography.lineHeight.label,
                  fontWeight: theme.typography.weight.semibold,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.title,
                }}
              >
                人生等级 LV.{data.level}
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
                {data.xpForNext > 0 ? `${data.xpInLevel} / ${data.xpForNext}` : '满级'}
              </Text>
            </View>

            <Meter progress={data.xpProgress} />

            <Text
              style={{
                marginTop: theme.spacing.sm,
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              到目前为止，你一共记录了 {data.totalRecords} 次。
            </Text>
          </Card>

          {/* ② 属性。人升的核心版式：名字 + LV + 条 + 百分比 + 分数 */}
          <View style={{ marginTop: theme.spacing.xl }}>
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
              属性
            </Text>

            <Card>
              {/*
               * 顺序固定为 ATTRIBUTE_KEYS，不按数值排——排序会让它读起来像排行榜
               * （与「我的」页原来那条规矩同源，docs/02 §10）。
               */}
              {data.attributes.map((attr, index) => (
                <View
                  key={attr.key}
                  style={{ marginTop: index === 0 ? 0 : theme.spacing.lg }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                      <Text
                        style={{
                          fontSize: theme.typography.size.body,
                          lineHeight: theme.typography.lineHeight.body,
                          color: palette.text,
                          fontFamily: theme.typography.fontFamily.body,
                        }}
                      >
                        {attr.label}
                      </Text>
                      <Text
                        style={{
                          marginLeft: theme.spacing.sm,
                          fontSize: theme.typography.size.label,
                          lineHeight: theme.typography.lineHeight.label,
                          fontWeight: theme.typography.weight.medium,
                          color: palette.primary,
                          fontFamily: theme.typography.fontFamily.body,
                          fontVariant: ['tabular-nums'],
                        }}
                      >
                        LV.{attr.level}
                      </Text>
                    </View>

                    <Text
                      style={{
                        fontSize: theme.typography.size.caption,
                        lineHeight: theme.typography.lineHeight.caption,
                        color: palette.textMuted,
                        fontFamily: theme.typography.fontFamily.body,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {Math.round(attr.progress * 100)}%
                    </Text>
                  </View>

                  <Meter progress={attr.progress} />

                  <Text
                    style={{
                      marginTop: 2,
                      fontSize: theme.typography.size.caption,
                      lineHeight: theme.typography.lineHeight.caption,
                      color: palette.textMuted,
                      fontFamily: theme.typography.fontFamily.body,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {attr.xp} / {ATTR_XP_PER_POINT}
                  </Text>
                </View>
              ))}
            </Card>

            <Text
              style={{
                marginTop: theme.spacing.xs,
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              每 {ATTR_XP_PER_POINT} 点属性经验换 1 点，点数攒成等级。
              它不影响任何数值，只记录你把时间花在哪儿了。
            </Text>
          </View>

          {/* ③ 称号。人升的「属性等级」与成就联动，Ember 对应的是称号 */}
          <View style={{ marginTop: theme.spacing.xl }}>
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
              称号
            </Text>

            <Card>
              {data.earnedTitles.length > 0 ? (
                <Text
                  style={{
                    fontSize: theme.typography.size.body,
                    lineHeight: theme.typography.lineHeight.body,
                    color: palette.text,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  已经拿到：{data.earnedTitles.join('、')}
                </Text>
              ) : (
                <Text
                  style={{
                    fontSize: theme.typography.size.body,
                    lineHeight: theme.typography.lineHeight.body,
                    color: palette.text,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  称号会随着某一维的点数慢慢出来。不用特意去拿。
                </Text>
              )}

              {data.nextTitleHints.length > 0 ? (
                <Text
                  style={{
                    marginTop: theme.spacing.xs,
                    fontSize: theme.typography.size.caption,
                    lineHeight: theme.typography.lineHeight.body,
                    color: palette.textMuted,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  {data.nextTitleHints
                    .map((hint) => `${hint.label}再走 ${hint.remaining} 点`)
                    .join('，')}
                </Text>
              ) : null}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="看全部称号"
                  onPress={() => router.push('/titles')}
                  style={({ pressed }) => ({
                    marginTop: theme.spacing.sm,
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
                    看全部称号
                  </Text>
                </Pressable>
              </View>
            </Card>

            {/* 进度只在这里一行小字，不做成进度条：那是要填满的东西 */}
            <Text
              style={{
                marginTop: theme.spacing.xs,
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {data.unlockedTitles} / {data.totalTitles} 个称号。
            </Text>
          </View>

          {/*
           * 页尾一句。人升的属性页没有这一句，但 Ember 的产品底线要求说清
           * 「这些数字不会反过来改变什么」——否则用户会以为等级越高奖励越多。
           */}
          <Text
            style={{
              marginTop: theme.spacing.xl,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            满级是 {MAX_LEVEL} 级。这些数字不会改变任何结算，它们只是路标。
          </Text>
        </>
      ) : null}
    </ScrollView>
  );
}

/**
 * 一根 4px 的横条。
 *
 * 与「我的」页原来那个 `Meter` 同一个形状（D29 的 Fluent 语汇）：
 * 底是边框色，前景是主色，圆角。宽度按 0–1 的比例。
 */
function Meter({ progress }: { progress: number }) {
  const { theme, palette } = useTheme();
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return (
    <View
      style={{
        marginTop: theme.spacing.xs,
        height: 4,
        borderRadius: 2,
        backgroundColor: palette.border,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          width: `${clamped * 100}%`,
          height: '100%',
          borderRadius: 2,
          backgroundColor: palette.primary,
        }}
      />
    </View>
  );
}
