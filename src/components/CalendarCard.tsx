import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from './Card';
import { buildMonth, monthKeyOf, shiftMonth } from '../domain/calendar';
import {
  getDayFacts,
  getMonthMarks,
  dayTitle,
  type DayFacts,
  type MonthMarks,
} from '../services/calendar';
import { useTheme } from '../theme/ThemeProvider';

/**
 * 首页的月历（D57）。
 *
 * ---- 它回答什么 ----
 *
 * 只回答「我哪天动过」。有打卡或有日记的那一天点亮一个点，点开一格看那天
 * 做了哪几件事、有没有写日记。**不能在这里新建、改日期、标截止日**——
 * 那等于把新建表单搬进日历，而这一轮刚把待办削成「只添加、删除」。
 *
 * ---- 为什么默认折叠成一行 ----
 *
 * 这一页的主体是「今天要做什么」。一上来摊开一个月历，会把习惯和待办推到
 * 首屏之外——那是把日历当成首页的主角。所以默认只占一行：
 * 「10 月 · 有记录 12 天」，点一下才展开格子。
 *
 * 展开之后不再自动收起：用户点开是因为想看，看着看着又自己合上会让人以为点错了。
 *
 * ---- 为什么是「点开一格」而不是「点了跳页」 ----
 *
 * 跳页之后用户要按返回才能回到今天，而这一页是每天开着的那一页。
 * 弹窗会打断。所以就地展开一小块：一行概况 + 最多 5 条任务名。
 */
export interface CalendarCardProps {
  /** 今天的业务日。用来标「今天」那一格、以及「昨天 / 今天」的相对说法 */
  today: string;
  /** 周起始。0 = 周日，1 = 周一，来自 settings.week_starts_on */
  weekStartsOn: number;
  /**
   * 刷新令牌。父页面每次记完一笔会把它 +1，日历据此重读当前月份。
   *
   * 为什么不让日历自己订阅：它只是一个只读的展示块，不该知道
   * 「打卡」这件事存在。传一个数字进来，它只管「变了就重读」。
   */
  refreshToken?: number;
}

