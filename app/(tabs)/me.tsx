import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { PlayerAvatar } from '../../src/components/PlayerAvatar';
import { TitleMark } from '../../src/components/TitleMark';
import { StreakRepairCard } from '../../src/components/StreakRepairCard';
import { getPlayerSnapshot, type PlayerSnapshot } from '../../src/db/repo/player';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABEL, XP_TABLE, type AttributeKey } from '../../src/domain/balance';
import { DEFAULT_AVATAR_ID } from '../../src/domain/avatar';
import {
  JOURNEY_TITLES,
  highestTitles,
  nextJourneyTitle,
  nextTitles,
} from '../../src/domain/titles';
import type { StreakSummary } from '../../src/domain/streak';
import { NEUTRAL_COPY } from '../../src/domain/text-rules';
import { getOverallStreak } from '../../src/services/today';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 我的页。
 *
 * 这一页只放个人数据：头像、名字、等级、经验条、余烬、连胜、五维属性。
 * **设置不在这里**，单独一页，从页头右上角进入（docs/02 §4.3）。
 *
 * 为什么分开：「我的」回答「你走到了哪儿」，设置回答「把 App 调成你想要的样子」。
 * 混在一页时，后者那九行条目会把前者压成页头的一小段。
 *
 * 五维是纯展示：不影响任何数值，只记录你把时间花在哪儿了。
 * 所以只画条和数字，不画雷达图、不做评分、不给建议。
 *
 * **这一页没有任何编辑入口**：头像与名字都是纯展示，改它们去
 * 「设置 → 资料」。理由见 docs/02 §4.3——
 * 换头像与改资料是「把 App 调成你想要的样子」，属于设置；
 * 早先它们挂在这一页上，用户点头像或名字时并不知道自己会离开这一页。
 *
 * 数据来源是 player 表（种子保证有一行）。读库失败时退回一份全零的默认快照，
 * 而不是白屏——这一页不是关键路径，坏掉时也该能进设置看看到底怎么了。
 *
 * ---- 每一条数据都有自己的框 ----
 *
 * 这一页原先是一条通栏的竖排读数：头像、等级、经验条、连胜、五维依次往下，
 * 靠字号和留白分层。现在每个数据点各占一张白卡片（`components/Card`），
 * 靠卡片之间 8px 的缝分开。
 *
 * 两条排布规则：
 *   1. **同类的小数字并排**。等级和余烬都只是一个数字，各占满一行的话，
 *      这一页会被拉得很长而信息量没变。它们并排成两张等宽的卡——
 *      **各自仍是独立的框**，只是框的宽度按内容走。
 *   2. **一个大项一张卡**。经验条、连胜、五维的每一条各一张。
 *      五维那五张卡形状完全一样，因为它们是同一套东西的五个刻度；
 *      顺序固定为 ATTRIBUTE_KEYS，不按数值排——排序会让它读起来像排行榜。
 */

/**
 * 读库失败时的兜底。
 *
 * 用默认头像 id：即使数据库没打开，界面也能画出一只狐狸——
 * 一张「没有主人」的默认动物，比一个空白方块好，也不会碰巧冒充某个真实用户的选择
 * （真实用户的选择就在这七个里，但这一份兜底快照的其它字段全是零，一看就知道是兜底）。
 */
const FALLBACK_PLAYER: PlayerSnapshot = {
  id: '',
  displayName: '旅人',
  bio: null,
  level: 1,
  xpTotal: 0,
  xpInLevel: 0,
  highestLevel: 1,
  attributes: {
    body: { xp: 0, points: 0 },
    mind: { xp: 0, points: 0 },
    order: { xp: 0, points: 0 },
    spirit: { xp: 0, points: 0 },
    bond: { xp: 0, points: 0 },
  },
  ember: 0,
  material: 0,
  refinedMaterial: 0,
  // D53 的三个持有物：兜底快照里都是 0，与「刚装 App 的玩家」一致
  graceTickets: 0,
  streakShields: 0,
  restoreTokens: 0,
  lastEventRewardMonth: null,
  // 兑底快照的起算日为空：这一份只在读库失败时用，
  // 而引导卡的显示本来就要先读库（getGuideState 自己会兜住），
  // 不需要这份兑底快照去参与。
  guideStartDate: null,
  onboardingDone: false,
  avatarId: DEFAULT_AVATAR_ID,
  createdAt: 0,
  updatedAt: 0,
};

/** 读玩家快照。失败时返回兜底值，不抛错 */
function loadPlayer(): PlayerSnapshot {
  try {
    return getPlayerSnapshot();
  } catch (err) {
    console.warn('[Ember] 读取玩家数据失败，我的页显示默认值', err);
    return FALLBACK_PLAYER;
  }
}

