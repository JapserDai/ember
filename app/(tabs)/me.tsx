import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlayerAvatar } from '../../src/components/PlayerAvatar';
import {
  getPlayerSnapshot,
  rerollAvatar,
  type PlayerSnapshot,
} from '../../src/db/repo/player';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABEL, ATTR_POINTS_MAX, XP_TABLE } from '../../src/domain/balance';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 我的页。
 *
 * 这一页只放个人数据：头像、名字、等级、经验条、五维属性。
 * **设置不在这里**，单独一页，从页头右上角进入（docs/02 §4.3）。
 *
 * 为什么分开：「我的」回答「你走到了哪儿」，设置回答「把 App 调成你想要的样子」。
 * 混在一页时，后者那九行条目会把前者压成页头的一小段。
 *
 * 五维是纯展示：不影响任何数值，只记录你把时间花在哪儿了。
 * 所以只画条和数字，不画雷达图、不做评分、不给建议。
 *
 * 数据来源是 player 表（种子保证有一行）。读库失败时退回一份全零的默认快照，
 * 而不是白屏——这一页不是关键路径，坏掉时也该能进设置看看到底怎么了。
 */

/**
 * 读库失败时的兜底。
 *
 * 用空字符串当 playerId：buildAvatar 仍然会画出一块炭，但它是一个「没有主人」的默认图案，
 * 不会碰巧跟某个真实玩家的头像撞上（真实 id 不可能为空）。
 */
const FALLBACK_PLAYER: PlayerSnapshot = {
  id: '',
  displayName: '旅人',
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
  onboardingDone: false,
  avatarSeed: 0,
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

export default function MeScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [player, setPlayer] = useState<PlayerSnapshot>(loadPlayer);

  /**
   * 每次回到这一页重新读一次。
   * 等级、经验、五维都可能在「今天」页发生变化；只在挂载时读一次，
   * 打完卡切回来会看到一个没更新的数字——比数字小更让人不信任。
   */
  useFocusEffect(
    useCallback(() => {
      setPlayer(loadPlayer());
    }, [])
  );

  /**
   * 换一个头像图案。
   *
   * 先把库写成功再更新界面：写失败时如果界面已经变了，用户会以为换好了，
   * 下次打开却变回去。宁可点下去没反应（并且什么都不变），也不要给一个假的结果。
   */
  const handleRerollAvatar = useCallback(() => {
    try {
      const nextSeed = rerollAvatar();
      setPlayer((prev) => ({ ...prev, avatarSeed: nextSeed }));
    } catch (err) {
      console.warn('[Ember] 换头像失败', err);
    }
  }, []);

  // 升到下一级需要多少 XP。满级时 XP_TABLE[50] = 0，这里避开除以 0
  const xpForNext = player.level < XP_TABLE.length ? XP_TABLE[player.level] : 0;
  const xpProgress = xpForNext > 0 ? Math.min(1, player.xpInLevel / xpForNext) : 1;

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
      {/* 头像 + 名字。设置入口贴在这一行右端，不单独占一行 */}
      <View style={{ paddingHorizontal: theme.spacing.pageX }}>
        <View style={styles.nameRow}>
          <View style={styles.identity}>
            <PlayerAvatar playerId={player.id} avatarSeed={player.avatarSeed} size={52} />
            <Text
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
         * 等级与「换一个头像」在同一行，**都靠左**，紧挨着头像那一列。
         *
         * 为什么不做成整行两端对齐：那样「换一个」会跑到页面最右边，正好在「设置」
         * 下面——同一列里两个右对齐的可点元素，一个换头像一个进设置，很容易点错。
         * 靠左放在头像正下方，视线不用移，也不会跟设置混淆。
         *
         * 为什么不做成「点头像换一个」：头像是这一页最像按钮的东西，但把整个头像
         * 当按钮，会让人以为能换头像本身（换图、拍照），而这里只换一个图案。
         */}
        <View style={[styles.levelRow, { marginTop: theme.spacing.xs }]}>
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            Lv.{player.level}
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="换一个头像图案"
            onPress={handleRerollAvatar}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => ({
              // 高度补到 44（docs/02 §9）；左右再扩 8，两个字的标签也不会太难点
              minHeight: theme.touchTarget,
              justifyContent: 'center',
              marginLeft: theme.spacing.md,
              opacity: pressed ? 0.55 : 1,
            })}
          >
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              换一个
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 经验条。用一条细线，不用进度环 */}
      <View
        style={{
          marginTop: theme.spacing.lg,
          paddingHorizontal: theme.spacing.pageX,
        }}
      >
        <View
          style={{
            height: 4,
            borderRadius: 2,
            backgroundColor: palette.border,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${xpProgress * 100}%`,
              height: '100%',
              borderRadius: 2,
              backgroundColor: palette.primary,
            }}
          />
        </View>
        <View style={[styles.row, { marginTop: theme.spacing.xs }]}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
              fontVariant: ['tabular-nums'],
            }}
          >
            {player.xpInLevel} / {xpForNext || '满级'}
          </Text>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            余烬 {player.ember}
          </Text>
        </View>
      </View>

      {/* 五维。纯展示，不给建议、不做评分 */}
      <View
        style={{
          marginTop: theme.spacing.xl,
          paddingHorizontal: theme.spacing.pageX,
        }}
      >
        <Text
          style={{
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.size.label,
            lineHeight: theme.typography.lineHeight.label,
            letterSpacing: 1,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          五维
        </Text>

        {/* 顺序固定为 ATTRIBUTE_KEYS，不按数值排——排序会让它读起来像排行榜 */}
        {ATTRIBUTE_KEYS.map((key) => {
          const points = player.attributes[key].points;
          return (
            <View key={key} style={{ marginBottom: theme.spacing.md }}>
              <View style={styles.row}>
                <Text
                  style={{
                    fontSize: theme.typography.size.body,
                    lineHeight: theme.typography.lineHeight.body,
                    color: palette.text,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  {ATTRIBUTE_LABEL[key]}
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
                  {points}
                </Text>
              </View>
              {/* 条的宽度按「点数 / 上限」，一眼看出哪一维走得远 */}
              <View
                style={{
                  marginTop: 4,
                  height: 3,
                  borderRadius: 1.5,
                  backgroundColor: palette.border,
                  overflow: 'hidden',
                }}
              >
                <View
                  style={{
                    width: `${Math.min(1, points / ATTR_POINTS_MAX) * 100}%`,
                    height: '100%',
                    borderRadius: 1.5,
                    backgroundColor: palette.primary,
                  }}
                />
              </View>
            </View>
          );
        })}

        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          每 200 点属性经验换 1 点。它不影响任何数值，只记录你把时间花在哪儿了。
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
