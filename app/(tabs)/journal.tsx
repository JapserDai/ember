import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { StageNote } from '../../src/components/StageNote';
import { formatDateLabel } from '../../src/domain/date';
import { hasUnwrittenLastWeek, listReviewHistory, type ReviewHistoryItem } from '../../src/services/review';
import {
  JOURNAL_BODY_MAX,
  getJournalView,
  saveJournalEntry,
  type JournalHistoryItem,
} from '../../src/services/journal';
import {
  listMonthReviewHistory,
  offeredMonthReview,
  type MonthHistoryItem,
} from '../../src/services/monthReview';
import { listMilestones, type Milestone } from '../../src/services/narrative';
import { useExportCard } from '../../src/services/exportImage';
import { buildMemoryCard, buildMonthCard } from '../../src/services/exportCards';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 日记页（原「回忆」页，D49）。
 *
 * ---- 这一页现在有什么 ----
 *
 * 从上到下：
 *   1. **今天写一句** —— 每天一段自己写的字（本页的核心，也是这一版新增的）；
 *   2. 周复盘入口、月复盘入口；
 *   3. 按天的日记历史（写过的那几天）；
 *   4. 这一季（叙事 + 规则引擎入口）；
 *   5. 关键节点；
 *   6. 周 / 月复盘的历史卡（每张都能存成图片）。
 *
 * ---- 为什么日记与复盘放在同一页 ----
 *
 * 两者回答的是同一个问题：「我走过的日子留下了什么」。
 * 区别只在粒度——日记是**一天**，复盘是**一周 / 一个月**。
 * 拆成两个 tab 会把底栏挤成五个，也会让「想看自己写过什么」这件事
 * 多一次选择。所以它们同一页，日记在上（每天都可能用到），复盘在下。
 *
 * ---- 为什么复盘仍然是独立页 ----
 *
 * 周复盘有三个固定问题、月复盘有一份统计，各自是一个完整页面。
 * 把它们拆成可嵌入的组件，成本远大于「点一下进去」的代价。
 * 这一页给的是**入口 + 历史**，点进去才是写的地方。
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

  const [history, setHistory] = useState<ReviewHistoryItem[]>([]);
  const [months, setMonths] = useState<MonthHistoryItem[]>([]);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  /** 上一周过完还没写。只用来决定要不要给一个安静的入口，不催 */
  const [unwritten, setUnwritten] = useState(false);
  /** 这个月到了月末那个周末、还没写。同上，不催 */
  const [monthOffer, setMonthOffer] = useState<string | null>(null);
  const [error, setError] = useState(false);

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
  const [journalNotice, setJournalNotice] = useState<string | null>(null);

  /**
   * 导出卡片（回忆卡 / 月报卡）。
   *
   * 一次只能导一张：`host` 是一个离屏节点，同一时刻只装得下一张卡。
   * 所以用 `exporting` 记住正在导哪一张，其余按钮在期间不可点。
   */
  const { exportAndShare, host: exportHost } = useExportCard();
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  const handleExport = useCallback(
    (
      id: string,
      prefix: 'memory' | 'month',
      key: string,
      data: Parameters<typeof exportAndShare>[0]['data']
    ) => {
      if (exporting) return;
      setExporting(id);
      setExportNotice(null);
      void (async () => {
        try {
          const result = await exportAndShare({ data, prefix, key });
          setExportNotice(result.message);
        } catch (err) {
          console.warn('[Ember] 导出日记卡失败', err);
          setExportNotice('这张卡没能生成，稍后再试一次。');
        } finally {
          setExporting(null);
        }
      })();
    },
    [exportAndShare, exporting]
  );

  const refresh = useCallback(() => {
    try {
      setHistory(listReviewHistory());
      setMonths(listMonthReviewHistory());
      setMilestones(listMilestones());
      setUnwritten(hasUnwrittenLastWeek());
      setMonthOffer(offeredMonthReview());

      /*
       * 日记每次聚焦都重读，但**不覆盖正在编辑的草稿**：
       * 用户可能刚写了半句、切到别的 tab 又回来。
       * 只有「没在改历史某一天」时才把今天的正文同步到输入框。
       */
      const view = getJournalView();
      setToday(view.today);
      setTodayWritten(view.todayWritten);
      setJournalHistory(view.history);
      setTodayBody(view.todayBody);
      setEditingDate((prev) => {
        if (prev === null) {
          setDraft(view.todayBody);
          return null;
        }
        // 正在改某一天的历史：保留原样，只把那一行的最新内容同步过来
        const row = view.history.find((item) => item.localDate === prev);
        if (row) setDraft(row.body);
        return prev;
      });

      setError(false);
    } catch (err) {
      console.warn('[Ember] 读取日记失败', err);
      setError(true);
    }
  }, []);

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
      const result = saveJournalEntry(target, draft);
      if (!result.ok) {
        setJournalNotice(result.message);
        return;
      }
      setJournalNotice(result.cleared ? '清空了这一天的字。' : '存好了。');
      setEditingDate(null);
      refresh();
    } catch (err) {
      console.warn('[Ember] 保存日记失败', err);
      setJournalNotice('刚才没能存下来，稍后再试一次。');
    }
  }, [draft, editingDate, refresh, today]);

  /** 点历史里的一天：把它的正文装进编辑框 */
  const startEditing = useCallback((item: JournalHistoryItem) => {
    setEditingDate(item.localDate);
    setDraft(item.body);
    setJournalNotice(null);
  }, []);

  /** 回到「写今天」 */
  const editToday = useCallback(() => {
    setEditingDate(null);
    setDraft(todayBody);
    setJournalNotice(null);
  }, [todayBody]);

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
      <Text
        style={{
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
          marginTop: theme.spacing.md,
          fontSize: theme.typography.size.body,
          lineHeight: theme.typography.lineHeight.body,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        不是成绩单，是一份记录。想不起来自己做过什么的时候，可以来这儿看看。
      </Text>

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
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
              fontVariant: ['tabular-nums'],
            }}
          >
            {draft.length} / {JOURNAL_BODY_MAX}
          </Text>
        </View>

        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="一句话就够。想多写也行。"
          placeholderTextColor={palette.textMuted}
          maxLength={JOURNAL_BODY_MAX}
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
              {editingDate ? '存下来' : todayWritten ? '改一句' : '存下来'}
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

      {/* 周复盘入口。上一周还没写时给一个安静的入口，不弹窗、不加红点 */}
      <Card style={{ marginTop: theme.spacing.cardGap }}>
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            fontWeight: theme.typography.weight.semibold,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          周复盘
        </Text>
        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {unwritten
            ? '上一周过完了。想记两句的话，这里有一张空白的。'
            : '三个问题，五分钟。想写的时候再写，不写也不会记成欠账。'}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unwritten ? '写上一周的复盘' : '写周复盘'}
          onPress={() => router.push('/review')}
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
            {unwritten ? '写上一周的' : '写一份'}
          </Text>
        </Pressable>
      </Card>

      {/* 月复盘入口。只在月末那个周末之后、且本月还没写过时出现 */}
      {monthOffer ? (
        <Card style={{ marginTop: theme.spacing.cardGap }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              fontWeight: theme.typography.weight.semibold,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            月复盘
          </Text>
          <Text
            style={{
              marginTop: theme.spacing.xs,
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            这个月快过完了。这里有一份数字和一句可以写的话。
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="写月复盘"
            onPress={() => router.push('/review/month')}
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
              看一眼这个月
            </Text>
          </Pressable>
        </Card>
      ) : null}

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
            {history.length > 0 || journalHistory.length > 0
              ? '刚才没读到新数据，显示的是上一次的。'
              : '这些记录暂时读不出来。'}
          </Text>
        </Card>
      ) : null}

      {/* 按天的日记历史。只在真写过时出现；今天那一条不在这里列（它在上面编辑框里） */}
      {journalHistory.length > 0 ? (
        <View style={{ marginTop: theme.spacing.xxl }}>
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
            写过的日子
          </Text>

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

      {/* 叙事与规则引擎入口。这两个都是「读」的东西，放在复盘入口下面 */}
      <Card style={{ marginTop: theme.spacing.cardGap }}>
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.caption,
            fontWeight: theme.typography.weight.semibold,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          这一季
        </Text>
        <Text
          style={{
            marginTop: theme.spacing.xs,
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          一段故事、一个在等的东西、这个月的主题。按累计记录天数慢慢出来。
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          <EntryLink label="去看这一季" onPress={() => router.push('/narrative')} first />
          <EntryLink label="看看最近" onPress={() => router.push('/rule-engine')} />
        </View>
      </Card>

      {/* 关键节点（阶段 5 第 4 条）。只在真的发生过时出现 */}
      {milestones.length > 0 ? (
        <View style={{ marginTop: theme.spacing.xxl }}>
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
            几个节点
          </Text>

          {milestones.map((item) => (
            <Card key={item.id} style={{ marginBottom: theme.spacing.cardGap }}>
              <Text
                style={{
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {item.date}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: theme.typography.size.body,
                  lineHeight: theme.typography.lineHeight.body,
                  fontWeight: theme.typography.weight.medium,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {item.title}
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
                {item.note}
              </Text>
            </Card>
          ))}
        </View>
      ) : null}

      {/* 月复盘历史：一月一张卡 */}
      {months.length > 0 ? (
        <View style={{ marginTop: theme.spacing.xxl }}>
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
            写过的月
          </Text>

          {months.map((item) => (
            <Card key={item.monthKey} style={{ marginBottom: theme.spacing.cardGap }}>
              <Text
                style={{
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {item.label}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontSize: theme.typography.size.body,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.text,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                {item.note}
              </Text>

              {/* 把这一段拍成一张图。只拍这一月，不是全部 */}
              <EntryLink
                label={exporting === `month-${item.monthKey}` ? '正在生成…' : '存成图片'}
                onPress={() =>
                  handleExport(`month-${item.monthKey}`, 'month', item.monthKey, buildMemoryCard({
                    kind: 'month',
                    item,
                  }))
                }
                first
              />
            </Card>
          ))}
        </View>
      ) : null}

      {/* 复盘历史：一周一张卡 */}
      {history.length > 0 ? (
        <View style={{ marginTop: theme.spacing.xxl }}>
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
            写过的周
          </Text>

          {history.map((item) => (
            <Card key={item.weekKey} style={{ marginBottom: theme.spacing.cardGap }}>
              <Text
                style={{
                  fontSize: theme.typography.size.caption,
                  lineHeight: theme.typography.lineHeight.caption,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {item.rangeLabel}
              </Text>

              {item.entries.map((entry, index) => (
                <View key={`${item.weekKey}-${index}`} style={{ marginTop: theme.spacing.sm }}>
                  <Text
                    style={{
                      fontSize: theme.typography.size.caption,
                      lineHeight: theme.typography.lineHeight.caption,
                      color: palette.textMuted,
                      fontFamily: theme.typography.fontFamily.body,
                    }}
                  >
                    {entry.prompt}
                  </Text>
                  <Text
                    style={{
                      marginTop: 2,
                      fontSize: theme.typography.size.body,
                      lineHeight: theme.typography.lineHeight.body,
                      color: palette.text,
                      fontFamily: theme.typography.fontFamily.body,
                    }}
                  >
                    {entry.answer}
                  </Text>
                </View>
              ))}

              {/* 把这一周拍成一张图 */}
              <EntryLink
                label={exporting === `week-${item.weekKey}` ? '正在生成…' : '存成图片'}
                onPress={() =>
                  handleExport(`week-${item.weekKey}`, 'memory', item.weekKey, buildMemoryCard({
                    kind: 'week',
                    item,
                  }))
                }
                first
              />
            </Card>
          ))}
        </View>
      ) : (
        /* 一条复盘都没有时：不指责，只说这一页会变成什么 */
        <View style={{ marginTop: theme.spacing.xxl }}>
          <StageNote title="还没有写过的周">
            写过第一份周复盘之后，它会出现在这里。所有内容都只存在这台手机上。
          </StageNote>
        </View>
      )}

      <View style={{ marginTop: theme.spacing.xxl }}>
        <StageNote title="关于这些卡">
          每一张都能存成图片发给别人：只拍到那一次写下的字，不带任何数字。
        </StageNote>
      </View>

      {/* 导出结果的一句话 */}
      {exportNotice ? (
        <Text
          accessibilityRole="alert"
          style={{
            marginTop: theme.spacing.md,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          {exportNotice}
        </Text>
      ) : null}

      {/* 离屏导出卡片的挂载点。必须在本页，且不占版面 */}
      {exportHost}
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