/** 读库失败时的连胜兜底。三个 0，界面会显示「第一天」 */
const FALLBACK_STREAK: StreakSummary = {
  current: 0,
  best: 0,
  totalDays: 0,
  lastDate: null,
};

/**
 * 读整体连胜。
 *
 * 「整体」= 只要有记录，不分是哪个习惯。首页每条习惯显示自己的，
 * 这一页显示合起来的——那是「你这个人最近有没有在动」。
 */
function loadStreak(): StreakSummary {
  try {
    return getOverallStreak();
  } catch (err) {
    console.warn('[Ember] 读取连胜失败，我的页显示默认值', err);
    return FALLBACK_STREAK;
  }
}

/**
 * 小数据点卡片：上面一行小标签，下面一个大数字。
 *
 * 只给「一个数字就能说完」的数据用（等级、余烬）。有两条以上信息的数据点
 * 该用它自己的排布，不该被塞进这个模子。
 */
function StatTile({ label, value }: { label: string; value: string }) {
  const { theme, palette } = useTheme();
  return (
    <Card style={styles.tile}>
      <Text
        style={{
          fontSize: theme.typography.size.caption,
          lineHeight: theme.typography.lineHeight.caption,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          marginTop: 2,
          fontSize: theme.typography.size.heading,
          lineHeight: theme.typography.lineHeight.heading,
          fontWeight: theme.typography.weight.semibold,
          color: palette.text,
          fontFamily: theme.typography.fontFamily.title,
          // 数字等宽：余烬从 9 涨到 10 时，这一行不会自己跳一下
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </Card>
  );
}

/**
 * 称号摘要（我的页）。
 *
 * 两种形态：
 *   - 已经拿到过至少一个 → 列出最高档的那几个名字；
 *   - 一个都没拿到 → 给「最近的那个还差多少点」。
 *
 * 两者都带一个进图鉴的入口。不做「3 / 20」那种进度——那是清单，不是记录。
 */
function TitleSummary({ onOpen }: { onOpen: () => void }) {
  const { theme, palette } = useTheme();

  /*
   * 在渲染期读一次玩家数据。
   * 读失败时整张卡不画：称号是装饰，不该因为读库失败把「我的」页拖垮。
   */
  const snapshot = (() => {
    try {
      const player = getPlayerSnapshot();
      const map = {} as Record<AttributeKey, number>;
      for (const key of ATTRIBUTE_KEYS) map[key] = player.attributes[key].points;
      return { points: map, level: player.level };
    } catch (err) {
      console.warn('[Ember] 读取称号失败', err);
      return null;
    }
  })();

  if (!snapshot) return null;

  const { points, level } = snapshot;
  const top = highestTitles(points);
  const next = nextTitles(points);

  // 旅程那一层（D52）：等级是单条轴，所以只取最近拿到的那一个
  const journey = nextJourneyTitle(level);
  const journeyEarned = JOURNEY_TITLES.filter((title) => level >= title.threshold);

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
        称号
      </Text>

      {/*
       * 图形（D52）：每一维一只容器，水位就是它现在那一档。
       *
       * 为什么这一页也画图形，而图鉴页画得更大：这一页是「一眼看我是谁」，
       * 五只容器并排 = 五维各自的进度，比五个名字更快读。名字仍然写出来，
       * 因为图形只表达「水位」，不表达「叫什么」。
       */}
      {top.length > 0 ? (
        <>
          <View style={styles.titleMarksRow}>
            {top.map((title) => (
              <TitleMark
                key={title.id}
                // 属性称号的 attribute 一定非 null；类型收窄用
                mark={title.attribute ?? 'body'}
                tier={title.tier}
                unlocked
                size={26}
                strokeColor={palette.text}
                fillColor={palette.primary}
              />
            ))}
          </View>
          <Text
            style={{
              marginTop: 2,
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {top.map((title) => title.name).join(' · ')}
          </Text>
        </>
      ) : (
        <Text
          style={{
            marginTop: 2,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          还没有称号。再走一点就会有。
        </Text>
      )}

      {/* 最近的一个：只给一个，五个并排会变成五张待办 */}
      {next.length > 0 ? (
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
          {/* 属性称号表里每一项的 attribute 都非 null；`?? ''` 只为类型收窄 */}
          {ATTRIBUTE_LABEL[next[0].title.attribute ?? 'body']}再走 {next[0].remaining} 点
        </Text>
      ) : null}

      {/*
       * 旅程那一层。为什么放在最后、且只有一行：
       * 等级已经在页头的「Lv.N」里读过了，这里只补一句「它有没有名字」。
       * 写两行（名字 + 还差几级）会与上面那行五维提示抢同样的分量，
       * 而五维才是这一页的主角（这一页回答「我是谁」，状态页回答「我走到了哪」）。
       */}
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
        {journeyEarned.length > 0
          ? `旅程：${journeyEarned[journeyEarned.length - 1].name}`
          : journey
            ? `旅程：再走 ${journey.remaining} 级到「${journey.title.name}」`
            : null}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="看看全部称号"
        onPress={onOpen}
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
            color: palette.primary,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          看看全部
        </Text>
      </Pressable>
    </Card>
  );
}

/*
 * 原来这里有一个 `Meter`（一条横条，经验条与五维条共用）。
 * D48 把经验条与五维都搬去了「状态」页，这一页不再画任何进度条，
 * 于是它成了死代码——死代码比缺代码更难维护，删掉。
 * 同样的形状现在在 `app/(tabs)/status.tsx` 的 `Meter` 里。
 */

export default function MeScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [player, setPlayer] = useState<PlayerSnapshot>(loadPlayer);
  const [streak, setStreak] = useState<StreakSummary>(loadStreak);

  /*
   * D1–D7 引导卡：D63 起这一页不再挂（第 5 天那张「这些是你走到今天的样子」）。
   * 卡的定义与文案仍在 `domain/guide.ts`，只是没有挂载点了。
   */

  /**
   * 每次回到这一页重新读一次。
   * 等级、经验、五维、连胜都可能在「今天」页发生变化；只在挂载时读一次，
   * 打完卡切回来会看到一个没更新的数字——比数字小更让人不信任。
   */
  useFocusEffect(
    useCallback(() => {
      setPlayer(loadPlayer());
      setStreak(loadStreak());
    }, [])
  );

  // 升到下一级需要多少 XP（D48 起这一页不画经验条，但「状态」页的入口
  // 文案里要提一句「还差多少」，所以这个数仍留在这里算）。

  /*
   * 称号先不做。
   *
   * 原设计里称号由五维最高项决定，但完整的取名规则要到阶段 3 才定；
   * 现在硬凑一个「体魄最高」读起来像一句诊断，而且五维全 0 的新玩家会得到
   * 一个没有意义的称号。这一行只写等级，等阶段 3 有真规则了再补。
   */

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xxl,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ paddingHorizontal: theme.spacing.pageX }}>
        {/*
         * 身份卡：头像 + 名字 + 那句自我介绍，外加设置入口。
         *
         * 这三样合成一张卡而不是三张：它们说的是同一件事——「这是谁」。
         * 头像和名字拆成两张卡，会让人以为它们可以分别编辑。
         *
         * **头像是纯展示，不可点**：换头像与改名字都挪到了设置页
         * （设置 → 资料）。早先头像与名字都是入口，于是这一页同时是展示页和
         * 编辑页的入口，用户点名字时并不知道自己会离开这一页。
         */}
        {/*
         * 身份卡：头像 + 名字 + 设置入口。
         *
         * D63 把 D59 加的两样彩色都去掉了——粉色洗色底与头像右边那条彩虹。
         * 理由与这一轮其余改动一致：这一页要回答「我是谁、我有什么」，
         * 而洗色底与彩虹说的是「这一页有自己的装饰语言」，那不是信息。
         * 去掉之后身份卡回到白纸，与这一页其余的数据卡同一种长相。
         */}
        <Card>
          <View style={styles.nameRow}>
            <View style={styles.identity}>
              <PlayerAvatar avatarId={player.avatarId} size={64} accessible />
              <Text
                /*
                 *
                 * 外观走查（1.5 倍字号）改的一处：名字与右侧「设置」抢同一条横线。
                 * 名字原来没有行数上限，名字很长时（最多 24 字）它会自己长成两三行，
                 * 但右侧的「设置」按钮固定在中间——名字一长，两边就不成行了。
                 * 现在给名字 2 行上限，与 SettingsRow 的规矩一致：
                 * 名字是这一行要读的东西，但它不需要无限长。
                 */
                numberOfLines={2}
                style={{
                  flexShrink: 1,
                  marginLeft: theme.spacing.md,
                  fontSize: theme.typography.size.title,
                  lineHeight: theme.typography.lineHeight.title,
                  fontWeight: theme.typography.weight.semibold,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.title,
                }}
              >
                {player.displayName}
              </Text>
            </View>

            {/* 名字与设置入口之间留出空白（D63 删掉了原来贴在中间的彩虹） */}
            <View style={{ marginLeft: 'auto' }} />

            {/*
             * 设置入口。纯文字、次要色、不加箭头不加边框——
             * 它是这一页唯一不属于个人数据的元素，所以压到最小。
             */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="设置"
              onPress={() => router.push('/settings')}
              style={({ pressed }) => ({
                minHeight: theme.touchTarget,
                minWidth: theme.touchTarget,
                marginLeft: theme.spacing.md,
                alignItems: 'flex-end',
                justifyContent: 'center',
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
                设置
              </Text>
            </Pressable>
          </View>

          {/*
           * 那句自我介绍（`player.bio`）D63 起不再显示。
           *
           * **字段与库里已经写过的内容都保留**（不迁移、不清空）：
           * 这一版只是不显示它，将来想接回来就是在这里加一段渲染。
           * 编辑入口也一并从设置页删掉了。
           */}
        </Card>

        {/* 等级与余烬：两个只有一个数字的数据点，并排成两张等宽的卡 */}
        <View style={[styles.tileRow, { marginTop: theme.spacing.cardGap }]}>
          <StatTile label="等级" value={`Lv.${player.level}`} />
          <StatTile label="余烬" value={String(player.ember)} />
        </View>

        {/*
         * 经验条（D48 起不在这里画）。
         *
         * 它搬到了「状态」页的顶部大卡：那一页才是回答「我走到哪儿了」的地方，
         * 而这一页回答的是「我是谁、我有什么」。两页都画一条经验条，
         * 只会让人分不清哪一条是权威。
         *
         * 这一页保留 `Lv.N` 那一个读数（见上面的 StatTile）：
         * 它是一个身份数字，与名字、头像同类，不像进度条那样要求「填满」。
         */}

        {/*
         * 连胜。整体口径：不分是哪个习惯，这一天有记录就算。
         *
         * 三条文案规则（docs/02 §8）：
         *   - 从没记录过 → 只说「第一天」，不出现数字 0；
         *   - 今天或昨天有记录 → 「连着 X 天」；
         *   - 断了 → 「有一段空档」+「历史最佳 / 累计」，**绝不写「归零」**。
         * 后两行永远并排出现：只给一个 0 会变成羞辱，给三个数看到的是「我做过很多」。
         */}
        <Card style={{ marginTop: theme.spacing.cardGap }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            连胜
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontSize: theme.typography.size.heading,
              lineHeight: theme.typography.lineHeight.heading,
              fontWeight: theme.typography.weight.semibold,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.title,
            }}
          >
            {streak.totalDays === 0
              ? '第一天'
              : streak.current > 0
                ? `连着 ${streak.current} 天`
                : NEUTRAL_COPY.gap}
          </Text>
          {streak.totalDays > 0 ? (
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
              历史最佳 {streak.best} 天 / 累计 {streak.totalDays} 天
            </Text>
          ) : null}
        </Card>

        {/*
         * 称号（阶段 4 第 3 条）。
         *
         * 只在真的拿到过至少一个时显示最高档那几个；一个都没拿到时
         * 显示「下一个称号还差多少」——那是一句方向，不是一句欠账。
         *
         * 不显示「已解锁 3 / 20」：那个数字会变成一张要填满的清单，
         * 而完整的图鉴在 /titles 里。
         */}
        <TitleSummary onOpen={() => router.push('/titles')} />

        {/*
         * 连胜修复（D38）。
         *
         * 只在真的断了、且还有可修的余地时出现——没断的时候这一整张卡
         * 不画，因为「修复」对没断的人来说是一个没有意义的问题。
         * 过期之后也不画（但会给一句说明，而不是默默消失：
         * 默默消失会让用户以为功能被移除了）。
         */}
        <StreakRepairCard
          onRepaired={() => {
            // 修好之后连胜、余烬都变了，重读这一页
            setPlayer(loadPlayer());
            setStreak(loadStreak());
          }}
        />
      </View>

      {/*
       * 商店入口（阶段 4 第 5 条）。
       *
       * 放在统计上面：它们是同一种东西（从「我的」页出去的入口），
       * 而商店多一个「还剩多少余烬」的读数。
       */}
      <View style={{ marginTop: theme.spacing.cardGap, paddingHorizontal: theme.spacing.pageX }}>
        <Card padding={0}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="商店，用余烬换材料"
            onPress={() => router.push('/shop')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 52,
              paddingHorizontal: theme.spacing.cardPadding,
              opacity: pressed ? 0.55 : 1,
            })}
          >
            <Text
              style={{
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              商店
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
              {player.ember} 余烬
            </Text>
          </Pressable>
        </Card>
      </View>

      {/*
       * 统计入口。
       *
       * 为什么不做成第五个 tab：底栏四个 tab 回答的是「今天要做什么」，
       * 统计是回头看的、一周看一次的东西。给它一个常驻 tab，
       * 等于把复盘抬到和「今天做什么」一样重。
       */}
      <View style={{ marginTop: theme.spacing.cardGap, paddingHorizontal: theme.spacing.pageX }}>
        <Card padding={0}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="统计，看看最近三十天的记录"
            onPress={() => router.push('/stats')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 52,
              paddingHorizontal: theme.spacing.cardPadding,
              opacity: pressed ? 0.55 : 1,
            })}
          >
            <Text
              style={{
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              统计
            </Text>
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              最近三十天
            </Text>
          </Pressable>
        </Card>
      </View>

      {/*
       * 目标入口（D48）。
       *
       * 目标原来是底栏的一个 tab，现在被「状态」顶掉了。它没有被删掉，
       * 只是变成了二级页——写目标的频率本来就不是每天，放在这里足够。
       *
       * 文案是「走得久一点的事」，不是「目标管理」：后者是一个功能名，
       * 前者是用户在那一页会看到的第一句话（`app/goals/index.tsx` 的副标题）。
       */}
      <View style={{ marginTop: theme.spacing.cardGap, paddingHorizontal: theme.spacing.pageX }}>
        <Card padding={0}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="目标，走得久一点的事"
            onPress={() => router.push('/goals')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 52,
              paddingHorizontal: theme.spacing.cardPadding,
              opacity: pressed ? 0.55 : 1,
            })}
          >
            <Text
              style={{
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              目标
            </Text>
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              走得久一点的事
            </Text>
          </Pressable>
        </Card>
      </View>

      {/*
       * 「状态」入口 D63 删掉了。
       *
       * 底栏本来就有一个「状态」tab（D48），而这一页又给了一个入口——
       * 同一件事两个入口，用户会在两处各点一次，然后不确定哪个才是权威。
       * 底栏那个永远在，所以删这里。
       *
       * 五维仍然不在这一页画（D48 搬走了），去看它们就走底栏的「状态」。
       */}

      {/*
       * 番茄钟入口（D68）。
       *
       * 放在复盘上面，因为它们同为「二级功能」，而番茄钟的使用频率
       * 会高得多（每天数次 vs 每周一次）。它不是 tab：首页的职责是
       * 「今天要做什么」（D61 立下的判据），计时器不是待办，
       * 放进去正好是那一轮刚清掉的那类东西。
       */}
      <View style={{ marginTop: theme.spacing.cardGap, paddingHorizontal: theme.spacing.pageX }}>
        <Card padding={0}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="番茄钟，一段时间一段时间地专注"
            onPress={() => router.push('/pomodoro')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 52,
              paddingHorizontal: theme.spacing.cardPadding,
              opacity: pressed ? 0.55 : 1,
            })}
          >
            <Text
              style={{
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              番茄钟
            </Text>
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              专注 / 休息 / 起搏
            </Text>
          </Pressable>
        </Card>
      </View>

      {/*
       * 复盘入口（D64）。
       *
       * 从日记页搬过来的：日记页现在只回答「我写过什么」，
       * 而周复盘 / 月复盘是「总结」，不是「我写的字」。
       *
       * 不删掉这个入口：它是周复盘与月复盘**唯一**的进法，
       * 删了等于把两个功能下线。
       */}
      <View style={{ marginTop: theme.spacing.cardGap, paddingHorizontal: theme.spacing.pageX }}>
        <Card padding={0}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="复盘，看看这一周和这一个月"
            onPress={() => router.push('/review')}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              minHeight: 52,
              paddingHorizontal: theme.spacing.cardPadding,
              opacity: pressed ? 0.55 : 1,
            })}
          >
            <Text
              style={{
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              复盘
            </Text>
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              一周 / 一个月
            </Text>
          </Pressable>
        </Card>
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  /** 五只容器并排（「我的」页的称号卡，D52）。间距走 theme.spacing，这里只定方向 */
  titleMarksRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  tileRow: {
    flexDirection: 'row',
    columnGap: 8,
    //
    // 外观走查（1.5 倍字号）加的一行：两张等宽的卡要能一样高。
    // 默认 flex 容器的高度由最高的孩子决定，而「等级」那一张只有「Lv.12」、
    // 「余烬」那一张可能有 5 位数——字号放大后两张卡会差出一行的高度，看起来像没对齐。
    // stretch 是 row 的默认值，这里写出来是为了把「必须等高」这件事变成显式约定。
    //
    alignItems: 'stretch',
  },
  tile: {
    flex: 1,
  },
});
