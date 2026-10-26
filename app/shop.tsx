import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../src/components/Card';
import { PageTitle } from '../src/components/PageTitle';
import { ShopMark } from '../src/components/ShopMark';
import { businessDate } from '../src/domain/date';
import {
  REFINE_RECIPE,
  REWARD_COST_MAX,
  REWARD_COST_MIN,
  REWARD_TITLE_MAX,
  checkRefine,
  itemsOfGroup,
  markOf,
  SHOP_GROUPS,
  type ShopBalances,
  type ShopItem,
} from '../src/domain/shop';
import { getSafeDayStartHour } from '../src/services/today';
import {
  buyItem,
  createCustomReward,
  getShopBalances,
  listCustomRewards,
  redeemCustomReward,
  refineMaterial,
  type CustomReward,
} from '../src/services/shop';
import { useTheme } from '../src/theme/ThemeProvider';

/**
 * 商店（阶段 4 第 5 条 + 第 6 条材料合成；D53 扩成四类 + 自定义奖励）。
 *
 * ---- 这一页的结构 ----
 *
 *   余额（三个数字）
 *   ↓
 *   四组商品：材料 / 精炼材料 / 保护（护盾 + 宽限券）/ 回看
 *   ↓
 *   合成（3 个材料 → 1 个精炼材料）
 *   ↓
 *   我的奖励（用户自己写的，自己标价，点兑换）
 *
 * ---- 为什么要把商品分组，而不是平铺 ----
 *
 * 原来三件商品全是材料，平铺没问题。扩成六件四类之后，平铺会让
 * 「一张护盾」和「一个材料」看起来是同一类东西——它们的名字都是「一个…」。
 * 分组之后，每组上面那句 `note` 回答「这类东西是干嘛的」：
 * 材料是补给，保护是容错，回看是补救。**那是三种不同的心理位置**，
 * 混在一起就只剩一张价目表。
 *
 * ---- 为什么每件商品有图形 ----
 *
 * 图形（`domain/shopMarks.ts`，坐标搬 Lucide）让扫视时先认出「这是哪种东西」，
 * 再读名字。文字要读完才知道，图形一眼就知道。
 *
 * ---- 为什么不显示「超值」「限时」「仅剩 3 件」 ----
 *
 * 那是电商的语言，目的是让人买得比想买的多。这一页的立场是「你需要就换」，
 * 所以每件商品只有：图形、名字、一句说明、价格、一个动作。
 *
 * ---- 为什么两件事（买与合）在同一页 ----
 *
 * 它们的输入是同一个东西（材料），输出也是同一个东西（更多材料）。
 * 拆成两页会让用户在「买」和「合」之间来回跳，而这两个动作的关系是
 * 「钱不够就攒，材料够了就合」——那是同一件事的两步。
 */
/**
 * 四个商品组 → 自然色（D59）。
 *
 * 材料 = 叶（补给是长出来的）、精炼 = 土（更深一层）、
 * 保护 = 天（挡雨的）、回看 = 花（回头看是开出来的）。
 */
const GROUP_TINT: Record<string, 'leaf' | 'earth' | 'sky' | 'petal'> = {
  material: 'leaf',
  refined: 'earth',
  shield: 'sky',
  restore: 'petal',
};

