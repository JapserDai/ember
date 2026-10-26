import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../src/components/Card';
import { PageTitle } from '../src/components/PageTitle';
import { effectiveToday } from '../src/domain/date';
import {
  livePomodoroState,
  POMODORO_PHASES,
  phaseProgress,
  type PomodoroPhaseKey,
  type PomodoroSnapshot,
} from '../src/domain/pomodoro';
import {
  DEFAULT_POMODORO_PREFS,
  type PomodoroPrefs,
} from '../src/domain/pomodoroPrefs';
import { getSettings } from '../src/db/repo/settings';
import { getPomodoroPrefs, savePomodoroPrefs } from '../src/services/pomodoroPrefs';
import { getPomodoroToday, saveCompletedPomodoro } from '../src/services/pomodoro';
import { useTheme } from '../src/theme/ThemeProvider';

/**
 * 番茄钟（D68）。
 *
 * ---- 这一页是什么 ----
 *
 * 一个计时器：三档（专注 25 / 休息 5 / 起搏 1），开始、暂停、完成。
 * 完成 = 留一行事实（哪天、哪档、多久），今天 N 个在页头给一个数。
 * 没有别的：不打分、不发 XP、不绑任务、不做统计图表。
 *
 * ---- 为什么是 interval + 墙钟，而不是纯 interval ----
 *
 * 计时进度每秒从「真实时钟 - 起点 - 暂停」重新算（phaseProgress），
 * 而不是 interval 里 -1000ms 地倒数。interval 会漂移、会被
 * 后台的节流拖慢；墙钟不会。interval 只负责「每秒看一眼」。
 *
 * ---- 后台 / 杀进程 ----
 *
 * 切后台期间 JS 被挂起，回来时墙钟照算——所以「切走 10 分钟再回来」
 * 会发现已经走完了。这是墙钟的语义：时间真的过去了。
 * 杀进程更彻底：进行中的番茄只在内存里，重启后从零开始
 * （services/pomodoro.ts 的注释写了为什么这是有意的）。
 */

