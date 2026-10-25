import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { addDays, addMonths, isDateKey } from '../domain/date';
import { formatDueLabel } from '../domain/goals';
import { useTheme } from '../theme/ThemeProvider';

/**
 * 截止日选择。
 *
 * **默认不限期。** 大多数目标不需要日期，硬给一个「选择日期」的日历只会
 * 让人觉得「我得先想清楚哪天算完成」——那正是多数人放弃写目标的地方。
 *
 * 所以第一排是几个相对日期（一周后 / 一个月后 / 三个月后），点一下就定；
 * 想写具体某天才展开输入框。相对日期在这里算成绝对日期存进去：
 * 「一个月后」在三个月后回看，应该还是当初那个日子，而不是永远往后滑。
 *
 * 输入框收 `YYYY-MM-DD`，不接受「3月1日」这类写法：
 * 解析中文日期的规则太多（今年？明年？闰月？），猜错一次就会写进一个错的日子，
 * 而用户以为自己写对了。格式不对时只提示一句格式，不评价内容。
 *
 * 不显示倒计时，不因过期变红（docs/02 §3.2）。
 */

export interface DueDateFieldProps {
  /** 当前截止日 YYYY-MM-DD。null 表示不限期 */
  value: string | null;
  /** 今天的业务日，用来算相对日期与「同年」判断 */
  todayKey: string;
  onChange: (next: string | null) => void;
}

/** 相对日期选项。n 与单位在这里定义，避免在 JSX 里散落数字 */
const PRESETS: ReadonlyArray<{ label: string; resolve: (today: string) => string }> = [
  { label: '一周后', resolve: (today) => addDays(today, 7) },
  { label: '一个月后', resolve: (today) => addMonths(today, 1) },
  { label: '三个月后', resolve: (today) => addMonths(today, 3) },
];

export function DueDateField({ value, todayKey, onChange }: DueDateFieldProps) {
  const { theme, palette } = useTheme();

  /** 是否展开「自己写日期」的输入框 */
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);

  const label = formatDueLabel(value, todayKey);
  // 当前这一天既不是「不限期」也不是某个预设 → 是用户自己写的日期
  const isCustom =
    value !== null && !PRESETS.some((preset) => preset.resolve(todayKey) === value);

  const pickPreset = (next: string | null) => {
    onChange(next);
    setTyping(false);
    setErrorText(null);
  };

  const commitDraft = () => {
    const text = draft.trim();
    if (text.length === 0) {
      // 清空输入框等于「还是不限期」，不算错误
      onChange(null);
      setTyping(false);
      setErrorText(null);
      return;
    }
    if (!isDateKey(text)) {
      setErrorText('写成 2027-03-01 这样的格式。');
      return;
    }
    onChange(text);
    setTyping(false);
    setErrorText(null);
  };

  return (
    <View>
      {/* 当前状态。选中的那个预设会用正文色，其余是次要色 */}
      <Text
        style={{
          fontSize: theme.typography.size.caption,
          lineHeight: theme.typography.lineHeight.caption,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        截止日
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: theme.spacing.sm }}>
        <Chip
          label="不限期"
          selected={value === null}
          onPress={() => pickPreset(null)}
          first
        />
        {PRESETS.map((preset) => {
          const resolved = preset.resolve(todayKey);
          return (
            <Chip
              key={preset.label}
              label={preset.label}
              selected={value === resolved}
              onPress={() => pickPreset(resolved)}
            />
          );
        })}
        <Chip
          label="写日期"
          selected={isCustom && !typing}
          onPress={() => {
            setDraft(value ?? '');
            setTyping((prev) => !prev);
            setErrorText(null);
          }}
        />
      </View>

      {/* 当前选中的是哪一天。不限期时不出这一行，避免多一句废话 */}
      {label ? (
        <Text
          style={{
            marginTop: theme.spacing.sm,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          就到 {label}。不显示倒计时，过了这一天也不会变红。
        </Text>
      ) : null}

      {typing ? (
        <View style={{ marginTop: theme.spacing.sm }}>
          <TextInput
            value={draft}
            onChangeText={(next) => {
              setDraft(next);
              if (errorText) setErrorText(null);
            }}
            placeholder="2027-03-01"
            placeholderTextColor={palette.textMuted}
            maxLength={10}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={commitDraft}
            accessibilityLabel="截止日，格式为年-月-日"
            style={{
              minHeight: theme.touchTarget,
              paddingVertical: theme.spacing.sm,
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.body,
              borderBottomWidth: 1,
              borderBottomColor: palette.rule,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="用这一天"
            onPress={commitDraft}
            style={({ pressed }) => ({
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
              用这一天
            </Text>
          </Pressable>
          {errorText ? (
            <Text
              accessibilityRole="alert"
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.danger,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {errorText}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * 一个日期选项。
 *
 * 选中态用「边框变主色 + 文字变正文色」，不填底色：
 * 四个胶囊里有一个实心块，会在这一页抢走标题的分量。
 */
function Chip({
  label,
  selected,
  onPress,
  first = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  first?: boolean;
}) {
  const { theme, palette } = useTheme();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        /*
         *
         * 外观走查（1.5 倍字号）改的一处：40 → minHeight 跟着行高走，
         * 理由同 reminders.tsx 的 TimeChip（同一套胶囊，两处必须一致）。
         */
        minHeight: theme.typography.lineHeight.caption + 24,
        paddingHorizontal: theme.spacing.md,
        marginLeft: first ? 0 : theme.spacing.xs,
        marginBottom: theme.spacing.xs,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.pill,
        borderWidth: 1,
        borderColor: selected ? palette.primary : palette.border,
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <Text
        style={{
          fontSize: theme.typography.size.caption,
          lineHeight: theme.typography.lineHeight.caption,
          color: selected ? palette.text : palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
