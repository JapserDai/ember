import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { PALETTES, THEME_LABEL, type ThemeId } from '../../src/theme/tokens';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 主题选择（设置 → 外观 → 主题）。
 *
 * ---- 为什么这一页在阶段 4 才出现 ----
 *
 * 阶段 1 把它删了（D27）：那时只有一套白底，一个只有一项的单选列表
 * 不是选择，是一个占位符。阶段 4 把另外三套做回来（D40），
 * 这一页才重新有了意义。
 *
 * ---- 为什么每一项是一张预览卡，而不是一行文字 ----
 *
 * 换主题是一个**看**的决定。一行「夜航」两个字说不出它长什么样，
 * 用户只能靠猜，或者选完再退回去看——那是三次导航。
 * 所以每一项都画出它自己的底、卡片、正文与主色，一眼就是它。
 *
 * 预览卡用的是**目标主题自己的色板**，不是当前主题的。这是这一页
 * 唯一一处「不读当前 theme」的地方，也是它必须做的事。
 *
 * ---- 为什么没有「跟随系统深浅」----
 *
 * 四套主题里已经各自包含了它自己的深浅（白 / 晨光是浅的，夜航是深的，
 * 苔原是浅的但低饱和）。再叠一层「跟随系统」会出现「白 + 系统深色」
 * 这种没有设计过的组合。`settings.theme_mode` 列仍然留着（已发布，不能删），
 * 但这一版不读也不写它。
 */
export default function ThemeScreen() {
  const { theme, palette, themeId, setThemeId } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };

  const choose = (id: ThemeId) => {
    if (busy || id === themeId) return;
    setBusy(true);
    setError(null);
    try {
      setThemeId(id);
    } catch (err) {
      console.warn('[Ember] 换主题失败', err);
      setError('刚才没换成，再试一次。');
    } finally {
      setBusy(false);
    }
  };

  // D59：只剩两套。苔原与晨光已删——`ThemeId` 类型里仍有它们（数据库 CHECK 的镜像），
  // 但选择页不该列出「选了等于没选」的选项。
  const ids: ThemeId[] = ['furnace', 'nightvoyage'];

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
          accessibilityLabel="返回设置"
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
          主题
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
          四套都只有一种长相，换的只是颜色。
        </Text>
      </View>

      {error ? (
        <View style={{ marginTop: theme.spacing.md, paddingHorizontal: theme.spacing.pageX }}>
          <Text
            accessibilityRole="alert"
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.danger,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {error}
          </Text>
        </View>
      ) : null}

      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        {ids.map((id) => (
          <ThemeCard
            key={id}
            id={id}
            selected={id === themeId}
            disabled={busy}
            onPress={() => choose(id)}
          />
        ))}
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
          换主题只改颜色，不动任何记录。
        </Text>
      </View>
    </ScrollView>
  );
}

/**
 * 一张主题预览卡。
 *
 * 用**目标主题自己的**色板画一张小样：底、卡片、一行正文、一个主色圆点。
 * 四样东西就够看出这套主题是什么气质，而再多画就成了另一页的缩略图。
 */
function ThemeCard({
  id,
  selected,
  disabled,
  onPress,
}: {
  id: ThemeId;
  selected: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme, palette } = useTheme();
  // 预览要用目标主题的色板，所以这里不能只靠 useTheme 的 palette
  // 预览要用目标主题的色板。`tundra` / `daybreak` 已不在 PALETTES 里（D59），
  // 所以这里要有回退——虽然选择页不会列出它们，但类型上它们仍可能出现。
  const preview = PALETTES[id as keyof typeof PALETTES] ?? PALETTES.furnace;
  const meta = THEME_LABEL[id];

  return (
    <Card style={{ marginBottom: theme.spacing.cardGap }} padding={0}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled }}
        accessibilityLabel={`${meta.name}。${meta.note}`}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          opacity: disabled ? 0.5 : pressed ? 0.55 : 1,
        })}
      >
        {/* 预览：目标主题的底 + 卡片 + 文字 + 主色点 */}
        <View
          style={{
            backgroundColor: preview.background,
            paddingVertical: theme.spacing.lg,
            paddingHorizontal: theme.spacing.cardPadding,
            borderTopLeftRadius: theme.radius.card,
            borderTopRightRadius: theme.radius.card,
          }}
        >
          <View
            style={{
              backgroundColor: preview.surface,
              borderRadius: theme.radius.card,
              padding: theme.spacing.sm,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            {/* 一个空心圈 + 一个实心圈：这套主题的「未完成 / 完成」 */}
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                borderWidth: 1.5,
                borderColor: preview.secondary,
                marginRight: theme.spacing.sm,
              }}
            />
            <View
              style={{
                width: 16,
                height: 16,
                borderRadius: 8,
                backgroundColor: preview.primary,
                marginRight: theme.spacing.sm,
              }}
            />
            <Text
              style={{
                flex: 1,
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: preview.text,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              今天
            </Text>
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: preview.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              3 / 5
            </Text>
          </View>
        </View>

        {/* 名字与说明 + 选中标记 */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingVertical: theme.spacing.md,
            paddingHorizontal: theme.spacing.cardPadding,
          }}
        >
          <View style={{ flexShrink: 1 }}>
            <Text
              style={{
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                fontWeight: selected
                  ? theme.typography.weight.semibold
                  : theme.typography.weight.regular,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {meta.name}
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
              {meta.note}
            </Text>
          </View>

          {/* 选中态：一个词，不用勾图标（这一版没有图标库） */}
          {selected ? (
            <Text
              style={{
                marginLeft: theme.spacing.md,
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                fontWeight: theme.typography.weight.medium,
                color: palette.primary,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              用着
            </Text>
          ) : null}
        </View>
      </Pressable>
    </Card>
  );
}
