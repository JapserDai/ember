import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../../src/theme/ThemeProvider';
import {
  describeSchemeSupport,
  themeList,
  type Palette,
  type Theme,
  type ThemeId,
} from '../../src/theme/tokens';

/**
 * 主题选择页（从「设置 → 外观 → 主题」进入，docs/02 §4.3）。
 *
 * 四套主题竖排。每一条是三行信息：
 *   名字 → 一句话气质 → 一小块当前配色
 * 选中的那一条左侧有一条主色竖线，**不用对勾**：对勾是表单语言，
 * 这里是「你现在住在哪个房间里」，一条标在门边的记号更合适。
 *
 * 选晨光时它下面多一句「这套只有亮的」——这是它的设计主张，不是缺一版暗色。
 *
 * 写库失败时在页底显示一句人话，且**界面不切换**：
 * ThemeProvider 是先写库再改内存态，抛错时主题保持不变。
 */

/** 一条主题的配色小样：背景、主色、强调色，三块并排 */
function PaletteSwatch({ palette, size = 18 }: { palette: Palette; size?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3 }}>
      {[palette.background, palette.primary, palette.accent].map((color, index) => (
        <View
          key={index}
          style={{
            width: size,
            height: size,
            borderRadius: 3,
            backgroundColor: color,
            borderWidth: 1,
            // 小样里的背景色与页面底色可能几乎一样，加一层发丝描边才看得见边界
            borderColor: 'rgba(128,128,128,0.35)',
          }}
        />
      ))}
    </View>
  );
}

/** 一条主题 */
function ThemeOption({
  item,
  selected,
  onSelect,
}: {
  item: Theme;
  selected: boolean;
  onSelect: (id: ThemeId) => void;
}) {
  const { theme, palette } = useTheme();
  // 小样展示这套主题「自己的样子」：夜航的主场是暗色，就展示暗色板
  const previewPalette = item.defaultScheme === 'dark' ? item.dark : item.light;
  // 「这套只有亮的」这句由就 token 层给出，不在页面里写死主题 id
  const schemeSupport = describeSchemeSupport(item);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${item.name}。${item.tagline}${schemeSupport.note ? `。${schemeSupport.note}` : ''}`}
      onPress={() => onSelect(item.id)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'stretch',
        minHeight: theme.touchTarget,
        paddingVertical: theme.spacing.md,
        paddingLeft: theme.spacing.md,
        borderTopWidth: 1,
        borderTopColor: palette.border,
        opacity: pressed ? 0.55 : 1,
      })}
    >
      {/*
       * 选中标记：一条主色竖线。
       * 未选中时占同样宽度的透明条——不占位的话，选中时文字会整体右移一格，
       * 点一下所有字都跳一下，比没有反馈更让人分心。
       */}
      <View
        style={{
          width: 3,
          borderRadius: 2,
          marginRight: theme.spacing.md,
          backgroundColor: selected ? palette.primary : 'transparent',
        }}
      />

      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            fontWeight: selected
              ? theme.typography.weight.semibold
              : theme.typography.weight.regular,
            color: selected ? palette.text : palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {item.name}
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
          {item.tagline}
        </Text>
        {schemeSupport.note ? (
          <Text
            style={{
              marginTop: 2,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {schemeSupport.note}
          </Text>
        ) : null}
      </View>

      <View style={{ marginLeft: theme.spacing.md, justifyContent: 'center' }}>
        <PaletteSwatch palette={previewPalette} />
      </View>
    </Pressable>
  );
}

export default function ThemeScreen() {
  const { theme, palette, themeId, setThemeId } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /** 写库失败时的提示。为 null 表示一切正常 */
  const [errorText, setErrorText] = useState<string | null>(null);

  const handleSelect = (id: ThemeId) => {
    if (id === themeId) return;
    try {
      // 先写库；写失败会抛错，下面的两个 setState 都不会执行，界面保持原样
      setThemeId(id);
      setErrorText(null);
    } catch (err) {
      console.warn('[Ember] 切换主题失败', err);
      setErrorText('没能保存。主题还是原来那套，稍后再试一次。');
    }
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings');
    }
  };

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
            // 与「返回」拉开到 md：同为左对齐，靠太近会读成一个两行标题
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
            marginTop: theme.spacing.sm,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          换的是语气，不是功能。每一套下面的颜色是它自己的样子。
        </Text>
      </View>

      {/* 主题列表。整组是一个单选组，读屏会读出「已选中」 */}
      <View
        accessibilityRole="radiogroup"
        style={{ marginTop: theme.spacing.lg, paddingHorizontal: theme.spacing.pageX }}
      >
        <View style={{ borderBottomWidth: 1, borderBottomColor: palette.border }}>
          {themeList.map((item) => (
            <ThemeOption
              key={item.id}
              item={item}
              selected={item.id === themeId}
              onSelect={handleSelect}
            />
          ))}
        </View>
      </View>

      {errorText ? (
        <Text
          accessibilityRole="alert"
          style={{
            marginTop: theme.spacing.lg,
            paddingHorizontal: theme.spacing.pageX,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.danger,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {errorText}
        </Text>
      ) : null}
    </ScrollView>
  );
}
