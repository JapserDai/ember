import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { getSettings } from '../../src/db/repo/settings';
import {
  DEFAULT_JOURNAL_PREFS,
  JOURNAL_HISTORY_OPTIONS,
  JOURNAL_LIMIT_OPTIONS,
  parseJournalPrefs,
  sameJournalPrefs,
  type JournalHistoryLimit,
  type JournalLimit,
  type JournalPrefs,
} from '../../src/domain/journalPrefs';
import { saveJournalPrefs } from '../../src/services/journalPrefs';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 日记设置（设置 → 日记，D65）。
 *
 * ---- 三项，都不是「外观」 ----
 *
 *   1. 一天最多写多少字（500 / 2000 / 5000）；
 *   2. 历史列表显示几条（30 / 60 / 全部）；
 *   3. 是否显示「120 / 2000」那个字数计数。
 *
 * 前两项影响**写进库的内容**与**读多少行**，第三项才是纯外观。
 * 它们与「首页」那四个开关分开一页，因为那些开关说的是
 * 「今天那一页长什么样」，而这三项说的是「日记怎么工作」。
 *
 * ---- 一句必须写在页面上的话 ----
 *
 * 「字数上限只影响之后写的内容」。用户把它从 2000 调到 500 时，
 * 很自然会担心「我以前写的那几百字会怎样」。答案是不会被截断——
 * 那些是已经写下的事实。这句话不说清，用户会不敢改。
 */
export default function JournalPrefsScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [prefs, setPrefs] = useState<JournalPrefs>(() => {
    try {
      return parseJournalPrefs(getSettings().journal_prefs);
    } catch {
      return DEFAULT_JOURNAL_PREFS;
    }
  });
  const [error, setError] = useState<string | null>(null);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
  };

  /** 改一项：先写库，写成功才改界面 */
  const patch = (next: Partial<JournalPrefs>) => {
    const merged = { ...prefs, ...next };
    if (sameJournalPrefs(merged, prefs)) return;

    try {
      saveJournalPrefs(merged);
      setPrefs(merged);
      setError(null);
    } catch (err) {
      console.warn('[Ember] 保存日记偏好失败', err);
      setError('刚才没存下来，再试一次。');
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
              color: palette.primary,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            ‹ 设置
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
          日记
        </Text>
        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          改的是日记页怎么工作，不会动已经写下的内容。
        </Text>
      </View>

      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <SectionLabel text="一天最多写多少字" />
        <View accessibilityRole="radiogroup">
          {JOURNAL_LIMIT_OPTIONS.map((option) => (
            <ChoiceRow
              key={String(option.value)}
              label={option.label}
              selected={prefs.bodyLimit === option.value}
              onPress={() => patch({ bodyLimit: option.value as JournalLimit })}
            />
          ))}
        </View>
        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          只影响之后写的内容。以前写下的长日记不会被截断。
        </Text>

        <View style={{ marginTop: theme.spacing.xl }}>
          <SectionLabel text="历史显示几条" />
          <View accessibilityRole="radiogroup">
            {JOURNAL_HISTORY_OPTIONS.map((option) => (
              <ChoiceRow
                key={String(option.value)}
                label={option.label}
                selected={prefs.historyLimit === option.value}
                onPress={() => patch({ historyLimit: option.value as JournalHistoryLimit })}
              />
            ))}
          </View>
          <Text
            style={{
              marginTop: theme.spacing.xs,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            更早的永远在「看更早的」里，不会因为这里选少了而丢掉。
          </Text>
        </View>

        <View style={{ marginTop: theme.spacing.xl }}>
          <SectionLabel text="字数计数" />
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: prefs.showCounter }}
            accessibilityLabel="显示字数计数"
            onPress={() => patch({ showCounter: !prefs.showCounter })}
            style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
          >
            <Card>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontSize: theme.typography.size.body,
                      lineHeight: theme.typography.lineHeight.body,
                      color: palette.text,
                      fontFamily: theme.typography.fontFamily.body,
                    }}
                  >
                    显示「120 / 2000」
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
                    关掉之后输入框右上角不再显示字数
                  </Text>
                </View>
                <Text
                  style={{
                    marginLeft: theme.spacing.md,
                    fontSize: theme.typography.size.label,
                    lineHeight: theme.typography.lineHeight.label,
                    color: prefs.showCounter ? palette.primary : palette.textMuted,
                    fontFamily: theme.typography.fontFamily.body,
                    fontWeight: theme.typography.weight.medium,
                  }}
                >
                  {prefs.showCounter ? '开' : '关'}
                </Text>
              </View>
            </Card>
          </Pressable>
        </View>

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
    </ScrollView>
  );
}

function SectionLabel({ text }: { text: string }) {
  const { theme, palette } = useTheme();
  return (
    <Text
      style={{
        marginBottom: theme.spacing.xs,
        fontSize: theme.typography.size.caption,
        lineHeight: theme.typography.lineHeight.caption,
        color: palette.textMuted,
        fontFamily: theme.typography.fontFamily.body,
      }}
    >
      {text}
    </Text>
  );
}

/** 一个单选项。与首页设置页同一个形态 */
function ChoiceRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { theme, palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
    >
      <Card style={{ marginBottom: theme.spacing.cardGap }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{
              flex: 1,
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {label}
          </Text>
          <View
            style={{
              width: 18,
              height: 18,
              borderRadius: 9,
              borderWidth: selected ? 0 : 1.5,
              borderColor: palette.secondary,
              backgroundColor: selected ? palette.primary : 'transparent',
            }}
          />
        </View>
      </Card>
    </Pressable>
  );
}
