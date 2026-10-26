import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { PageTitle } from '../../src/components/PageTitle';
import { formatDateLabel } from '../../src/domain/date';
import {
  getJournalDay,
  getJournalView,
  saveJournalEntry,
  type JournalHistoryItem,
  type JournalView,
} from '../../src/services/journal';
import { takeJournalDay } from '../../src/services/journalHandoff';
import { historyLimitToNumber, type JournalPrefs } from '../../src/domain/journalPrefs';
import { getJournalPrefs } from '../../src/services/journalPrefs';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 日记页（原「回忆」页，D49）。
 *
 * ---- 这一页现在有什么 ----
 *
 * 从上到下：
 *   1. **今天写一句** —— 每天一段自己写的字（本页的核心，也是这一版新增的）；
 *   2. 按天的日记历史（写过的那几天）+ 「看更早的」。
 *
 * ---- D64 把它砍到只剩这些 ----
 *
 * 删掉的是：周复盘入口、月复盘入口、这一季（叙事 + 规则引擎）、关键节点、
 * 周 / 月复盘的历史卡（连同「存成图片」）。
 *
 * 判据与「今天」页那一轮一致：**这一页只回答「我写过什么」**。
 * 复盘是「总结」、叙事是「读的故事」、关键节点是「系统替你总结的里程碑」——
 * 三样都不是「我写的字」。
 *
 * **复盘页本身没删**（`app/review/*` 照旧），入口搬到了「我的」页：
 * 那是它们唯一的进法，删了等于把周 / 月复盘下线。
 *
 * ---- 三项偏好（D65）----
 *
 * 字数上限（500 / 2000 / 5000）、历史显示几条（30 / 60 / 全部）、
 * 是否显示字数计数。三项都在「设置 → 日记」里。
 * **字数上限只影响之后写的内容**：已经存下的长日记不会被截断。
 *
 * ---- 没有记录时说什么 ----
 *
 * 不说「你还没写过」（那是一句欠账），而是说清这一页会变成什么。
 * 日记的空状态更简单：编辑框就在上面，随时可以写第一句。
 */