export function CalendarCard({ today, weekStartsOn, refreshToken = 0 }: CalendarCardProps) {
  const { theme, palette } = useTheme();

  /** 展开的月份。null = 折叠成一行 */
  const [month, setMonth] = useState<string | null>(null);
  const [marks, setMarks] = useState<MonthMarks | null>(null);
  /** 选中的那一天。null = 没选 */
  const [picked, setPicked] = useState<DayFacts | null>(null);
  /** 读库失败。不编造「一天都没动过」 */
  const [failed, setFailed] = useState(false);

  const todayMonth = monthKeyOf(today);

  const load = useCallback((target: string) => {
    try {
      setMarks(getMonthMarks(target));
      setFailed(false);
    } catch (err) {
      console.warn('[Ember] 读日历失败', err);
      setMarks(null);
      setFailed(true);
    }
  }, []);

  // 展开时才读库：折叠状态下这一页不应该为看不到的东西付出一次查询。
  // refreshToken 变了也重读——刚记的那一笔要立刻出现在格子上
  useEffect(() => {
    if (month === null) return;
    load(month);
  }, [load, month, refreshToken]);

  const grid = useMemo(
    () => (month === null ? null : buildMonth(month, weekStartsOn)),
    [month, weekStartsOn]
  );

  const expand = () => {
    setMonth(todayMonth);
    setPicked(null);
  };

  const collapse = () => {
    setMonth(null);
    setPicked(null);
    setMarks(null);
    setFailed(false);
  };

  const goMonth = (n: number) => {
    if (month === null) return;
    const next = shiftMonth(month, n);
    setMonth(next);
    setPicked(null);
  };

  const pick = (date: string) => {
    try {
      setPicked(getDayFacts(date));
    } catch (err) {
      console.warn('[Ember] 读某一天失败', err);
    }
  };

  // 折叠态那一行：月份 + 有记录几天。没展开时不知道天数，所以只写月份
  const collapsedLabel = `${monthTitleOrFallback(todayMonth)} · 展开`;

  return (
    <Card style={{ marginTop: theme.spacing.xl, marginHorizontal: theme.spacing.pageX }} padding={0}>
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded: month !== null }}
      accessibilityLabel={
        month === null ? '展开这个月的记录' : '收起日历'
      }
      onPress={month === null ? expand : collapse}
      style={({ pressed }) => ({
        minHeight: theme.touchTarget,
        paddingHorizontal: theme.spacing.cardPadding,
        paddingVertical: theme.spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <Text
        style={{
          fontSize: theme.typography.size.caption,
          lineHeight: theme.typography.lineHeight.caption,
          fontWeight: theme.typography.weight.semibold,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {/* 折叠态与展开态的标题不同：折叠时要提示「能点开」，展开时只写月份 */}
        {month === null ? collapsedLabel : grid?.title ?? ''}
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
        {/*
         * 右侧这一格：有读数就报读数，没有就报操作。
         *
         * 说「有记录 12 天」而不是「12 / 31 天」：分母是日历天数，
         * 它既不是目标也不是额度，摆出来只会变成一种「才 12 天」的失败感。
         */}
        {failed
          ? '暂时读不出来'
          : marks
            ? `有记录 ${marks.activeDays} 天`
            : month === null
              ? ''
              : ''}
      </Text>
    </Pressable>

    {month !== null && grid ? (
      <View style={{ paddingHorizontal: theme.spacing.cardPadding, paddingBottom: theme.spacing.md }}>
        {/* 换月：‹ 月份 ›  。不放「回到今天」，因为今天是默认打开的那一个月 */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: theme.spacing.sm,
          }}
        >
          <MonthArrow label="上个月" glyph="‹" onPress={() => goMonth(-1)} />
          <Text
            style={{
              fontSize: theme.typography.size.label,
              lineHeight: theme.typography.lineHeight.label,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.body,
              fontVariant: ['tabular-nums'],
            }}
          >
            {grid.title}
          </Text>
          <MonthArrow
            label="下个月"
            glyph="›"
            // 不让翻到未来的月份：日历是回看用的，未来的格子永远是空的，
            // 而一个永远空的月份会让人以为「这个月坏了」
            disabled={shiftMonth(month, 1) > todayMonth}
            onPress={() => goMonth(1)}
          />
        </View>

        {/* 表头 */}
        <View style={{ flexDirection: 'row' }}>
          {grid.weekdays.map((name) => (
            <Text
              key={name}
              style={{
                flex: 1,
                textAlign: 'center',
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {name}
            </Text>
          ))}
        </View>

        {/* 格子：每行 7 个，按周切 */}
        {chunk(grid.cells, 7).map((row, rowIndex) => (
          <View key={rowIndex} style={{ flexDirection: 'row' }}>
            {row.map((cell, cellIndex) => {
              const date = cell.date;
              const marked = date !== null && marks?.marked.has(date) === true;
              const isToday = date === today;
              const isPicked = date !== null && picked?.date === date;

              return (
                <Pressable
                  key={`${rowIndex}-${cellIndex}`}
                  // 空格子不可点：它们不属于这个月，点了没有任何事会发生
                  disabled={date === null}
                  accessibilityRole={date === null ? undefined : 'button'}
                  accessibilityLabel={
                    date === null
                      ? undefined
                      : `${date}${marked ? '，有记录' : '，没有记录'}${isToday ? '，今天' : ''}`
                  }
                  onPress={date === null ? undefined : () => pick(date)}
                  style={{
                    flex: 1,
                    height: 34,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {date === null ? null : (
                    <>
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          alignItems: 'center',
                          justifyContent: 'center',
                          // 选中那一格填主色；今天那一格只描边——
                          // 两件事用两种画法，同时发生在今天身上也读得出来
                          backgroundColor: isPicked ? palette.primary : 'transparent',
                          borderWidth: isToday && !isPicked ? 1 : 0,
                          borderColor: palette.primary,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: theme.typography.size.caption,
                            lineHeight: theme.typography.lineHeight.caption,
                            color: isPicked
                              ? palette.onPrimary
                              : cell.inMonth
                                ? palette.text
                                : palette.textMuted,
                            fontFamily: theme.typography.fontFamily.body,
                            fontWeight: isToday
                              ? theme.typography.weight.semibold
                              : theme.typography.weight.regular,
                            fontVariant: ['tabular-nums'],
                          }}
                        >
                          {Number(date.slice(8, 10))}
                        </Text>
                      </View>

                      {/* 点：有记录的那一天。放在数字下方而不是压在数字上 */}
                      <View
                        style={{
                          width: 3,
                          height: 3,
                          borderRadius: 1.5,
                          marginTop: 1,
                          backgroundColor: isPicked
                            ? palette.primary
                            : marked
                              ? palette.secondary
                              : 'transparent',
                        }}
                      />
                    </>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}

        {/* 点开的那一天 */}
        {picked ? (
          <View
            style={{
              marginTop: theme.spacing.md,
              paddingTop: theme.spacing.sm,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: palette.border,
            }}
          >
            <Text
              style={{
                fontSize: theme.typography.size.label,
                lineHeight: theme.typography.lineHeight.label,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.body,
                fontWeight: theme.typography.weight.medium,
              }}
            >
              {dayTitle(picked.date, today)}
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
              {picked.checkinCount === 0 && !picked.hasJournal
                ? '这一天没有记录。'
                : [
                    picked.checkinCount > 0 ? `记了 ${picked.checkinCount} 件` : null,
                    picked.hasJournal ? '写了日记' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
            </Text>

            {picked.taskTitles.length > 0 ? (
              <Text
                style={{
                  marginTop: 4,
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {picked.taskTitles.join('、')}
              </Text>
            ) : null}

            {picked.journalExcerpt ? (
              <Text
                numberOfLines={2}
                style={{
                  marginTop: 4,
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                  fontStyle: 'italic',
                }}
              >
                {picked.journalExcerpt}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    ) : null}
    </Card>
  );
}

/** 换月箭头。用 SVG 以外的办法画：一个 20px 的文字箭头在中文系统里最稳 */
function MonthArrow({
  label,
  glyph,
  onPress,
  disabled = false,
}: {
  label: string;
  glyph: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { theme, palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={({ pressed }) => ({
        minWidth: theme.touchTarget,
        minHeight: theme.touchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.28 : pressed ? 0.5 : 1,
      })}
    >
      <Text
        allowFontScaling={false}
        style={{
          fontSize: 22,
          lineHeight: 24,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        {glyph}
      </Text>
    </Pressable>
  );
}

/** '2026-10' → '2026 年 10 月'。折叠态标题用 */
function monthTitleOrFallback(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return '日历';
  return `${m} 月`;
}

/** 把一维数组按 n 切片。月历的格子按行渲染 */
function chunk<T>(items: readonly T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}
