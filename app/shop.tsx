import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../src/components/Card';
import { REFINE_RECIPE, SHOP_ITEMS } from '../src/domain/shop';
import {
  buyItem,
  getShopBalances,
  refineMaterial,
  type ShopBalances,
} from '../src/services/shop';
import { useTheme } from '../src/theme/ThemeProvider';

/**
 * 商店（阶段 4 第 5 条）+ 材料合成（第 6 条）。
 *
 * ---- 为什么两件事在同一页 ----
 *
 * 它们的输入是同一个东西（材料），输出也是同一个东西（更多材料）。
 * 拆成两页会让用户在「买」和「合」之间来回跳，而这两个动作的关系是
 * 「钱不够就攒，材料够了就合」——那是同一件事的两步。
 *
 * ---- 为什么只卖材料 ----
 *
 * 阶段 4 的降级方案是「全部用几何图形与文字排版」（docs/05），
 * 所以没有装饰品可卖；而数值加成被 D7 禁止（五维纯展示）。
 * 材料是唯一既有真实用途（修连胜）又不违反任何底线的东西。
 *
 * ---- 为什么不显示「超值」「限时」----
 *
 * 那些词是电商的语言，它们的目的是让人买得比想买的多。
 * 这一页的立场是「你需要就换」，所以每件商品只有名字、一句说明、价格。
 */
export default function ShopScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [balances, setBalances] = useState<ShopBalances>({
    ember: 0,
    material: 0,
    refinedMaterial: 0,
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const refresh = useCallback(() => {
    try {
      setBalances(getShopBalances());
      setError(false);
    } catch (err) {
      console.warn('[Ember] 读取商店余额失败', err);
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
    (itemId: string, name: string, price: number) => {
      if (busy) return;
      Alert.alert(`换一个「${name}」？`, `会花掉 ${price} 余烬。`, [
        { text: '算了', style: 'cancel' },
        {
          text: '换',
          onPress: () => {
            setBusy(true);
            setNotice(null);
            try {
              const result = buyItem(itemId);
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

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.sm,
        paddingBottom: insets.bottom + theme.spacing.xxl,
      }}
      showsVerticalScrollIndicator={false}
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
          商店
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
          余烬换材料。材料用来修连胜。
        </Text>
      </View>

      {/* 余额。三个数字并排，各自一张卡 */}
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

      {/* 商品 */}
      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        {SHOP_ITEMS.map((item) => {
          const affordable = balances.ember >= item.price;
          return (
            <Card key={item.id} style={{ marginBottom: theme.spacing.cardGap }}>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text
                  style={{
                    flex: 1,
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
                onPress={() => handleBuy(item.id, item.name, item.price)}
                disabled={busy}
                style={({ pressed }) => ({
                  marginTop: theme.spacing.sm,
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
                    color: affordable ? palette.primary : palette.textMuted,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  {affordable ? '换一个' : `还差 ${item.price - balances.ember}`}
                </Text>
              </Pressable>
            </Card>
          );
        })}
      </View>

      {/* 合成 */}
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
          合成
        </Text>

        <Card>
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {REFINE_RECIPE.input} 个材料 → {REFINE_RECIPE.output} 个精炼材料
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
            固定配方，不会失败。合成本身不花余烬。
          </Text>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`用 ${REFINE_RECIPE.input} 个材料合成 1 个精炼材料`}
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
                color:
                  balances.material >= REFINE_RECIPE.input ? palette.primary : palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {balances.material >= REFINE_RECIPE.input
                ? '合成一个'
                : `材料还差 ${REFINE_RECIPE.input - balances.material} 个`}
            </Text>
          </Pressable>
        </Card>
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
