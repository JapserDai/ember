import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { CalendarCard } from '../../src/components/CalendarCard';
import { HearthBar } from '../../src/components/HearthBar';
import { SwipeToDelete } from '../../src/components/SwipeToDelete';
import { TaskRow } from '../../src/components/TaskRow';
import { AddButton } from '../../src/components/AddButton';
import { TodoCard } from '../../src/components/TodoCard';
import {
  businessDate,
  formatDateLabel,
  greetingForHour,
  hourOf,
} from '../../src/domain/date';
import { scoreTask, undoCheckinByTaskDate } from '../../src/services/checkin';
import { subscribeMaintenanceNotices } from '../../src/services/maintenance';
import {
  deleteTask,
  getSafeDayStartHour,
  getTaskStreak,
  getTodayData,
  type TodayData,
  type TodayTaskView,
  type TodayTodoView,
} from '../../src/services/today';
import { getSettings } from '../../src/db/repo/settings';
import { getHomePrefs } from '../../src/services/homePrefs';
import type { HomePrefs } from '../../src/domain/homePrefs';
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
  /** 每次重读数据 +1。传给日历，让它跟着重读（见 CalendarCard 的 refreshToken） */
  const [dataNonce, setDataNonce] = useState(0);
  /**
   * 首页偏好（D62）。挂载时读一次，回到这一页时再读一次——
   * 用户可能刚在设置页关掉了月历，切回来必须立刻生效。
   */
  const [prefs, setPrefs] = useState<HomePrefs>(getHomePrefs);
  /** 一行中性提示（算分被拒绝、记录没写进去等） */
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * 提示队列。
   *
   * 为什么不是「一个 state 直接覆盖」：日常维护一次可能带回三句话
   * （「中间空了一阵子」+「自动用了一张宽限券」+「收到了 2 个材料」）。
   * 直接覆盖的话，用户只能看到最后一句，而前两句恰恰是更需要读的。
   * 所以排成队列逐条说完，每一条都占满自己的 NOTICE_MS。
   */
  const noticeQueue = useRef<string[]>([]);
  /**
   * 这一页读设置失败时（库没打开）的周起始日回退值。
   *
   * 月历要按周起始排表头（周一 / 周日开头）。读不到设置时就用周一——
   * 与 `settings.week_starts_on` 的默认值一致，而不是在这一页写一个「1」。
   */
  const [weekStartsOn] = useState<number>(() => {
    try {
      return getSettings().week_starts_on;
    } catch {
      return 1;
    }
  });
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

  /** 显示一行提示，2.5 秒后自己消失；排队时前一条说完再说下一条 */
  const pumpNotice = useCallback(function pump() {
    // 正在显示某一条：等它的定时器把位置腾出来
    if (noticeTimer.current) return;
    const next = noticeQueue.current.shift();
    if (next === undefined) return;
    setNotice(next);
    noticeTimer.current = setTimeout(() => {
      noticeTimer.current = null;
      setNotice(null);
      // 队列里还有就接着说。不递归到爆栈：每一条至少要等 2.5 秒
      pump();
    }, NOTICE_MS);
  }, []);

  const showNotice = useCallback(
    (text: string) => {
      // 去重：连着来两次同一句（比如连点两下同一件已完成的事）不重复排队
      if (noticeQueue.current[noticeQueue.current.length - 1] === text) return;
      noticeQueue.current.push(text);
      pumpNotice();
    },
    [pumpNotice]
  );

  /*
   * 订阅「回来之后发生了什么」（结算 / 宽限券 / 月度奖励）。
   *
   * 冷启动时这三件事跑在首帧之前，那时这一页还没挂载，
   * 所以句子先攒在 services/maintenance.ts 的队列里；
   * 这里一挂上就会把攒下的几句立刻交过来。
   */
  useEffect(() => subscribeMaintenanceNotices(showNotice), [showNotice]);

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
      setDataNonce((n) => n + 1);
    } catch (err) {
      console.warn('[Ember] 读取今日数据失败', err);
      setHardError(true);
      // 有上一份好数据就保留：宁可显示几分钟前的数字，也不要把整页清空
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
      // 设置页可能刚改过首页偏好，回到这一页要重读
      setPrefs(getHomePrefs());
    }, [refresh])
  );

  /*
   * 从后台切回前台时重读一次。
   *
   * 跨过日界的那一刻（比如凌晨 4 点后第一次点亮屏幕）业务日已经变了，
   * 而 useFocusEffect 只在路由变化时触发——App 一直在这一页上就没路由变化。
   * 不重读的话，用户会看到昨天的那份清单，包括已经不能撤销的记录。
   *
   * 维护（结算 / 宽限券 / 月度奖励）由根布局的 AppState 监听跑，
   * 它说的话会自动回到这里的提示队列，所以这里只负责重读数据。
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  // 首帧的空状态也要有个标题可画，所以先用日界推一个日期出来
  const view = data ?? lastGood;
  const today = view?.today ?? businessDate(Date.now(), dayStartHour);
  const dateLabel = formatDateLabel(today);
  const greeting = greetingForHour(hourOf(Date.now()));

  const habits = view?.habits ?? [];
  const todos = view?.todos ?? [];

  const doneCount = useMemo(
    () => habits.filter((h) => h.done).length,
    [habits]
  );
  /*
   * 进度只数**习惯**（D55）。
   *
   * 待办从这一版起没有完成态，也就不属于「今天做了几件」这个分子／分母。
   * 早先两者一起数，是因为待办能勾选；现在把它数进来只会让火带
   * 卡在 3/5 永远不动——而那个 5 里有一半是没法「做完」的。
   */
  const totalCount = habits.length;
  const allDone = totalCount > 0 && doneCount >= totalCount;

  // 全部完成时把问候换成一句收尾：不庆祝、不催促，只是告诉你今天到这儿了
  const headline = allDone ? '今天到这儿了。' : `${greeting}。`;

  /**
   * 记录一次。**只有习惯走这条路**——待办从 D55 起没有完成态、也不发 XP。
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
   *
   * 这个函数现在是**两个入口共用的**：待办卡的左滑删除（D55 立、D65 改方向）与习惯行的
   * 那个「删」（习惯行仍然只有一个显式按钮，因为「滑动」对它是新学的动作，
   * 而习惯的主要动作是打卡，不是删）。
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
       * 顶部：大标题 + 日期（D61 起回到这里）。
       *
       * D56 曾把这两行挪进一条彩色横带里，D61 把带子删了，
       * 于是它们回到页面自己的顶部——这一版没有第二个「天」了。
       *
       * 顺序是标题在上、日期在下（Microsoft To Do 的排法：先「我的一天」，
       * 再那行小字日期）。日期不带字距：拉开字距的小字标签是「模板感」
       * 最重的一处记号，层级靠字号与颜色，不靠字距。
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
      {/*
       * 火带可以关掉（D62 的 home_prefs.showHearth）。默认显示。
       *
       * 关掉之后这一页就没有「今天做到哪儿」的读数了，但习惯列表本身的
       * 完成态仍然在（圈是实心的）——所以关掉不等于看不见进度，只是没有那条带子。
       */}
      {prefs.showHearth ? (
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
      ) : null}

      {/* 月历（D57）。refreshToken 每读一次库就 +1：记完一笔日历跟着重读。可关（D62） */}
      {prefs.showCalendar ? (
        <CalendarCard today={today} weekStartsOn={weekStartsOn} refreshToken={dataNonce} />
      ) : null}

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
           * 页头右侧现在只剩一句操作提示，编辑态没有了。
           *
           * 为什么删掉「编辑」：它是一页的第二个模式——点进去之后整页看起来
           * 都变了，而用户往往只是想删掉其中一件。删除改成左滑（D55 立、D65 改方向），
           * 落在它自己那一行上。
           *
           * 但滑动是隐藏手势，新用户不会自己发现（这正是 TaskRow 早先
           * 拒绝用滑动删除的理由）。所以：第一次进这一页时，第一张待办卡会
           * 自己轻推一下（SwipeToDelete 的 peek），这里是常备的一行小字——
           * 它不占事件、不可点，只在有东西可删的时候出现。
           */}
          {prefs.showSwipeHint && (todos.length > 0 || habits.length > 0) ? (
            <Text
              style={{
                fontSize: theme.typography.size.caption,
                lineHeight: theme.typography.lineHeight.caption,
                color: palette.textMuted,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              左滑可以删
            </Text>
          ) : null}
        </View>

        {/*
         * 空状态的条件是「习惯与待办都没有」。
         *
         * 只看习惯的话，「今天只有一个待办」会被渲染成「今天空着」——
         * 而下面紧接着就把那条待办列出来了，自相矛盾。
         */}
        {habits.length === 0 && todos.length === 0 ? (
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
              今天空着。点右下角的「+」放一件进来。
            </Text>
          </View>
        ) : habits.length === 0 ? (
          // 有内容、但全是待办：习惯区块本身不画
          null
        ) : (
          <View style={{ paddingHorizontal: theme.spacing.pageX }}>
            {habits.map((habit) => (
              <SwipeToDelete
                key={habit.id}
                title={habit.title}
                marginBottom={theme.spacing.cardGap}
                onDelete={() => handleDelete(habit.id, habit.title)}
              >
                <TaskRow
                  title={habit.title}
                  streakDays={habit.streakDays}
                  done={habit.done}
                  disabled={habit.done}
                  onPress={() => handleRecord(habit.id)}
                  onLongPress={habit.canUndo ? () => handleUndo(habit.id) : undefined}
                  floatText={float?.taskId === habit.id ? float.text : undefined}
                  floatNonce={float?.taskId === habit.id ? float.nonce : 0}
                />
              </SwipeToDelete>
            ))}
          </View>
        )}
      </View>

      {/*
       * 待办：最多 3 条，每条一张白卡片，左滑露出「删」（D55 立、D65 改方向）。
       *
       * 这一块与习惯的区别现在只剩两条：多一行元信息（截止日 · 备注 · 目标）、
       * 以及**不可勾选**——待办是便签，不是更小的习惯。
       *
       * 删除必须走 SwipeToDelete 而不是在卡片里放一个按钮：卡片上常驻一个
       * 红色的「删」，整页会读成一张待清理的表。滑动是「手指推开门」，
       * 主动作（看清单）时不占视觉。
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
          {todos.map((todo) => (
            <SwipeToDelete
              key={todo.id}
              title={todo.title}
              /* peek 只给第一张：一次就够，第二张再推一遍就是噪音 */
              peek={todo.id === todos[0].id}
              marginBottom={theme.spacing.cardGap}
              onDelete={() => handleDelete(todo.id, todo.title)}
            >
              <TodoCard
                title={todo.title}
                dueLabel={todo.dueLabel}
                overdue={todo.overdue}
                notes={todo.notes}
                goalTitle={todo.goalTitle}
              />
            </SwipeToDelete>
          ))}
        </View>
      ) : null}

    </ScrollView>

    {/*
     * 右下角的「+」。
     *
     * 这一页只有一个「添加」入口，而且它一直在（没有编辑态了，D55）。
     *
     * **不需要给底栏留偏移**：expo-router 的底栏在正常流里
     * （BottomTabBar 不是绝对定位），所以这一页的内容区本来就结束在底栏之上。
     * 早先这里加了 `insets.bottom + 62`，那会把按钮往上顶 80 多像素，
     * 悬在列表中间。组件自己的 `spacing.lg` 就是它该有的下边距。
     */}
    <AddButton onPress={goNewTask} />
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
