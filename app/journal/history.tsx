import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { formatDateLabel } from '../../src/domain/date';
import {
  JOURNAL_PAGE_SIZE,
  getJournalPage,
  type JournalHistoryItem,
} from '../../src/services/journal';
import { requestJournalDay } from '../../src/services/journalHandoff';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 全部日记（Q9(a)，从日记页的「看全部」进来）。
 *
 * ---- 为什么单独一页 ----
 *
 * 日记首页只取最近 60 天：它要留出「今天写一句」与复盘入口的位置，
 * 把几年的内容全铺上去会让那一页永远滚不到底。但 60 天之后的内容
 * **必须有个地方能看**——否则用户会以为日记丢了，而「数据只在这台手机上」
 * 是这个 App 的第一条承诺，丢东西这件事连「看起来像」都不行。
 *
 * ---- 为什么是「往前翻」而不是一次全查 ----
 *
 * 一天一条，一年 365 条，十年 3650 条。全查出来渲染一屏卡片，
 * 在低端安卓上是一次可感知的卡顿。分页用「日期游标」而不是 OFFSET：
 * 主键就是日期，`WHERE local_date < ?` 直接走索引，翻页期间改了一条日记也不会错位。
 *
 * ---- 点一天会发生什么 ----
 *
 * **回日记页去改**，不在这里就地编辑。
 * 就地编辑意味着这一页也要有「存下来 / 清空 / 草稿保护」一整套状态，
 * 而那套逻辑已经在日记页里了——两处各写一遍，迟早有一处忘了保护草稿。
 * 所以这里只负责「找到那一天」，点一下带着日期回到日记页。
 */
export default function JournalHistoryScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [items, setItems] = useState<JournalHistoryItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalDays, setTotalDays] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  /** 读第一页。每次聚焦都重读——可能刚在日记页改了某一天 */
  const refresh = useCallback(() => {
    try {
      const page = getJournalPage(null, JOURNAL_PAGE_SIZE);
      setItems(page.items);
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setTotalDays(page.totalDays);
      setError(false);
    } catch (err) {
      console.warn('[Ember] 读取全部日记失败', err);
      setError(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  /** 往前翻一页，追加到列表末尾 */
  const loadMore = useCallback(() => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = getJournalPage(cursor, JOURNAL_PAGE_SIZE);
      // 按日期去重：翻页期间若在别处补写了同一天，两条会撞主键
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.localDate));
        return [...prev, ...page.items.filter((item) => !seen.has(item.localDate))];
      });
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
      setTotalDays(page.totalDays);
    } catch (err) {
      console.warn('[Ember] 翻页失败', err);
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/journal');
  };

  /**
   * 点一天：回到日记页，并让日记页打开那一天。
   *
   * 用 `back()` 而不是 `push('/journal')`：这一页本来就是从日记页推进来的，
   * 退回去才是「回去改」的意思。push 会在栈里叠第二个日记页，
   * 用户按返回时会先看到那个重复的页面。
   *
   * 日期通过 `services/journalHandoff.ts` 交过去，**不走路由参数**——
   * 理由写在那个文件头（tab 的 params 会一直留着，删不掉）。
   */
  const openDay = (localDate: string) => {
    requestJournalDay(localDate);
    if (router.canGoBack()) router.back();
    else router.replace('/journal');
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
          accessibilityLabel="返回日记"
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
          写过的日子
        </Text>

        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
            fontVariant: ['tabular-nums'],
          }}
        >
          {totalDays > 0
            ? `一共 ${totalDays} 天。点一天，回到那一页改。`
            : '还没有写过的日子。'}
        </Text>
      </View>

      {error ? (
        <Card style={{ marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.pageX }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {items.length > 0
              ? '刚才没读到新数据，显示的是上一次的。'
              : '这些记录暂时读不出来。'}
          </Text>
        </Card>
      ) : null}

      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        {items.map((item) => (
          <Pressable
            key={item.localDate}
            accessibilityRole="button"
            accessibilityLabel={`${formatDateLabel(item.localDate)}：${item.summary}`}
            onPress={() => openDay(item.localDate)}
            style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
          >
            <Card style={{ marginBottom: theme.spacing.cardGap }}>
              <Text
                style={{
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {formatDateLabel(item.localDate)}
              </Text>
              {/* 只显示第一行：这一页是「找到那一天」，不是「重读那一天」 */}
              <Text
                numberOfLines={1}
                style={{
                  marginTop: 2,
                  fontSize: theme.typography.size.body,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {item.summary}
              </Text>
            </Card>
          </Pressable>
        ))}
      </View>

      {/*
       * 翻页入口。
       *
       * 不自动加载：这一页是「翻回去找一天」，用户明确知道自己在往前找。
       * 自动无限滚动会让「我到底翻了多久」失去感觉，也更容易误触到别的页面。
       */}
      {hasMore ? (
        <View style={{ paddingHorizontal: theme.spacing.pageX }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={loadingMore ? '正在读取更早的' : '看更早的'}
            onPress={loadMore}
            disabled={loadingMore}
            style={({ pressed }) => ({
              minHeight: theme.touchTarget,
              justifyContent: 'center',
              alignSelf: 'flex-start',
              opacity: pressed || loadingMore ? 0.55 : 1,
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
              {loadingMore ? '正在读取…' : '看更早的'}
            </Text>
          </Pressable>
        </View>
      ) : loaded && items.length > 0 ? (
        <Text
          style={{
            marginTop: theme.spacing.md,
            paddingHorizontal: theme.spacing.pageX,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          到最早的一天了。
        </Text>
      ) : null}
    </ScrollView>
  );
}