export default function ShopScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [balances, setBalances] = useState<ShopBalances>({
    ember: 0,
    material: 0,
    refinedMaterial: 0,
    graceTickets: 0,
    streakShields: 0,
    restoreTokens: 0,
  });
  const [rewards, setRewards] = useState<CustomReward[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState(false);

  // 新建奖励的表单
  const [draftTitle, setDraftTitle] = useState('');
  const [draftCost, setDraftCost] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  const refresh = useCallback(() => {
    try {
      setBalances(getShopBalances());
      setRewards(listCustomRewards());
      setError(false);
    } catch (err) {
      console.warn('[Ember] 读取商店数据失败', err);
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
    else router.replace('/me');
  };

  const handleBuy = useCallback(
    (item: ShopItem) => {
      if (busy) return;
      Alert.alert(`换一个「${item.name}」？`, `会花掉 ${item.price} 余烬。`, [
        { text: '算了', style: 'cancel' },
        {
          text: '换',
          onPress: () => {
            setBusy(true);
            setNotice(null);
            try {
              const result = buyItem(item.id);
              setNotice(result.message);
              refresh();
            } catch (err) {
              console.warn('[Ember] 购买失败', err);
              setNotice('刚才没换成，再试一次。');
            } finally {
              setBusy(false);
            }
          },
        },
      ]);
    },
    [busy, refresh]
  );

  const handleRefine = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const result = refineMaterial();
      setNotice(result.message);
      refresh();
    } catch (err) {
      console.warn('[Ember] 合成失败', err);
      setNotice('刚才没合成，再试一次。');
    } finally {
      setBusy(false);
    }
  }, [busy, refresh]);

  const handleCreateReward = useCallback(() => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const todayKey = businessDate(Date.now(), getSafeDayStartHour());
      const result = createCustomReward({
        title: draftTitle,
        emberCost: Number.parseInt(draftCost, 10),
        todayKey,
      });
      setNotice(result.message);
      if (result.ok) {
        setDraftTitle('');
        setDraftCost('');
        setFormOpen(false);
      }
      refresh();
    } catch (err) {
      console.warn('[Ember] 新建奖励失败', err);
      setNotice('刚才没加上，再试一次。');
    } finally {
      setBusy(false);
    }
  }, [busy, draftCost, draftTitle, refresh]);

  const handleRedeem = useCallback(
    (reward: CustomReward) => {
      if (busy) return;
      Alert.alert(`兑「${reward.title}」？`, `会花掉 ${reward.emberCost} 余烬。`, [
        { text: '算了', style: 'cancel' },
        {
          text: '兑',
          onPress: () => {
            setBusy(true);
            setNotice(null);
            try {
              const result = redeemCustomReward(reward.id, reward.emberCost);
              setNotice(result.message);
              refresh();
            } catch (err) {
              console.warn('[Ember] 兑换失败', err);
              setNotice('刚才没换成，再试一次。');
            } finally {
              setBusy(false);
            }
          },
        },
      ]);
    },
    [busy, refresh]
  );

  const refineCheck = checkRefine(balances.material);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.sm,
        paddingBottom: insets.bottom + theme.spacing.xxl,
      }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ paddingHorizontal: theme.spacing.pageX }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回我的"
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

        <View style={{ marginTop: theme.spacing.md }}>
          <PageTitle
            title="商店"
            mark="flower"
            subtitle="余烬换补给、保护和回看。也可以把它换成你自己想要的东西。"
          />
        </View>
      </View>

      {/* 余额。六个数字两行：前三个是「钱」，后三个是「票」 */}
      <View
        style={{
          marginTop: theme.spacing.lg,
          paddingHorizontal: theme.spacing.pageX,
          flexDirection: 'row',
          columnGap: theme.spacing.cardGap,
        }}
      >
        <BalanceTile label="余烬" value={balances.ember} />
        <BalanceTile label="材料" value={balances.material} />
        <BalanceTile label="精炼" value={balances.refinedMaterial} />
      </View>
      <View
        style={{
          marginTop: theme.spacing.cardGap,
          paddingHorizontal: theme.spacing.pageX,
          flexDirection: 'row',
          columnGap: theme.spacing.cardGap,
        }}
      >
        <BalanceTile label="宽限券" value={balances.graceTickets} />
        <BalanceTile label="护盾" value={balances.streakShields} />
        <BalanceTile label="回看券" value={balances.restoreTokens} />
      </View>

      {error ? (
        <Card style={{ marginTop: theme.spacing.cardGap, marginHorizontal: theme.spacing.pageX }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            余额暂时读不出来，显示的是 0。买东西之前先回来看一眼。
          </Text>
        </Card>
      ) : null}

      {notice ? (
        <View style={{ marginTop: theme.spacing.md, paddingHorizontal: theme.spacing.pageX }}>
          <Text
            accessibilityRole="alert"
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {notice}
          </Text>
        </View>
      ) : null}

      {/* ---- 四组商品 ---- */}
      {SHOP_GROUPS.map((group) => {
        const items = itemsOfGroup(group.category);
        if (items.length === 0) return null;
        return (
          <View
            key={group.category}
            style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}
          >
            <GroupLabel
              text={group.title}
              note={group.note}
              tint={palette.nature[GROUP_TINT[group.category]]}
            />
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                balances={balances}
                busy={busy}
                onBuy={() => handleBuy(item)}
              />
            ))}
          </View>
        );
      })}

      {/* ---- 合成 ---- */}
      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <GroupLabel
          text="合成"
          note="把普通材料换成精炼材料。固定配方，不会失败。"
          tint={palette.nature.leaf}
        />

        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <ShopMark mark="material" size={24} />
            <Text
              style={{
                marginHorizontal: theme.spacing.sm,
                fontSize: theme.typography.size.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              ×{REFINE_RECIPE.input}
            </Text>
            <Text
              style={{
                fontSize: theme.typography.size.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              →
            </Text>
            <View style={{ marginLeft: theme.spacing.sm }}>
              <ShopMark mark="refined" size={24} />
            </View>
          </View>

          <Text
            style={{
              marginTop: theme.spacing.sm,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            合成不花余烬。
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              refineCheck.ok
                ? `用 ${REFINE_RECIPE.input} 个材料合成 1 个精炼材料`
                : `材料还差 ${REFINE_RECIPE.input - balances.material} 个`
            }
            accessibilityState={{ disabled: busy }}
            onPress={handleRefine}
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
                color: refineCheck.ok ? palette.primary : palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {refineCheck.ok
                ? refineCheck.times > 1
                  ? `合成 ${refineCheck.times} 个`
                  : '合成一个'
                : `材料还差 ${REFINE_RECIPE.input - balances.material} 个`}
            </Text>
          </Pressable>
        </Card>
      </View>

      {/* ---- 我的奖励（D53：docs/01 采纳人升的那一条）---- */}
      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <GroupLabel
          text="我的奖励"
          note="自己写、自己标价。兑换了就记一次，不加经验。"
          tint={palette.nature.petal}
        />

        {rewards.length === 0 && !formOpen ? (
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ShopMark mark="custom" size={24} />
              <Text
                style={{
                  flex: 1,
                  marginLeft: theme.spacing.sm,
                  fontSize: theme.typography.size.body,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                还没有。写一个想要的东西——看一集剧、买一本书、睡到自然醒。
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="加一个奖励"
              onPress={() => setFormOpen(true)}
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
                加一个
              </Text>
            </Pressable>
          </Card>
        ) : null}

        {rewards.map((reward) => {
          const affordable = balances.ember >= reward.emberCost;
          return (
            <Card key={reward.id} style={{ marginBottom: theme.spacing.cardGap }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <ShopMark mark="custom" size={24} />
                <Text
                  style={{
                    flex: 1,
                    marginLeft: theme.spacing.sm,
                    fontSize: theme.typography.size.body,
                    lineHeight: theme.typography.lineHeight.body,
                    color: palette.text,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                  numberOfLines={2}
                >
                  {reward.title}
                </Text>
                <Text
                  style={{
                    marginLeft: theme.spacing.md,
                    fontSize: theme.typography.size.caption,
                    lineHeight: theme.typography.lineHeight.caption,
                    color: affordable ? palette.text : palette.textMuted,
                    fontFamily: theme.typography.fontFamily.body,
                    fontVariant: ['tabular-nums'],
                  }}
                >
                  {reward.emberCost} 余烬
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`兑换${reward.title}，${reward.emberCost} 余烬`}
                accessibilityState={{ disabled: busy }}
                onPress={() => handleRedeem(reward)}
                disabled={busy}
                style={({ pressed }) => ({
                  marginTop: theme.spacing.sm,
                  alignSelf: 'flex-start',
                  minHeight: theme.touchTarget,
                  justifyContent: 'center',
                  // 兑不起时按钮仍然可点：点了会说「还差 X」，
                  // 而灰掉不给点会让人以为这一项坏了
                  opacity: busy ? 0.5 : pressed ? 0.55 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: theme.typography.size.label,
                    lineHeight: theme.typography.lineHeight.label,
                    fontWeight: theme.typography.weight.medium,
                    color: affordable ? palette.primary : palette.textMuted,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  {affordable ? '兑' : `还差 ${reward.emberCost - balances.ember}`}
                </Text>
              </Pressable>
            </Card>
          );
        })}

        {/* 表单：默认收起，点了「加一个」才展开 */}
        {formOpen ? (
          <Card style={{ marginTop: theme.spacing.cardGap }}>
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              想要什么
            </Text>
            <TextInput
              value={draftTitle}
              onChangeText={setDraftTitle}
              placeholder="看一集剧"
              placeholderTextColor={palette.textMuted}
              maxLength={REWARD_TITLE_MAX}
              style={{
                marginTop: theme.spacing.xs,
                minHeight: theme.touchTarget,
                paddingVertical: theme.spacing.xs,
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.body,
                borderBottomWidth: 1,
                borderBottomColor: palette.border,
              }}
            />

            <Text
              style={{
                marginTop: theme.spacing.md,
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              多少余烬（{REWARD_COST_MIN}–{REWARD_COST_MAX}）
            </Text>
            <TextInput
              value={draftCost}
              onChangeText={(text) => setDraftCost(text.replace(/[^0-9]/g, ''))}
              placeholder="120"
              placeholderTextColor={palette.textMuted}
              keyboardType="number-pad"
              style={{
                marginTop: theme.spacing.xs,
                minHeight: theme.touchTarget,
                paddingVertical: theme.spacing.xs,
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.body,
                fontVariant: ['tabular-nums'],
                borderBottomWidth: 1,
                borderBottomColor: palette.border,
              }}
            />

            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="加上这个奖励"
                accessibilityState={{ disabled: busy }}
                onPress={handleCreateReward}
                disabled={busy}
                style={({ pressed }) => ({
                  marginTop: theme.spacing.sm,
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
                  加上
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="先不加了"
                onPress={() => setFormOpen(false)}
                style={({ pressed }) => ({
                  marginTop: theme.spacing.sm,
                  marginLeft: theme.spacing.lg,
                  minHeight: theme.touchTarget,
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
                  先不加
                </Text>
              </Pressable>
            </View>
          </Card>
        ) : (
          rewards.length > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="再加一个奖励"
              onPress={() => setFormOpen(true)}
              style={({ pressed }) => ({
                marginTop: theme.spacing.sm,
                minHeight: theme.touchTarget,
                justifyContent: 'center',
                alignSelf: 'flex-start',
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
                再加一个
              </Text>
            </Pressable>
          )
        )}
      </View>

      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          余烬靠日常记录攒。这里不卖数值，也不卖装饰。
        </Text>
      </View>
    </ScrollView>
  );
}

/** 组标题。与称号图鉴的 GroupLabel 同一套：小标签 + 一句说明 */
/**
 * 组标题（D59：加了一个洗色圆点）。
 *
 * 圆点用该组的自然色**墨色**（不是洗色）。洗色在 8px 上根本看不见——
 * 那是给整块卡片垫底用的浓度，缩到一颗点上就消失了（真图上验过）。
 *
 * 为什么是圆点而不是给整组卡片上色：整组上色会把这一页变成色块拼贴，
 * 而圆点只是标记，卡片仍是纸。
 */
function GroupLabel({
  text,
  note,
  tint,
}: {
  text: string;
  note: string;
  tint?: string;
}) {
  const { theme, palette } = useTheme();
  return (
    <View style={{ marginBottom: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        {tint ? (
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: tint,
              marginBottom: 2,
            }}
          />
        ) : null}
      <Text
        style={{
          fontSize: theme.typography.size.label,
          lineHeight: theme.typography.lineHeight.label,
          fontWeight: theme.typography.weight.semibold,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {text}
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
        {note}
      </Text>
      </View>
    </View>
  );
}

/**
 * 一件商品。
 *
 * 结构：图形 + 名字 / 价格 → 一句说明 → 一个动作。
 * 图形左对齐、与名字同一条基线，因为它说的是「这是哪一类」，
 * 而名字说的是「具体是哪个」——先认类，再读名。
 */
function ItemCard({
  item,
  balances,
  busy,
  onBuy,
}: {
  item: ShopItem;
  balances: ShopBalances;
  busy: boolean;
  onBuy: () => void;
}) {
  const { theme, palette } = useTheme();
  const affordable = balances.ember >= item.price;
  // 持有上限：只有宽限券有。到了上限就说明白，而不是让用户点了才发现
  const atCap =
    item.holdCap !== undefined &&
    item.grant.graceTickets !== undefined &&
    balances.graceTickets + item.grant.graceTickets > item.holdCap;

  return (
    <Card style={{ marginBottom: theme.spacing.cardGap }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <ShopMark mark={markOf(item)} size={26} />
        <Text
          style={{
            flex: 1,
            marginLeft: theme.spacing.sm,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {item.name}
        </Text>
        <Text
          style={{
            marginLeft: theme.spacing.md,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            color: affordable ? palette.text : palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
            fontVariant: ['tabular-nums'],
          }}
        >
          {item.price} 余烬
        </Text>
      </View>

      <Text
        style={{
          marginTop: 2,
          marginLeft: 26 + theme.spacing.sm,
          fontSize: theme.typography.size.caption,
          lineHeight: theme.typography.lineHeight.caption,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {item.note}
      </Text>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`换一个${item.name}，${item.price} 余烬`}
        accessibilityState={{ disabled: busy }}
        onPress={onBuy}
        disabled={busy}
        style={({ pressed }) => ({
          marginTop: theme.spacing.sm,
          marginLeft: 26 + theme.spacing.sm,
          alignSelf: 'flex-start',
          minHeight: theme.touchTarget,
          justifyContent: 'center',
          // 买不起时按钮仍然可点：点了会说「还差 X」，
          // 而灰掉不给点会让人以为这一项坏了
          opacity: busy ? 0.5 : pressed ? 0.55 : 1,
        })}
      >
        <Text
          style={{
            fontSize: theme.typography.size.label,
            lineHeight: theme.typography.lineHeight.label,
            fontWeight: theme.typography.weight.medium,
            color: affordable && !atCap ? palette.primary : palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {atCap
            ? `最多 ${item.holdCap} 张`
            : affordable
              ? '换一个'
              : `还差 ${item.price - balances.ember}`}
        </Text>
      </Pressable>
    </Card>
  );
}

/** 一个余额数字。与「我的」页的小数据点同一套：小标签 + 大数字 */
function BalanceTile({ label, value }: { label: string; value: number }) {
  const { theme, palette } = useTheme();
  return (
    <Card style={{ flex: 1 }}>
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
          fontVariant: ['tabular-nums'],
        }}
      >
        {value}
      </Text>
    </Card>
  );
}
