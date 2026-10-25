import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { HearthBar } from '../../src/components/HearthBar';
import { QuickStart } from '../../src/components/QuickStart';
import { TaskRow } from '../../src/components/TaskRow';
import { AddButton } from '../../src/components/AddButton';
import { TodoCard } from '../../src/components/TodoCard';
import { createTask } from '../../src/db/repo/tasks';
import { getPlayerId } from '../../src/db/repo/player';
import {
  businessDate,
  formatDateLabel,
  greetingForHour,
  hourOf,
} from '../../src/domain/date';
import { QUICK_HABIT_TEMPLATES, type TaskTemplate } from '../../src/domain/task-templates';
import { discoveryOfDay, shouldShowDiscovery } from '../../src/domain/discovery';
import { scoreTask, undoCheckinByTaskDate } from '../../src/services/checkin';
import {
  deleteTask,
  getSafeDayStartHour,
  getTaskStreak,
  getTodayData,
  type TodayData,
  type TodayTaskView,
  type TodayTodoView,
} from '../../src/services/today';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 首页「今天」。
 *
 * 结构是账本，不是卡片墙：
 *   日期 + 问候 → 炭排 → 今天（通栏行）→ 待办 → 今天还可以
 *
 * 通栏的行、极淡的分隔线、没有阴影也没有圆角容器。
 * 全屏只有一个东西带颜色，就是那排点着的炭；其余全部安静。
 *
 * 数据全部来自 SQLite（src/services/today.ts 装配），**没有示例数据**。
 * 每次回到这一页重读一次：打完卡切去别的 tab 再回来，数字必须是新的。
 *
 * 点击后**不做乐观更新**，理由有三条：
 *   1. 算分可能拒绝（今天已经记过、日期在未来、补记窗口过了），
 *      乐观更新会先画一个假状态，然后被真实结果打脸；
 *   2. 撤销需要真实的打卡 id，假状态里没有；
 *   3. 写库是同步的，重读在同一帧完成，用户感知不到延迟——
 *      而「回滚」这件事对零基础读者是一整块额外的复杂度。
 */

/** 提示条显示多久（毫秒） */
const NOTICE_MS = 2500;
/** 奖励提示显示多久。比提示条长一点：这是正反馈，该让人看清 */
const AWARD_MS = 3000;

/**
 * 飘字存在多久。
 *
 * 与 AwardFloat 里的动画时长一致（700ms）。这里多留 80ms 再清状态：
 * 动画结束时 opacity 已经是 0，早一点清会打断最后一帧；
 * 晚一点只是多发一次渲染，看不见。
 */
const FLOAT_MS = 780;

/**
 * 把一次记录的奖励拼成一行字。
 *
 * 措辞原则（与「不评判」一致）：
 *   - 只报**已经发生的事**（+26 XP），不说「做得不错」「继续保持」——
 *     那是评价，而且是在替用户判断这件事值不值；
 *   - 不写「获得」这种像发奖品的词，写「+」就够了，它是账本的记法；
 *   - 升级单独说一句，因为它是这一格里唯一一件「不只是数字变大」的事。
 */
function awardText(award: Award): string {
  if (award.levels > 0) return `升级了 · +${award.xp} XP`;
  if (award.ember > 0) return `+${award.xp} XP · +${award.ember} 余烬`;
  return `+${award.xp} XP`;
}

/**
 * 连击里程碑：3 / 7 / 30 / 100 天。
 *
 * ---- 为什么是这四个数，不是每 10 天 ----
 *
 * 习惯养成的研究里，第 3 天是「开始成为习惯」，第 7 天是「过完了一周」，
 * 第 30 天是「一个月」，第 100 天是「不用再想了」。这四个点是四个不同的台阶，
 * 而每 10 天报一次会变成一条噪音线——每天都可能触发，于是没有一天值得注意。
 *
 * ---- 为什么替代奖励提示、而不是加在它旁边 ----
 *
 * 刚记完的那一格只放得下一句话。同一格里先说「+26 XP」再说「连着 7 天了」，
 * 用户只会看到前 3 秒的第一句。所以里程碑**优先**：它比 XP 更值得读，
 * 而 XP 下一次记的时候还会出现。
 *
 * 措辞只报事实（「连着 7 天了」），不说「太厉害了」「坚持得真好」——
 * 那是评价，而 App 不评价（docs/02 §2.4）。
 */