/** 把毫秒折成 mm:ss（页头那个大数字） */
function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function PomodoroScreen() {
  const { theme, palette, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [prefs, setPrefs] = useState<PomodoroPrefs>(() => {
    try {
      return getPomodoroPrefs();
    } catch {
      return DEFAULT_POMODORO_PREFS;
    }
  });
  const [phase, setPhase] = useState<PomodoroPhaseKey>(() => {
    try {
      return getPomodoroPrefs().defaultPhase;
    } catch {
      return DEFAULT_POMODORO_PREFS.defaultPhase;
    }
  });
  /** 进行中的番茄快照。null = 空闲 */
  const [snapshot, setSnapshot] = useState<PomodoroSnapshot | null>(null);
  /** 驱动界面重绘的「现在」。interval 每 500ms 摸一次墙钟 */
  const [now, setNow] = useState(() => Date.now());
  const [today, setToday] = useState({ count: 0, minutes: 0, atCap: false });
  const [notice, setNotice] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refreshToday = useCallback(() => {
    try {
      const settings = getSettings();
      const { today: todayKey } = effectiveToday(Date.now(), settings.day_start_hour, settings.last_settled_date);
      setToday(getPomodoroToday(todayKey));
    } catch {
      // 读不到就不更新：页头保留上一次的数字，不白屏
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshToday();
      return () => {
        // 离开页面时停掉 interval（番茄本身不清——回来墙钟会接着算）
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }, [refreshToday])
  );

  const live = livePomodoroState(snapshot, now);

  const stopTicker = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTicker = useCallback(() => {
    stopTicker();
    intervalRef.current = setInterval(() => setNow(Date.now()), 500);
  }, [stopTicker]);

  /** 完成处理：落库 + 今日计数 + （可选）自动接下一档 */
  const handleComplete = useCallback(
    (finished: PomodoroSnapshot) => {
      stopTicker();
      const completedAt = Date.now();
      // 实际时长 = 终点 - 起点 - 已暂停 - （暂停中的尾巴）
      const pausedTail = finished.pausedAt !== null ? Math.max(0, completedAt - finished.pausedAt) : 0;
      const elapsedMs = Math.max(1, completedAt - finished.startAt - finished.pausedMs - pausedTail);

      try {
        const settings = getSettings();
        const { today: todayKey } = effectiveToday(completedAt, settings.day_start_hour, settings.last_settled_date);
        const result = saveCompletedPomodoro(
          { phase: finished.phase, localDate: todayKey, startAt: finished.startAt, completedAt, elapsedMs },
          finished.pausedMs + pausedTail
        );
        if (result.ok) {
          setNotice(
            finished.phase === 'focus'
              ? `记下了。今天第 ${result.count} 个。`
              : '这一段记下了。'
          );
        } else {
          setNotice(result.message);
        }
      } catch {
        setNotice('刚才没记下来，再试一次。');
      }
      refreshToday();
      setSnapshot(null);

      // 自动接下一档（偏好开着才做）：专注完接休息，其余接专注
      if (prefs.autoStartNext) {
        const next: PomodoroPhaseKey = finished.phase === 'focus' ? 'break' : 'focus';
        setPhase(next);
        setSnapshot({
          id: `local-${completedAt}`,
          phase: next,
          localDate: '',
          startAt: completedAt,
          pausedMs: 0,
          pausedAt: null,
        });
        setNow(completedAt);
        startTicker();
      }
    },
    [prefs.autoStartNext, refreshToday, startTicker, stopTicker]
  );

  /** 每次重绘后检查到点没有（用 effect 而不是 interval 回调里做，保证状态一致） */
  React.useEffect(() => {
    if (!snapshot || !live) return;
    if (live.ended) {
      handleComplete(snapshot);
    }
  }, [live?.ended, snapshot, handleComplete]);

  const handleToggle = useCallback(() => {
    setNotice(null);
    if (!snapshot) {
      // 从零开始这一档
      const startAt = Date.now();
      setSnapshot({
        id: `local-${startAt}`,
        phase,
        localDate: '',
        startAt,
        pausedMs: 0,
        pausedAt: null,
      });
      setNow(startAt);
      startTicker();
      return;
    }
    if (snapshot.pausedAt !== null) {
      // 恢复：把刚才暂停的那段累进 pausedMs
      const resumedAt = Date.now();
      const next = {
        ...snapshot,
        pausedMs: snapshot.pausedMs + Math.max(0, resumedAt - snapshot.pausedAt),
        pausedAt: null,
      };
      setSnapshot(next);
      setNow(resumedAt);
      startTicker();
    } else {
      // 暂停：记住暂停起点，停表
      stopTicker();
      setSnapshot({ ...snapshot, pausedAt: Date.now() });
      setNow(Date.now());
    }
  }, [snapshot, phase, startTicker, stopTicker]);

  const handleGiveUp = useCallback(() => {
    // 放弃：什么都不写。没走完的番茄不是事实，库不留它
    stopTicker();
    setSnapshot(null);
    setNotice(null);
  }, [stopTicker]);

  const handlePhaseChange = useCallback(
    (next: PomodoroPhaseKey) => {
      if (snapshot) return; // 跑着的时候不让换档
      setPhase(next);
      // 顺手记住为默认档——下次打开还是它。写失败不打扰（下一次还能再选）
      try {
        const merged = { ...prefs, defaultPhase: next };
        if (merged.defaultPhase !== prefs.defaultPhase) {
          savePomodoroPrefs(merged);
          setPrefs(merged);
        }
      } catch {
        // 偏好写失败不影响本次使用
      }
    },
    [snapshot, prefs]
  );

  const totalMs = POMODORO_PHASES.find((p) => p.key === phase)?.durationMs ?? 25 * 60 * 1000;
  const progress = live ? live.progress : 0;
  const remaining = live ? formatRemaining(live.remainingMs) : formatRemaining(totalMs);
  const running = live?.running ?? false;
  const paused = snapshot?.pausedAt != null;

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
          accessibilityLabel="返回"
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/me');
          }}
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
            ‹ 返回
          </Text>
        </Pressable>

        <PageTitle
          title="番茄钟"
          subtitle="一段一段时间，记完就算"
          mark="sun"
        />
      </View>

      <View style={{ marginTop: theme.spacing.md, paddingHorizontal: theme.spacing.pageX }}>
        {/*
         * 档位选择。跑着的时候禁换：换档等于把正在走的 25 分钟扔掉，
         * 与其偷偷作废，不如让人先按「放弃」——那一行事实还在他手里。
         */}
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          {POMODORO_PHASES.map((p) => {
            const selected = snapshot ? snapshot.phase === p.key : phase === p.key;
            return (
              <Pressable
                key={p.key}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={p.label}
                disabled={!!snapshot}
                onPress={() => handlePhaseChange(p.key)}
                style={({ pressed }) => ({
                  flex: 1,
                  opacity: snapshot ? 0.5 : pressed ? 0.55 : 1,
                })}
              >
                <Card>
                  <Text
                    style={{
                      fontSize: theme.typography.size.caption,
                      lineHeight: theme.typography.lineHeight.caption,
                      color: selected ? palette.primary : palette.textMuted,
                      fontFamily: theme.typography.fontFamily.body,
                      fontWeight: selected ? theme.typography.weight.medium : theme.typography.weight.regular,
                      textAlign: 'center',
                    }}
                  >
                    {p.label.replace(' ', '\n')}
                  </Text>
                </Card>
              </Pressable>
            );
          })}
        </View>

        {/*
         * 计时主体。进度条用「自然色」而不是 primary——它不表达「可以点」，
         * 只表达「过去了多少」（D59 立下的 token 语义，这里照办）。
         */}
        <Card style={{ marginTop: theme.spacing.md }}>
          <View style={{ alignItems: 'center', paddingVertical: theme.spacing.lg }}>
            <Text
              accessibilityRole="timer"
              accessibilityLabel={running ? '正在计时' : paused ? '已暂停' : '未开始'}
              style={{
                fontSize: 56,
                lineHeight: 64,
                color: palette.text,
                fontFamily: theme.typography.fontFamily.title,
                fontWeight: theme.typography.weight.semibold,
                fontVariant: ['tabular-nums'],
              }}
            >
              {remaining}
            </Text>
            <Text
              style={{
                marginTop: theme.spacing.xs,
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {snapshot ? (running ? '进行中' : '已暂停') : POMODORO_PHASES.find((p) => p.key === phase)?.label}
            </Text>

            <View
              style={{
                marginTop: theme.spacing.md,
                alignSelf: 'stretch',
                height: 6,
                borderRadius: 3,
                backgroundColor: palette.natureTint.leaf,
              }}
            >
              <View
                style={{
                  width: `${Math.round(progress * 100)}%`,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: palette.nature.leaf,
                }}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={snapshot ? (running ? '暂停' : '继续') : '开始'}
              onPress={handleToggle}
              style={({ pressed }) => ({
                marginTop: theme.spacing.lg,
                minHeight: theme.touchTarget,
                paddingHorizontal: theme.spacing.xl,
                borderRadius: theme.radius.pill,
                backgroundColor: palette.primary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: theme.typography.size.body,
                  lineHeight: theme.typography.lineHeight.body,
                  color: palette.onPrimary,
                  fontFamily: theme.typography.fontFamily.body,
                  fontWeight: theme.typography.weight.medium,
                }}
              >
                {snapshot ? (running ? '暂停' : '继续') : '开始'}
              </Text>
            </Pressable>

            {snapshot ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="放弃这一段"
                onPress={handleGiveUp}
                style={({ pressed }) => ({
                  marginTop: theme.spacing.sm,
                  minHeight: theme.touchTarget,
                  justifyContent: 'center',
                  opacity: pressed ? 0.55 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: theme.typography.size.caption,
                    lineHeight: theme.typography.lineHeight.caption,
                    color: palette.textMuted,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  放弃这一段（不记）
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Card>

        {/* 今日计数。只有完成的才进来——进行中的不算，这是这一页诚实的方式 */}
        <Card style={{ marginTop: theme.spacing.cardGap }}>
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
                今天 {today.count} 个{today.minutes > 0 ? ` · ${today.minutes} 分钟` : ''}
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
                {today.atCap
                  ? '到今天的上限了。计时器还能用，只是不再往下记。'
                  : '只有走完的才记。没走完的不算数。'}
              </Text>
            </View>
          </View>
        </Card>

        {notice ? (
          <Text
            accessibilityRole="alert"
            style={{
              marginTop: theme.spacing.md,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
              textAlign: 'center',
            }}
          >
            {notice}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}
