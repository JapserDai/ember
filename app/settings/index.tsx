import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettingsRow } from '../../src/components/SettingsRow';
import { getSettings } from '../../src/db/repo/settings';
import { DIFFICULTY_LABEL_TEXT } from '../../src/domain/text-rules';
import { useTheme } from '../../src/theme/ThemeProvider';
import { describeSchemeSupport } from '../../src/theme/tokens';

/**
 * 设置页。
 *
 * 独立于底部 4 个 tab 之外，从「我的」页头右上角推上来（docs/02 §4.3）。
 * 打开后底栏消失，页面上唯一的出口是左上角的「返回」。
 *
 * 三组：外观 / 节奏 / 数据。分组沿用「账本」的排版——
 * 一个拉开的灰色小标签 + 通栏的行 + 发丝分隔线，没有卡片、没有箭头。
 *
 * 阶段 1 只有「主题」能点（进主题选择页），其余都还没接上。
 * 不能改的行要么显示真实值（readonly），要么标「之后」且不给点——
 * 不把未做的行做成「灰色可点」：点了没反应比不给点更让人困惑。
 */

/** 一组设置 */
interface SettingsGroup {
  title: string;
  /** 组标题下的一句说明。空字符串表示不写 */
  note: string;
  rows: Array<{
    label: string;
    /** 真实值。later 状态不显示这个 */
    value?: string;
    state: 'interactive' | 'readonly' | 'later';
    /** interactive 状态下的点击回调 */
    onPress?: () => void;
  }>;
}

/** 从库里读到的、需要显示在设置页上的值 */
interface SettingsValues {
  difficulty: string;
  dayStartHour: number;
}

/**
 * 读设置。只在挂载时执行一次（useState 的惰性初始化），不在每次渲染时查库。
 * 读失败时退回默认值——设置页不该因为一行数据把整个 App 卡住。
 */
function loadSettingsValues(): SettingsValues {
  try {
    const settings = getSettings();
    return {
      difficulty: DIFFICULTY_LABEL_TEXT[settings.difficulty] ?? DIFFICULTY_LABEL_TEXT.easy,
      dayStartHour: settings.day_start_hour,
    };
  } catch {
    return { difficulty: DIFFICULTY_LABEL_TEXT.easy, dayStartHour: 4 };
  }
}

export default function SettingsScreen() {
  const { theme, palette, themeMode, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [values] = useState<SettingsValues>(loadSettingsValues);

  /**
   * 明暗模式的中文说法。
   * 「跟随系统」是真实状态，不是「还没做」——它在库里就是 theme_mode='system'，
   * 而且此刻确实在生效。只是暂时还不能在界面上改。
   */
  const themeModeLabel =
    themeMode === 'system' ? '跟随系统' : themeMode === 'dark' ? '深色' : '浅色';

  /** 返回。深链直接打开设置页时没有上一页，退回「我的」而不是卡住 */
  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/me');
    }
  };

  /**
   * 三种状态的划分标准是「这个值现在存不存在」，不是「能不能改」：
   *   - readonly：库里有真实值、此刻正在生效，只是还没有修改入口
   *   - later：这个功能压根还没做，没有值可显示
   *
   * 不把「能改」当成唯一标准，是因为同一页里一半行显示真值、一半写「之后」，
   * 会让人以为显示真值的那几行能点。
   */
  const groups: SettingsGroup[] = [
    {
      title: '外观',
      note: '',
      rows: [
        {
          label: '主题',
          value: theme.name,
          state: 'interactive',
          onPress: () => router.push('/settings/theme'),
        },
        // 晨光没有暗色版：这一行写「只有亮的」，而不是一个看起来能切的模式。
        // 判断来自 tokens 层的 describeSchemeSupport，页面里不写死主题 id
        {
          label: '深浅',
          value: describeSchemeSupport(theme).canToggle ? themeModeLabel : '只有亮的',
          state: 'readonly',
        },
        { label: '动效', value: reduceMotion ? '已减弱' : '完整', state: 'readonly' },
      ],
    },
    {
      title: '节奏',
      note: '',
      rows: [
        { label: '难度', value: values.difficulty, state: 'readonly' },
        { label: '日界', value: `凌晨 ${values.dayStartHour} 点`, state: 'readonly' },
        { label: '提醒', state: 'later' },
      ],
    },
    {
      title: '数据',
      note: '备份还没做。在那之前，卸载会丢掉全部记录。',
      rows: [
        { label: '备份', state: 'later' },
        { label: '导入', state: 'later' },
      ],
    },
  ];

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.sm,
        paddingBottom: insets.bottom + theme.spacing.xxl,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/* 返回。纯文字，不用箭头：箭头是图标库的语言，这一页用字 */}
      <View style={{ paddingHorizontal: theme.spacing.pageX }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="返回我的"
          onPress={handleBack}
          style={({ pressed }) => ({
            // 触控目标 44×44（docs/02 §9）。两个字只有 30 宽，所以补一个最小宽度
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
            // 与「返回」拉开到 md：两者同为左对齐，靠得太近会读成一个两行标题
            marginTop: theme.spacing.md,
            fontSize: theme.typography.size.title,
            lineHeight: theme.typography.lineHeight.title,
            fontWeight: theme.typography.weight.semibold,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.title,
          }}
        >
          设置
        </Text>
      </View>

      {groups.map((group) => (
        <View
          key={group.title}
          style={{
            marginTop: theme.spacing.xl,
            paddingHorizontal: theme.spacing.pageX,
          }}
        >
          <Text
            style={{
              marginBottom: theme.spacing.xs,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              letterSpacing: 1,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {group.title}
          </Text>

          {group.note ? (
            <Text
              style={{
                marginBottom: theme.spacing.sm,
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {group.note}
            </Text>
          ) : null}

          <View style={{ borderTopWidth: 1, borderTopColor: palette.border }}>
            {group.rows.map((row, index) => (
              <SettingsRow
                key={row.label}
                label={row.label}
                value={row.value}
                state={row.state}
                onPress={row.onPress}
                divider={index > 0}
              />
            ))}
          </View>
        </View>
      ))}

      {/* 隐私说明。这不是法律文本，是一句实话 */}
      <View
        style={{
          marginTop: theme.spacing.xxl,
          paddingHorizontal: theme.spacing.pageX,
          paddingTop: theme.spacing.lg,
          borderTopWidth: 1,
          borderTopColor: palette.border,
        }}
      >
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          这个 App 没有网络权限。没有账号，没有服务器，数据只在这台手机上。
        </Text>
      </View>
    </ScrollView>
  );
}