const STREAK_MILESTONES: readonly number[] = [3, 7, 30, 100];

/** 一次记录之后要显示的东西 */
interface Award {
  xp: number;
  ember: number;
  levels: number;
  /** 刚好踏上的里程碑天数。null 表示这一次不是里程碑 */
  milestone: number | null;
}

/** 奖励那一格的最终文案：里程碑优先于数字 */
function awardLine(award: Award): string {
  if (award.milestone !== null) return `连着 ${award.milestone} 天了`;
  return awardText(award);
}

export default function TodayScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // 日界只在挂载时读一次。读失败退回默认，首帧照常渲染
  const [dayStartHour] = useState<number>(getSafeDayStartHour);

  /** 当前这一份数据。null 表示还没读出来 */
  const [data, setData] = useState<TodayData | null>(null);
  /** 最近一次读成功的数据。读失败时留着它，别把已有内容抽走 */
  const [lastGood, setLastGood] = useState<TodayData | null>(null);
  /** 读库失败且没有任何可显示的数据 */
  const [hardError, setHardError] = useState(false);
  /** 一行中性提示（算分被拒绝、记录没写进去等） */
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * 编辑态：每一行右侧出现「删」。
   *
   * 为什么要有编辑态，而不是一直显示删除按钮：这一页的主要动作是「记一笔」，
   * 每行都挂一个红色的「删」，会让整页看起来像一张待清理的表。
   * 进入编辑态需要一次明确的点击，删除也就不会误触。
   *
   * 离开这一页时自动退出编辑态（见 useFocusEffect 的清理函数）：
   * 下次回来时页面应该是干净的，不该还停在「准备删除」的状态里。
   */
  const [editing, setEditing] = useState(false);
  /**
   * 刚刚记下这一件得到的奖励。null 表示不显示。
   *
   * 为什么需要它：点一下之后，原来界面上唯一的变化是圆点变色、数字 +1。
   * 那两件事都太安静了——用户做了事，但除了「数字好像变了」之外什么都没发生，
   * 于是下一次就没有理由再点。这不是审美问题，是反馈缺失。
   *
   * 为什么不弹窗、不撒花：弹窗会打断（用户可能想连着记三件），
   * 撒花是庆祝（庆祝意味着「这件事值得被表扬」，而 App 不评判）。
   * 这里只做一件事：把刚刚**真的发生了什么**（+26 XP、+3 余烬）
   * 在数字位上说一句，然后自己退回去。
   */
  const [award, setAward] = useState<Award | null>(null);

  /**
   * 飘字：哪一行在飘、飘什么、第几次。
   *
   * 与 `award`（下面那一格的长文案）分开：飘字是「贴在手边的一下」，
   * 存在 700ms；award 是「这一格换成刚发生了什么」，存在 3 秒。
   * 两者同时出现，但一个是位置上的反馈、一个是数字上的反馈，不该共用一个状态。
   */
  const [float, setFloat] = useState<{ taskId: string; text: string; nonce: number } | null>(null);
  const floatTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 每次记录 +1，用来让同一个任务连记两次时飘字也能重播 */
  const floatNonce = useRef(0);

  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** 奖励提示 3 秒后自动退回等级 */
  useEffect(() => {
    if (!award) return;
    if (awardTimer.current) clearTimeout(awardTimer.current);
    awardTimer.current = setTimeout(() => {
      setAward(null);
      awardTimer.current = null;
    }, AWARD_MS);
    return () => {
      if (awardTimer.current) clearTimeout(awardTimer.current);
    };
  }, [award]);

  /** 显示一行提示，2.5 秒后自己消失 */
  const showNotice = useCallback((text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => {
      setNotice(null);
      noticeTimer.current = null;
    }, NOTICE_MS);
  }, []);

  // 卸载时清掉定时器，避免在已卸载的组件上 setState
  useEffect(() => {
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      if (floatTimer.current) clearTimeout(floatTimer.current);
    };
  }, []);

  /** 重新读一遍今日数据 */
  const refresh = useCallback(() => {
    try {
      const next = getTodayData(Date.now());
      setData(next);
      setLastGood(next);
      setHardError(false);
    } catch (err) {
      console.warn('[Ember] 读取今日数据失败', err);
      setHardError(true);
      // 有上一份好数据就保留：宁可显示几分钟前的数字，也不要把整页清空
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      // 离开这一页时退出编辑态：回来时页面该是干净的，
      // 不该还停在「每一行都挂着删」的状态里
      return () => setEditing(false);
    }, [refresh])
  );

  // 首帧的空状态也要有个标题可画，所以先用日界推一个日期出来
  const view = data ?? lastGood;
  const today = view?.today ?? businessDate(Date.now(), dayStartHour);
  const dateLabel = formatDateLabel(today);
  const greeting = greetingForHour(hourOf(Date.now()));

  const habits = view?.habits ?? [];
  const todos = view?.todos ?? [];

  /*
   * 今日发现（阶段 4 第 7 条）。
   *
   * 在渲染期算：纯函数、代价可忽略（一次哈希）。
   * 玩家 id 读不到时（库没打开）就不画那一块。
   */
  const discovery = useMemo(() => {
    try {
      return discoveryOfDay(getPlayerId(), today);
    } catch (err) {
      console.warn('[Ember] 取今日发现失败', err);
      return null;
    }
  }, [today]);

  const doneCount = useMemo(
    () => habits.filter((h) => h.done).length + todos.filter((t) => t.done).length,
    [habits, todos]
  );
  const totalCount = habits.length + todos.length;
  const allDone = totalCount > 0 && doneCount >= totalCount;

  // 全部完成时把问候换成一句收尾：不庆祝、不催促，只是告诉你今天到这儿了
  const headline = allDone ? '今天到这儿了。' : `${greeting}。`;

  /**
   * 记录一次（习惯和待办共用）。
   *
   * 待办完成也要走算分——它一样发 XP（docs/04 §5.1 第 10 步），
   * 只是写完顺带把任务置成完成。
   */
  const handleRecord = useCallback(
    (taskId: string) => {
      try {
        const result = scoreTask({ taskId });
        if (!result.ok) {
          showNotice(result.message);
        } else {
          /*
           * 里程碑要在**写库之后**算：刚写进去的那一条打卡正是让它跨过门槛的那一条。
           * 算失败就不报里程碑（只是一句提示，不该因此让整次记录看起来出错）。
           */
          let milestone: number | null = null;
          try {
            const days = getTaskStreak(taskId);
            milestone = STREAK_MILESTONES.includes(days) ? days : null;
          } catch (err) {
            console.warn('[Ember] 计算连胜里程碑失败', err);
          }

          // 把手边那一行飘一下：反馈落在手指按下的位置
          floatNonce.current += 1;
          setFloat({
            taskId,
            text: `+${result.awarded.xp}`,
            nonce: floatNonce.current,
          });
          if (floatTimer.current) clearTimeout(floatTimer.current);
          floatTimer.current = setTimeout(() => {
            setFloat(null);
            floatTimer.current = null;
          }, FLOAT_MS);

          // 把真实发放量亮一下。数值来自算分结果，不是界面自己编的
          setAward({
            xp: result.awarded.xp,
            ember: result.awarded.ember,
            levels: result.levelUp.levelsGained,
            milestone,
          });
        }
        refresh();
      } catch (err) {
        // 事务已经回滚，库里本来就是干净的，界面重读一遍就回到原样
        console.warn('[Ember] 记录失败', err);
        showNotice('刚才没记上，再试一次。');
        refresh();
      }
    },
    [refresh, showNotice]
  );

  /** 长按已记录的行：撤销这一次，奖励一并退回 */
  const handleUndo = useCallback(
    (taskId: string) => {
      Alert.alert('撤销这一次？', '这一次的奖励会一起退回。', [
        { text: '算了', style: 'cancel' },
        {
          text: '撤销',
          onPress: () => {
            try {
              const result = undoCheckinByTaskDate(taskId, today);
              if (!result.ok) showNotice(result.message);
            } catch (err) {
              console.warn('[Ember] 撤销失败', err);
              showNotice('刚才没能撤销，再试一次。');
            }
            refresh();
          },
        },
      ]);
    },
    [refresh, showNotice, today]
  );

  /**
   * 删掉一件事。
   *
   * 先问一句：删除是这一页唯一不可撤销的动作（撤销打卡有入口，恢复任务没有）。
   * 文案不说「确定要删除吗」——那是在替用户犹豫；只说删了之后会发生什么：
   * 它不再出现在今天，但过去为它花的时间仍然算数。
   */
  const handleDelete = useCallback(
    (taskId: string, title: string) => {
      Alert.alert(`删掉「${title}」？`, '它不会再出现在今天。过去的记录仍然算数。', [
        { text: '留着', style: 'cancel' },
        {
          text: '删掉',
          style: 'destructive',
          onPress: () => {
            try {
              deleteTask(taskId);
            } catch (err) {
              console.warn('[Ember] 删除任务失败', err);
              showNotice('刚才没能删掉，再试一次。');
            }
            refresh();
          },
        },
      ]);
    },
    [refresh, showNotice]
  );

  /** 空状态里点一个快捷模板：直接建好，不用再填表 */
  const handlePickTemplate = useCallback(
    (template: TaskTemplate) => {
      try {
        createTask({
          title: template.title,
          type: template.type,
          attribute: template.attribute,
          startDate: today,
        });
        refresh();
      } catch (err) {
        console.warn('[Ember] 用模板新建任务失败', err);
        showNotice('没能加进来，换个方式写写看。');
        router.push('/tasks/new');
      }
    },
    [refresh, router, showNotice, today]
  );

  const goNewTask = useCallback(() => router.push('/tasks/new'), [router]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.background }}>
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.lg,
        // 底部多留 56：右下角那个圆钮是浮在内容之上的（绝对定位），
        // 不留这一块，「今天还可以」那两行会被它盖住。
        // 56 = 按钮直径，额外再加 lg 当呼吸
        paddingBottom: insets.bottom + theme.spacing.xxl + 56 + theme.spacing.lg,
      }}
      showsVerticalScrollIndicator={false}
    >
      {/*
       * 顶部：大标题 + 日期。
       *
       * 顺序是**标题在上、日期在下**（Microsoft To Do 的排法：先「我的一天」，
       * 再那行小字日期）。早先是反过来的——日期在上，像一个标签。
       *
       * 也去掉了日期上的字距（letterSpacing: 1.5）。拉开字距的小字标签
       * 是「模板感」最明显的一处记号，而 To Do 的日期是普通的小字，
       * 只是颜色淡一点。层级靠字号与颜色，不靠字距。
       */}
      <View style={{ paddingHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.title,
            lineHeight: theme.typography.lineHeight.title,
            fontWeight: theme.typography.weight.semibold,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.title,
          }}
        >
          {headline}
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
          {dateLabel}
        </Text>
      </View>

      {/*
       * 今日进度：一条正在烧起来的火带。
       *
       * 这是全屏唯一「有颜色」的地方，没有它首页会塌成一张平铺的清单。
       * 它既是品牌（余烬），也是功能（今天烧到哪儿了）。
       *
       * 换掉原来那排炭的理由见 HearthBar 的注释：七个小横条只能表达比例，
       * 而比例是数字的图形化，不是动力。火带表达的是「有东西正在发生」。
       *
       * ---- 它也有自己的框，火照常画在框里 ----
       *
       * 要求是「每一条数据都要框起来」，今日进度是一条数据，所以给了它一张卡。
       *
       * 试过把火带顶到卡片左右边缘（负外边距 + overflow: hidden）来「破格」，
       * 放弃了：炉膛那一端的火是一团会往外散的光，一旦被卡片的圆角裁掉，
       * 它就从「一簇火」变成「半个圆」。为了 12px 的白边去毁掉全 App 唯一的
       * 品牌记号，不划算。火带就规规矩矩地待在卡片内边距里。
       */}
      <Card
        style={{
          marginTop: theme.spacing.xl,
          marginHorizontal: theme.spacing.pageX,
        }}
      >
        <HearthBar done={doneCount} total={totalCount} height={10} />
        <View style={styles.progressCaption}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {totalCount > 0 ? `今天 ${doneCount} / ${totalCount} 件` : '今天还没有安排'}
          </Text>

          {/*
           * 右侧这一格平时是等级，刚记完一件时换成「刚刚得到了什么」。
           *
           * 为什么借用这一格而不是另起一行：另起一行会让下面的内容整体下移，
           * 而「刚点了的那一行」正好在视线里——内容一动，眼睛就跟丢了。
           * 在同一格里换字，位置不动，视线不用重新找。
           *
           * 3 秒后自己退回等级。不设关闭按钮：它不是一个需要回应的东西。
           */}
          {award ? (
            <Text
              accessibilityRole="alert"
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.primary,
                fontFamily: theme.typography.fontFamily.body,
                fontWeight: theme.typography.weight.medium,
                fontVariant: ['tabular-nums'],
              }}
            >
              {awardLine(award)}
            </Text>
          ) : (
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
                fontVariant: ['tabular-nums'],
              }}
            >
              Lv.{view?.level ?? 1}
            </Text>
          )}
        </View>

        {/*
         * 读库出问题时的两句话。
         * 有旧数据：只加一行小字，页面上原来的数字继续用；
         * 没有旧数据：给一句实话 + 一个重试入口，而不是假装「今天空着」。
         */}
        {hardError ? (
          <View style={{ marginTop: theme.spacing.sm }}>
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              {view ? '刚才没读到新数据，显示的是上一次的。' : '今天的数据暂时读不出来。'}
            </Text>
            {!view ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="再试一次"
                onPress={refresh}
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
                    color: palette.primary,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  再试一次
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}

        {/*
         * 提示不是数据点，不单独框——它已经在进度这张卡里了。
         * 卡里再套一张卡会让它看起来像一个「项目」。
         */}
        {notice ? (
          <Text
            accessibilityRole="alert"
            style={{
              marginTop: theme.spacing.sm,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {notice}
          </Text>
        ) : null}
      </Card>

      {/* 今天：标题 + 每条习惯一张白卡片 */}
      <View style={{ marginTop: theme.spacing.xl }}>
        <View style={[styles.sectionHeader, { paddingHorizontal: theme.spacing.pageX }]}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              fontWeight: theme.typography.weight.semibold,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            今天
          </Text>

          {/*
           * 「加一件」的显示条件是**今天有没有任何东西**，不是只有没有习惯。
           *
           * 早先写的是 habits.length > 0，于是只建了待办、一件习惯都没有的人
           * 会同时撞上两件事：拿不到「加一件」，又被下面的空状态当成「今天空着」
           * ——而他的待办就列在下面。等于告诉用户他没建过东西，同时不给他改的机会。
           *
           * 空状态和这个按钮用同一个条件，两者永远互斥：
           * totalCount === 0 才叫空，那时候三个模板自己就是入口。
           */}
          {totalCount > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {/*
               * 编辑态开关。只在有内容时出现——一件都没有时，
               * 「删」没有对象，这个开关只会让人点一下发现自己什么也做不了。
               */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={editing ? '完成编辑' : '编辑'}
                onPress={() => setEditing((prev) => !prev)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={({ pressed }) => ({
                  minHeight: theme.touchTarget,
                  justifyContent: 'center',
                  opacity: pressed ? 0.55 : 1,
                })}
              >
                <Text
                  style={{
                    fontSize: theme.typography.size.caption,
                    lineHeight: theme.typography.lineHeight.caption,
                    // 编辑态用正文色，提醒「现在点行尾的删是真的会删」
                    color: editing ? palette.text : palette.textMuted,
                    fontFamily: theme.typography.fontFamily.body,
                  }}
                >
                  {editing ? '完成' : '编辑'}
                </Text>
              </Pressable>

              {/*
               * 「加一件」原来在这里，现在移到了右下角的圆钮（AddButton）。
               * 一个页面只留一个「添加」入口：这个入口在页头、那个在页尾，
               * 用户会以为它们做的事不一样。
               */}
            </View>
          ) : null}
        </View>

        {/*
         * 空状态的条件同样是 totalCount === 0。
         * 只看习惯的话，「今天有一个待办」会被渲染成「今天空着」——
         * 而下面紧接着就把那条待办列出来了，自相矛盾。
         */}
        {totalCount === 0 ? (
          <View style={{ paddingHorizontal: theme.spacing.pageX }}>
            <Text
              style={{
                paddingTop: theme.spacing.lg,
                fontSize: theme.typography.size.body,
                lineHeight: theme.typography.lineHeight.body,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              今天空着。要不要放一件小事进来？
            </Text>
            <QuickStart
              templates={QUICK_HABIT_TEMPLATES}
              onPick={handlePickTemplate}
              onCreateOwn={goNewTask}
            />
          </View>
        ) : habits.length === 0 ? (
          // 有内容、但全是待办：习惯区块本身不画，只留一个「加一件」在上面
          null
        ) : (
          <View style={{ paddingHorizontal: theme.spacing.pageX }}>
            {habits.map((habit, index) => (
              <TaskRow
                key={habit.id}
                title={habit.title}
                streakDays={habit.streakDays}
                done={habit.done}
                disabled={habit.done}
                onPress={() => handleRecord(habit.id)}
                onLongPress={habit.canUndo ? () => handleUndo(habit.id) : undefined}
                onDelete={editing ? () => handleDelete(habit.id, habit.title) : undefined}
                floatText={float?.taskId === habit.id ? float.text : undefined}
                floatNonce={float?.taskId === habit.id ? float.nonce : 0}
              />
            ))}
          </View>
        )}
      </View>

      {/*
       * 待办：最多 3 条，每条一张白卡片。
       *
       * 习惯与待办用的是同一种框（`components/Card`）——要求是
       * 「每一个任务都要框起来」，两类任务在这一点上没有区别。
       * 它们仍然靠**圈里画什么**区分：习惯是圆形勾选圈，待办也是，
       * 但待办多一行元信息（截止日 · 备注 · 归属目标），完成时加删除线。
       *
       * 卡片之间留 8px 的缝，缝里露出页面底色。这是 Fluent 分组的方式：
       * 不靠描边把卡片框起来，靠「白纸压在灰底上」自己分开。
       */}
      {todos.length > 0 ? (
        <View
          style={{
            marginTop: theme.spacing.xl,
            paddingHorizontal: theme.spacing.pageX,
          }}
        >
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
            待办
          </Text>
          {todos.map((todo, index) => (
            <TodoCard
              key={todo.id}
              title={todo.title}
              dueLabel={todo.dueLabel}
              overdue={todo.overdue}
              notes={todo.notes}
              goalTitle={todo.goalTitle}
              done={todo.done}
              onToggle={() => handleRecord(todo.id)}
              onLongPress={todo.canUndo ? () => handleUndo(todo.id) : undefined}
              onDelete={editing ? () => handleDelete(todo.id, todo.title) : undefined}
              last={index === todos.length - 1}
              floatText={float?.taskId === todo.id ? float.text : undefined}
              floatNonce={float?.taskId === todo.id ? float.nonce : 0}
            />
          ))}
        </View>
      ) : null}

      {/*
       * 今天还可以：一条 1 分钟微行动。
       *
       * 它也是数据（每天换一句、由玩家 id 和日期定种），所以同样一张卡。
       * 只是这一张不给「可点」的样子：它没有 onLongPress、没有圈，
       * 卡片在这里只是「一条读数」，不是「一个任务」。
       */}
      {view?.microAction ? (
        <Card style={{ marginTop: theme.spacing.xxl, marginHorizontal: theme.spacing.pageX }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              fontWeight: theme.typography.weight.semibold,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            今天还可以
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
            {view.microAction}
          </Text>
        </Card>
      ) : null}

      {/*
       * 今日发现（阶段 4 第 7 条）。
       *
       * 只在**今天至少记过一件**之后出现。
       *
       * 为什么不在打开 App 时就给：那会让它变成「每天的问候语」，
       * 而这一条的价值在于「你做完了一件事，顺手看一眼」。顺序反了，
       * 它就从「发现的奖励」变成了「开场白」。
       *
       * 它不给 XP / 余烬 / 材料——纯文字，所以也不存在「刷」的动机。
       * 种子是「玩家 id + 业务日」，同一天永远同一条（改系统时间也刷不出新的，
       * 因为 effectiveToday 挡住时钟回拨）。
       */}
      {discovery && view && shouldShowDiscovery(doneCount > 0) ? (
        <Card style={{ marginTop: theme.spacing.cardGap, marginHorizontal: theme.spacing.pageX }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              fontWeight: theme.typography.weight.semibold,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            今天发现
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
            {discovery.text}
          </Text>
        </Card>
      ) : null}
    </ScrollView>

    {/*
     * 右下角的「+」。
     *
     * 只在非编辑态出现：编辑态这一屏是「清理」，不是「添加」——
     * 两个相反的动作出现在同一屏，手指会犹豫。
     *
     * **不需要给底栏留偏移**：expo-router 的底栏在正常流里
     * （BottomTabBar 不是绝对定位），所以这一页的内容区本来就结束在底栏之上。
     * 早先这里加了 `insets.bottom + 62`，那会把按钮往上顶 80 多像素，
     * 悬在列表中间。组件自己的 `spacing.lg` 就是它该有的下边距。
     */}
    {editing ? null : <AddButton onPress={goNewTask} />}
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressCaption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
});