export default function JournalScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /*
   * D64 删掉了这一页的复盘入口、这一季、关键节点、复盘历史卡，
   * 连带它们的四个 state（reviews / months / milestones / 未写提示）一起删。
   * 复盘页本身没删——入口搬到了「我的」页。
   */
  const [error, setError] = useState(false);

  /** 日记偏好（D65）。聚焦时重读——用户可能刚在设置页改过 */
  const [prefs, setPrefs] = useState<JournalPrefs>(getJournalPrefs);

  /**
   * 日记：今天的内容 + 历史。
   *
   * `today` 是**业务日**（`services/journal.ts` 里用 effectiveToday 算的），
   * 不是 `new Date()` 拼出来的字符串——两者在凌晨 0–4 点会差一天。
   */
  const [today, setToday] = useState('');
  const [todayBody, setTodayBody] = useState('');
  const [todayWritten, setTodayWritten] = useState(false);
  const [journalHistory, setJournalHistory] = useState<JournalHistoryItem[]>([]);
  /** 正在编辑的是哪一天。null = 今天 */
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  /**
   * 输入框里的字有没有被用户改过（还没存）。
   *
   * 为什么需要这个标志：这一页每次**聚焦**都会重读数据库（从复盘页回来、
   * 切 tab 回来都会触发）。如果重读时无条件把库里的正文塞回输入框，
   * 用户写了半句、切去「今天」看一眼再切回来，那半句就没了——
   * 而且**没有任何提示**，因为库里的旧值看起来「本来就是那样」。
   *
   * 用 ref 而不是 state：`refresh` 的依赖数组是空的（它只在聚焦时跑），
   * 走 state 会让它每次都重建、把 useFocusEffect 也一起带着重跑。
   * 这个值只被代码读、不被渲染读，ref 正合适。
   */
  const dirtyRef = useRef(false);
  const [journalNotice, setJournalNotice] = useState<string | null>(null);

  /**
   * 切到某一天（从「写过的日子」目录页点回来时用）。
   *
   * 与 `startEditing` 的差别：这个的正文来自**刚读到的那份视图**，
   * 而 `startEditing` 用的是列表里那一行的 `body`（两者是同一份数据，
   * 但目录页回来时列表可能还没渲染出来，所以走 view 更稳）。
   */
  const openDay = useCallback(
    (date: string, view: { today: string; todayBody: string; history: JournalHistoryItem[] }) => {
      dirtyRef.current = false;
      setJournalNotice(null);
      if (date === view.today) {
        setEditingDate(null);
        setDraft(view.todayBody);
        return;
      }
      const row = view.history.find((item) => item.localDate === date);
      setEditingDate(date);
      setDraft(row?.body ?? '');
    },
    []
  );

  const refresh = useCallback(() => {
    try {
      /*
       * 日记每次聚焦都重读，但**不覆盖正在编辑的草稿**：
       * 用户可能刚写了半句、切到别的 tab 又回来（真的会丢过一次）。
       *
       * 判断标准是 `dirtyRef`，不是「值一样不一样」：用户可能只是加了
       * 一个空格又删掉，值一样但那是他自己改的，不该被库里的旧值顶掉。
       */
      // 历史条数按偏好走（D65）。`null`（全部）在 domain 里已经映射成一个足够大的数
      const prefsNow = getJournalPrefs();
      setPrefs(prefsNow);
      const view = getJournalView(Date.now(), historyLimitToNumber(prefsNow.historyLimit));
      setToday(view.today);
      setTodayWritten(view.todayWritten);
      setJournalHistory(view.history);
      setTodayBody(view.todayBody);

      /*
       * 「写过的日子」目录页点了一天回来。请求是一次性的，取走即清空
       * （见 services/journalHandoff.ts：tab 的路由参数会一直留着，不能用来做这件事）。
       *
       * 它排在草稿保护**之前**，因为这是一次明确的动作，优先级高于「聚焦时别动输入框」。
       * 但「明确」不等于「可以覆盖没存的东西」：手里有脏草稿时不切走，
       * 只说一句让他先存——静默丢掉半句话，正是这个 App 最不该做的事。
       */
      const requested = takeJournalDay();
      if (requested) {
        if (dirtyRef.current) {
          setJournalNotice('先存下正在写的这一句，再去看别的日子。');
        } else {
          openDay(requested, view);
        }
      } else if (!dirtyRef.current) {
        setEditingDate((prev) => {
          if (prev === null) {
            setDraft(view.todayBody);
            return null;
          }
          // 正在改某一天的历史：把那一行的**库里**内容同步过来（前提是没改动）
          const row = view.history.find((item) => item.localDate === prev);
          if (row) setDraft(row.body);
          return prev;
        });
      }

      setError(false);
    } catch (err) {
      console.warn('[Ember] 读取日记失败', err);
      setError(true);
    }
  }, [openDay]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  /**
   * 保存日记。
   *
   * 保存的是 `editingDate ?? today`：今天与「翻回去改某一天」共用一套逻辑。
   * 存完把编辑目标拉回今天，并说一句结果——不弹窗。
   */
  const handleSaveJournal = useCallback(() => {
    const target = editingDate ?? today;
    if (!target) return;

    try {
      // 上限按偏好传进去（D65）：输入框的 maxLength 只是建议，库那边也要守住
      const result = saveJournalEntry(target, draft, Date.now(), prefs.bodyLimit);
      if (!result.ok) {
        setJournalNotice(result.message);
        return;
      }
      setJournalNotice(result.cleared ? '清空了这一天的字。' : '存好了。');
      // 存完了，草稿与库一致，可以重新同步
      dirtyRef.current = false;
      setEditingDate(null);
      refresh();
    } catch (err) {
      console.warn('[Ember] 保存日记失败', err);
      setJournalNotice('刚才没能存下来，稍后再试一次。');
    }
  }, [draft, editingDate, prefs.bodyLimit, refresh, today]);

  /** 点历史里的一天：把它的正文装进编辑框（这是一次主动切换，草稿标记重来） */
  const startEditing = useCallback((item: JournalHistoryItem) => {
    dirtyRef.current = false;
    setEditingDate(item.localDate);
    setDraft(item.body);
    setJournalNotice(null);
  }, []);

  /** 回到「写今天」。同上，换目标时旧草稿是有意丢掉的 */
  const editToday = useCallback(() => {
    dirtyRef.current = false;
    setEditingDate(null);
    setDraft(todayBody);
    setJournalNotice(null);
  }, [todayBody]);

  /** 用户改了字。置脏之后，聚焦重读不会再覆盖它 */
  const handleDraftChange = useCallback((next: string) => {
    dirtyRef.current = true;
    setDraft(next);
  }, []);

  const editingRow = editingDate
    ? journalHistory.find((item) => item.localDate === editingDate) ?? null
    : null;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.pageX,
        paddingTop: insets.top + theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xxl,
      }}
      showsVerticalScrollIndicator={false}
    >
      <PageTitle
        title="日记"
        mark="sun"
        subtitle="不是成绩单，是一份记录。想不起来自己做过什么的时候，可以来这儿看看。"
      />

      {/*
       * 今天写一句。放在最上面：它是这一页里唯一**每天都会用到**的东西。
       *
       * 标题会随状态变：没写过是「今天」+「写一句」，写过是「今天」+「改一句」。
       * 不写「你还没写」——那是一句欠账。
       */}
      <Card style={{ marginTop: theme.spacing.xl }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              fontWeight: theme.typography.weight.semibold,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {editingDate ? formatDateLabel(editingDate) : '今天'}
          </Text>
          {/*
           * 字数计数可以关掉（D65 的 showCounter）。
           *
           * 它不是「还差多少字」，而是一个上限指示；但一直盯着一个
           * 「120 / 2000」确实会让人以为这一栏有指标要完成。所以给一个开关，
           * 默认开着（与 D65 之前一致）。
           */}
          {prefs.showCounter ? (
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
                fontVariant: ['tabular-nums'],
              }}
            >
              {draft.length} / {prefs.bodyLimit}
            </Text>
          ) : null}
        </View>

        <TextInput
          value={draft}
          onChangeText={handleDraftChange}
          placeholder="一句话就够。想多写也行。"
          placeholderTextColor={palette.textMuted}
          maxLength={prefs.bodyLimit}
          multiline
          textAlignVertical="top"
          accessibilityLabel={editingDate ? `${formatDateLabel(editingDate)}的日记` : '今天的日记'}
          style={{
            marginTop: theme.spacing.sm,
            minHeight: theme.typography.lineHeight.body * 5,
            paddingVertical: theme.spacing.xs,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        />

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editingDate ? '存下这一天的改动' : todayWritten ? '改一句' : '存下来'}
            onPress={handleSaveJournal}
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
              {!editingDate && todayWritten ? '改一句' : '存下来'}
            </Text>
          </Pressable>

          {/* 改历史某一天时，给一条回到「今天」的路 */}
          {editingDate ? <EntryLink label="回到今天" onPress={editToday} /> : null}
        </View>

        {/* 保存结果的一句话。不弹窗，就一行字 */}
        {journalNotice ? (
          <Text
            accessibilityRole="alert"
            style={{
              marginTop: theme.spacing.xs,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {journalNotice}
          </Text>
        ) : null}

        {/* 正在改的是历史里的一天：说清「存下去会改哪一天」 */}
        {editingRow ? (
          <Text
            style={{
              marginTop: theme.spacing.xs,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            正在改 {formatDateLabel(editingRow.localDate)} 那天的字。
          </Text>
        ) : null}
      </Card>

      {/* 读不出来时说一句实话，而不是显示成「你什么都没写过」 */}
      {error ? (
        <Card style={{ marginTop: theme.spacing.cardGap }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {journalHistory.length > 0
              ? '刚才没读到新数据，显示的是上一次的。'
              : '这些记录暂时读不出来。'}
          </Text>
        </Card>
      ) : null}

      {/* 按天的日记历史。只在真写过时出现；今天那一条不在这里列（它在上面编辑框里） */}
      {journalHistory.length > 0 ? (
        <View style={{ marginTop: theme.spacing.xxl }}>
          {/*
           * 标题行右侧的「看全部」。
           *
           * 这个列表只有最近 60 天（首页要留位置给「今天」与复盘）。
           * 更早的内容在 `app/journal/history.tsx` 里——那条入口必须看得见，
           * 否则用户会以为日记只存 60 天。**只有写过东西时才出现**：
           * 一条都没有时，带他去一个空目录没有意义。
           *
           * 文案是「看更早的」而不是「查看全部」：这一页本来就在看「写过什么」，
           * 「全部」说了等于没说；「更早的」说清了点进去会得到什么。
           */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: theme.spacing.sm,
            }}
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
              写过的日子
            </Text>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="看更早的日记"
              onPress={() => router.push('/journal/history')}
              style={({ pressed }) => ({
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
                看更早的
              </Text>
            </Pressable>
          </View>

          {journalHistory.map((item) => {
            const selected = item.localDate === editingDate;
            return (
              <Pressable
                key={item.localDate}
                accessibilityRole="button"
                accessibilityLabel={`${formatDateLabel(item.localDate)}：${item.summary}`}
                onPress={() => startEditing(item)}
                style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
              >
                <Card style={{ marginBottom: theme.spacing.cardGap }}>
                  <View
                    style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}
                  >
                    <Text
                      style={{
                        fontSize: theme.typography.size.caption,
                        lineHeight: theme.typography.lineHeight.caption,
                        color: selected ? palette.primary : palette.textMuted,
                        fontFamily: theme.typography.fontFamily.body,
                        fontVariant: ['tabular-nums'],
                      }}
                    >
                      {formatDateLabel(item.localDate)}
                    </Text>
                    <Text
                      style={{
                        fontSize: theme.typography.size.caption,
                        lineHeight: theme.typography.lineHeight.caption,
                        color: palette.primary,
                        fontFamily: theme.typography.fontFamily.body,
                      }}
                    >
                      {selected ? '正在改' : '改一句'}
                    </Text>
                  </View>
                  {/*
                   * 只显示第一行：列表是「找到那一天」，不是「重读那一天」。
                   * 完整内容点进去才看得到。
                   */}
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
            );
          })}
        </View>
      ) : null}

    </ScrollView>
  );
}

/**
 * 一个文字入口。
 *
 * 与「写一份」「看看全部」同一套：纯文字、主色、44 高。
 * 放在一行里可换行：两个入口并排时，窄屏上第二个会落到下一行。
 */
function EntryLink({
  label,
  onPress,
  first = false,
}: {
  label: string;
  onPress: () => void;
  first?: boolean;
}) {
  const { theme, palette } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        marginLeft: first ? 0 : theme.spacing.md,
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
        {label}
      </Text>
    </Pressable>
  );
}
