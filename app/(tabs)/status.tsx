import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PageTitle } from '../../src/components/PageTitle';
import { Card } from '../../src/components/Card';
import { countCheckinsInRange } from '../../src/db/repo/checkins';
import { getPlayerSnapshot } from '../../src/db/repo/player';
import { ATTR_LEVEL_XP, buildStatusView, type StatusView } from '../../src/domain/status';
import { MAX_LEVEL, type AttributeKey } from '../../src/domain/balance';
import { businessDate } from '../../src/domain/date';
import { getSafeDayStartHour } from '../../src/services/today';
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
 * ---- 装配逻辑不在这里 ----
 *
 * 等级与属性的读法（分母是本级总需、LV = points + 1、总分 = points × 200 + xp）
 * 全部在 `src/domain/status.ts`。**纯函数放在 domain 是有原因的**：
 * 留在页面里的话，要验证它就得连带拉进 react-native 与 expo-router，
 * 仓库外那套 Node 测试就测不到——第一版就是这么漏掉一个分母错误的。
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

/**
 * 五维 → 自然色（D59）。
 *
 *   体魄  leaf  长出来的
 *   心智  sky   想远的
 *   秩序  sun   照进来的
 *   心力  earth 沉下去的
 *   联结  petal 开出来的
 *
 * 只用于**进度条填充**，不用于文字：这五个颜色没有一个能在白底上过 4.5:1。
 */
const ATTRIBUTE_INK: Record<AttributeKey, 'leaf' | 'sky' | 'sun' | 'earth' | 'petal'> = {
  body: 'leaf',
  mind: 'sky',
  order: 'sun',
  spirit: 'earth',
  bond: 'petal',
};

export default function StatusScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();

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
       *
       * 为什么「今天」走 `getSafeDayStartHour()` 而不是写死 4：
       * 日界是用户可调的（设置 → 节奏）。写死 4 的话，把日界改成 0 点或 6 点的人
       * 在凌晨那几个小时会漏算当天的记录——这是全项目唯一一处绕过「日界唯一入口」的写法，
       * 已经改回来了。
       */
      const start = '0000-01-01';
      const end = businessDate(Date.now(), getSafeDayStartHour());
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
      <PageTitle
        title="状态"
        mark="sprout"
        subtitle="这些是读数，不是评价。它们只记录你把时间花在哪儿了。"
      />

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
                {data.xpLevelTotal > 0 ? `${data.xpInLevel} / ${data.xpLevelTotal}` : '满级'}
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

                  <Meter progress={attr.progress} color={palette.nature[ATTRIBUTE_INK[attr.key]]} />

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
                    {attr.xp} / {ATTR_LEVEL_XP}
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
              每 {ATTR_LEVEL_XP} 点属性经验换 1 点，点数攒成等级。
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
              {/*
               * 两层（D52）：五维那一层是「你的时间花在哪儿」，
               * 旅程那一层是「你一共走了多远」。分开写，不混成一句，
               * 因为两者的量纲不同（见 domain/titles.ts 文件头）。
               */}
              {data.earnedTitles.length > 0 ? (
                <Text
                  style={{
                    fontSize: theme.typography.size.body,
                    lineHeight: theme.typography.lineHeight.body,
                    color: palette.text,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  五维：{data.earnedTitles.join('、')}
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
                  五维的称号会随着某一维的点数慢慢出来。不用特意去拿。
                </Text>
              )}

              {/* 旅程那一条：等级是单条轴，所以只写一个名字 + 一个下一档 */}
              <Text
                style={{
                  marginTop: theme.spacing.sm,
                  fontSize: theme.typography.size.body,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {data.journeyTitle
                  ? `旅程：${data.journeyTitle}`
                  : '旅程：走到 LV.10 会有一个名字。'}
              </Text>

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

              {data.nextJourneyHint ? (
                <Text
                  style={{
                    marginTop: 2,
                    fontSize: theme.typography.size.caption,
                    lineHeight: theme.typography.lineHeight.body,
                    color: palette.textMuted,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  再走 {data.nextJourneyHint.remaining} 级到「{data.nextJourneyHint.name}」。
                </Text>
              ) : null}

              {/*
               * 这里**不放**「看全部称号」的入口。
               *
               * 称号图鉴的入口只有一个：「我的」页那张称号卡上的「看看全部」。
               * 状态页是「读数」，回答「我现在是什么样」；图鉴是「目录」，
               * 回答「一共有哪些、我还差什么」。同一件事给两个入口，
               * 用户会在两个地方各点一次，然后不确定哪个才是「全部」。
               */}
            </Card>

            {/* 进度只在这里一行小字，不做成进度条：那是要填满的东西 */}
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
/**
 * 一条进度条。
 *
 * `color` 可选：五维各用自己的自然色（D59），等级那条仍用主色。
 *
 * ---- 为什么五维要各给一个颜色 ----
 *
 * 五条进度条原来长得一模一样（都是 `palette.primary`），读者只能靠名字分
 * 「这一条是哪一维」。给了颜色之后，**「哪一维满了」在扫视时就成立**——
 * 这是信息，不是装饰。
 *
 * 为什么用自然色而不是五个随便挑的颜色：这五维本来就是「你把时间花在哪儿」，
 * 而它们各自对应一类事（身体 / 读书 / 收拾 / 安静 / 联系别人），
 * 自然色比一套无意义的色轮更说得通。
 */
function Meter({ progress, color }: { progress: number; color?: string }) {
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
          backgroundColor: color ?? palette.primary,
        }}
      />
    </View>
  );
}
