/**
 * 本地提醒：把「每个任务自己的提醒时刻」排成系统的定时通知。
 *
 * ---- 这一层负责什么 ----
 *
 * domain/reminder.ts 已经算好了「哪件事、哪一天、几点、说什么」；
 * 这里负责三件只有碰得到原生模块的事：
 *   1. 建通知渠道、要权限；
 *   2. 把候选排成通知（Android 预排未来 7 天）；
 *   3. 重排之前先把旧的取消掉，且**只取消自己排的**。
 *
 * ---- 为什么不用系统的「每天重复」触发器 ----
 *
 * expo-notifications 有 DAILY 触发器：设一次 hour/minute，系统每天自己弹。
 * 看起来省事，但它有三个问题：
 *   1. **任务不是每天都有。** 待办只做一次、习惯可以暂停、删掉之后不该再提醒。
 *      系统重复触发器不知道自己该停——任务删了，提醒还在弹，而用户找不到关掉它的地方。
 *   2. **改时间要重排。** 既然改时间得重排，那「预排 7 天」和「每天重复」的成本一样，
 *      而预排能顺手处理掉「明天这一条不该发」。
 *   3. **文案轮换。** 每天换一句就得每天一条不同的通知，重复触发器只能同一句。
 *
 * 所以：**一次性 DATE 触发器，每次排 7 天，启动时补排。**
 * 这与 docs/05 阶段 2 第 1 条写的一致（Android 预排未来 7 天 + 启动补排）。
 *
 * ---- 时区变了怎么办 ----
 *
 * 排期用的是「本地墙上时钟」，系统按绝对时刻触发。用户换时区之后，
 * 那些已经排好的通知会在错误的本地时间响（比如在上海排的 20:00，到了东京变成 21:00）。
 * 所以每次启动都比对一次 `settings.last_time_zone`，变了就整体重排。
 * 时区名来自 Intl —— Hermes 上有它（RN 0.88 自带完整的 Intl），
 * 取不到时退回空串，那种情况下不重排（宁可时间偏一小时，也不要每次启动都重排 20 条）。
 *
 * ---- 失败一律不抛错 ----
 *
 * 通知不是关键路径。没有权限、机型不支持、系统限流——任何一种都只该
 * 让设置页显示「提醒没能排上」，不该让 App 打不开。所以这里的公开函数
 * 全部返回结果对象。
 *
 * **expo-notifications 必须懒加载**（2026-10-26）：Expo Go 的原生模块白名单
 * 里漏注册了 ExpoTopicSubscriptionModule（expo 官方 issue #52175，仍 open），
 * 而它的 JS 在包 index.js 的模块求值阶段就 require 它——任何一条
 * `import ... from 'expo-notifications'` 都会让启动直接炸掉（表现是白屏 +
 * 连锁的 ErrorBoundary 报错）。所以顶层不 import，改成 `requireNotifications()`
 * 在每个公开函数内部取模块；模块缺失时返回 null，调用方各自降级。
 * 真机 apk / development build（原生模块完整）不受影响。
 */

import Constants, { ExecutionEnvironment } from 'expo-constants';
import { isRunningInExpoGo } from 'expo';

import { Platform } from 'react-native';

import { listActiveCheckinDates } from '../db/repo/checkins';
import { listActiveTasks, updateTask, type Task } from '../db/repo/tasks';
import { getSettings, updateSettings } from '../db/repo/settings';
import { listReviewWeeks } from '../db/repo/reviews';
import {
  businessDate,
  addDays,
  diffDays,
  effectiveToday,
  isDateKey,
  startOfWeek,
} from '../domain/date';
import { pickBySeed } from '../domain/prng';
import { isScheduledOn } from '../domain/recurrence';
import { weekKeyOf } from '../domain/review';
import {
  REMINDER_LINES,
  capOccurrences,
  reminderIdentifier,
  reminderInstantMs,
  reminderSeed,
  type ReminderOccurrence,
} from '../domain/reminder';

type NotificationsModule = typeof import('expo-notifications');

let notificationsCache: NotificationsModule | null | undefined;

/**
 * 取 expo-notifications 模块。Expo Go 里原生模块没注册时返回 null——
 * 这不是错误，是「这台环境发不了通知」。
 */
function requireNotifications(): NotificationsModule | null {
  if (notificationsCache !== undefined) return notificationsCache;

  /*
   * Expo Go 里直接放弃，**连 require 都不做**（2026-10-26）。
   *
   * 只靠 try/catch 不够：原生模块缺失时，expo-notifications 的 JS 在模块
   * 求值阶段 require 它失败，这个错误即使被 catch，RN 的开发工具也会把它
   * 当作启动错误报到 LogBox 上（红色 ERROR），观感是「App 坏了」。
   * Expo Go 的 Android 版从 SDK 53 起本来就不支持远程推送，本地提醒
   * （本项目的唯一用途）也因 #52175 起不来——索性在 Expo Go 里整体停用，
   * 一个字节的通知模块都不加载。真机 apk / development build 不受影响。
   *
   * 检测用两道信号（2026-10-26 第二次加固）：
   *   - `isRunningInExpoGo()`：expo 包自带的官方判断（探测原生 ExpoGo 模块，
   *     try/catch 包着，不碰通知模块）——**主信号**；
   *   - `Constants.executionEnvironment === 'storeClient'`：老写法，
   *     在部分 Go 版本上 native 常量注入不全时会落空（2026-10-26 实测），留作备艧。
   */
  if (isRunningInExpoGo() || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    notificationsCache = null;
    return null;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- 只能 require：静态 import 会在模块求值期炸掉 Expo Go（见文件头注释）
    notificationsCache = require('expo-notifications') as NotificationsModule;
  } catch (err) {
    // 只传字符串，不传 Error 对象：LogBox 会把 warn(err) 升级成红色 ERROR 显示，
    // 让人以为启动失败了——实际只是提醒功能在这台环境里停用（2026-10-26）
    console.warn(
      '[Ember] 通知模块在这台设备上不可用（Expo Go 的已知限制），提醒功能停用：',
      err instanceof Error ? err.message : String(err)
    );
    notificationsCache = null;
  }
  return notificationsCache;
}

/**
 * 预排的天数（含今天）。
 *
 * 7 天是 docs/05 定的：再长没有意义（用户一周内总会打开一次 App，
 * 打开就会重排），再短会让「一周没打开」的人从第 8 天开始收不到提醒。
 */
export const REMINDER_HORIZON_DAYS = 7;

/**
 * 系统里最多同时挂多少条。
 *
 * Android 对每个 App 的定时闹钟数量有限制（不同厂商从 50 到 500 不等），
 * 而 20 条足够覆盖「7 天 × 3 件事」。设了更多提醒的任务会被截掉最后几天，
 * 见 domain/reminder.ts 的 capOccurrences。
 */
export const REMINDER_MAX_SCHEDULED = 20;

/** 通知渠道 id。渠道一旦建了，属性就只能由用户改，所以名字要一开始就写对 */
const CHANNEL_ID = 'reminders';

/**
 * 周复盘提醒的标识符前缀。
 *
 * 与 `reminder:`（任务提醒）分开，因为两者的生命周期不同：
 *   - 任务提醒：每次重排全部取消重建（任务改了、删了、换时区了）；
 *   - 周复盘提醒：一周一条，不该被任务的增删影响。
 *
 * 如果共用前缀，`cancelReminders()` 会把周复盘那条一起删掉，
 * 于是用户改一个任务的时间，周复盘提醒就没了。
 */
export const REVIEW_REMINDER_PREFIX = 'review:';

/**
 * 周复盘提醒的时刻：周日 20:00。
 *
 * 为什么是周日晚上：周日是「这一周刚结束、下一周还没开始」的那个缝，
 * 而 20 点是晚饭后、睡前之前——那是一周里少数几个真的能坐下来想五分钟的时刻。
 * 太早（周日下午）人还在外面，太晚（周一早上）已经进入下一周了。
 *
 * 存成「从零点起的分钟数」与任务的提醒同一套表示法，复用 reminderInstantMs。
 */
export const REVIEW_REMINDER_MINUTE = 20 * 60;

/** 周复盘提醒的正文。只有一句，不轮换：一周一次的东西，轮换只会让它显得随便 */
export const REVIEW_REMINDER_BODY = '这一周过完了。想记两句的话，这里有一张空白的。';

/** 排期结果。失败时 message 是给用户看的一句话 */
export interface ReminderSyncResult {
  ok: boolean;
  /** 排上了几条 */
  scheduled: number;
  /** 有提醒设置、但因为超出上限没排上的条数 */
  skipped: number;
  message: string;
}

/** 权限的三种状态。unknown = 还没问过 */
export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

/**
 * 通知在前台时的行为。
 *
 * 默认 expo-notifications 在前台**不显示**通知（系统认为你已经在用这个 App 了）。
 * 这里保留这个默认：用户正盯着首页时弹一条「有空的时候，记一下」是多余的。
 * 但仍然注册一个 handler，而不是不注册——不注册时 SDK 会打一条警告，
 * 而且将来想加「前台也显示」时只改这一处。
 *
 * `shouldPlaySound: false`：提醒不响铃，只出现在通知栏。
 * 这个 App 没有任何声音（D14 只保留一个动效，声音从来没进过范围），
 * 而一个会响的习惯 App 在第三天就会被静音。
 */
export function installNotificationHandler(): void {
  const Notifications = requireNotifications();
  if (!Notifications) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/**
 * 建通知渠道。
 *
 * Android 8 起通知必须归到渠道里，渠道的**重要性**决定它长什么样：
 *   - HIGH：横幅弹出来 + 可能响铃；
 *   - DEFAULT：出现在通知栏，不弹横幅；
 *   - LOW：只出现在通知栏，不发声、不亮屏。
 *
 * 选 DEFAULT：提醒应该被看见，但不该打断手上的事。
 * 这个 App 的立场是「不催」，而 HIGH 的横幅就是催促的形态。
 *
 * 渠道只在第一次创建时生效，之后同名渠道的配置会被忽略——
 * 所以这段代码重复跑没有副作用，但也意味着**改这里的值对已装用户无效**。
 * 真要改，得换一个新的渠道 id。
 */
export async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const Notifications = requireNotifications();
  if (!Notifications) return;
  try {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: '提醒',
      importance: Notifications.AndroidImportance.DEFAULT,
      // 关掉角标：这个 App 没有「未读」的概念，一个数字角标会变成一种催促
      showBadge: false,
      vibrationPattern: null,
      sound: null,
    });
  } catch (err) {
    console.warn('[Ember] 建通知渠道失败', err);
  }
}

/**
 * 读当前权限，不弹窗。
 *
 * 与 requestPermission 分开：设置页打开时要显示「现在是开还是关」，
 * 那时候不该弹系统对话框——用户只是来看一眼的。
 */
export async function getPermission(): Promise<ReminderPermission> {
  const Notifications = requireNotifications();
  if (!Notifications) return 'undetermined';
  try {
    const status = await Notifications.getPermissionsAsync();
    if (status.granted) return 'granted';
    if (status.canAskAgain) return 'undetermined';
    return 'denied';
  } catch (err) {
    console.warn('[Ember] 读通知权限失败', err);
    return 'undetermined';
  }
}

/**
 * 请求权限。只在用户明确要打开提醒时调用。
 *
 * 为什么不在启动时问：一打开 App 就弹系统权限框，用户还不知道这个 App 要提醒什么，
 * 大概率点「不允许」——而 Android 上拒绝两次之后就不再弹了，等于永久关掉。
 * 所以这个函数只在「设置 → 提醒」里、用户把开关拨到开的那一刻被调用。
 */
export async function requestPermission(): Promise<ReminderPermission> {
  const Notifications = requireNotifications();
  if (!Notifications) return 'denied';
  try {
    const status = await Notifications.requestPermissionsAsync();
    if (status.granted) return 'granted';
    return status.canAskAgain ? 'undetermined' : 'denied';
  } catch (err) {
    console.warn('[Ember] 请求通知权限失败', err);
    return 'denied';
  }
}

/**
 * 取消所有由提醒功能排的通知。
 *
 * **不用 `cancelAllScheduledNotificationsAsync()`**：它会把系统里属于这个 App 的
 * 全部定时通知一起取消，包括将来可能加的周复盘提醒。这里按前缀筛，
 * 只动自己排的那些。
 *
 * 读不到已排列表时（权限被拒的机型上有可能）退回「全部取消」：
 * 那是唯一能保证不重复轰炸的办法，而当前 App 里还没有别的定时通知。
 */
export async function cancelReminders(): Promise<void> {
  const Notifications = requireNotifications();
  if (!Notifications) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const mine = scheduled.filter((request) => request.identifier.startsWith('reminder:'));
    await Promise.all(
      mine.map((request) =>
        Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined)
      )
    );
  } catch (err) {
    console.warn('[Ember] 取消已排提醒失败，退回全部取消', err);
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (inner) {
      console.warn('[Ember] 全部取消也失败了', inner);
    }
  }
}

/**
 * 算出未来 7 天该排哪些提醒（纯数据，不碰通知 API）。
 *
 * 单独拆出来是为了能测：一个「哪些任务哪几天有提醒」的问题，
 * 不该需要一台手机才能回答。
 *
 * 过滤规则（与首页「今天」的排期判断同一套）：
 *   - 只看活跃任务，已删除 / 暂停 / 归档 / 已完成的待办都不排；
 *   - 没有 reminder_minute 的不排；
 *   - 用 isScheduledOn 判断那天该不该做——「每周一三五」的习惯只在那些天提醒；
 *   - **已经过去的时间点不排**（今天 08:00 的提醒，在 20:00 打开 App 时不该补发）；
 *   - 今天已经记过的任务，今天那条不排（已经做完了，再提醒是打扰）。
 */
export function buildOccurrences(
  tasks: readonly Task[],
  today: string,
  dayStartHour: number,
  weekStartsOn: number,
  nowMs: number,
  doneToday: ReadonlySet<string>
): ReminderOccurrence[] {
  const out: ReminderOccurrence[] = [];

  for (let offset = 0; offset < REMINDER_HORIZON_DAYS; offset++) {
    const dateKey = addDays(today, offset);

    for (const task of tasks) {
      const minute = task.reminderMinute;
      if (minute === null) continue;
      if (task.status !== 'active') continue;

      // 今天已经做过：今天那条不再排。明天照排（习惯是每天的事）
      if (offset === 0 && doneToday.has(task.id)) continue;

      if (!isScheduledOn(task, dateKey, weekStartsOn, 0)) continue;

      const atMs = reminderInstantMs(dateKey, minute, dayStartHour);
      // 已经过去的时间点不排：补发一条「早上好」在晚上八点毫无意义
      if (atMs <= nowMs) continue;

      const body =
        pickBySeed(REMINDER_LINES, reminderSeed(task.id, dateKey), 'reminder') ??
        REMINDER_LINES[0];

      out.push({ taskId: task.id, title: task.title, dateKey, atMs, body });
    }
  }

  return out;
}

/**
 * 重排全部提醒。这是唯一一个会写系统通知队列的函数。
 *
 * 顺序是**先取消再排**，不能反过来：
 * 反过来的话，取消那一步会把刚排好的新通知一起删掉。
 *
 * 任何时候调用都安全：没有权限时它只是取消掉旧的、什么都不排，
 * 并返回一句「提醒没开」。启动时、改提醒时间后、删任务后都调它。
 */
export async function syncReminders(nowMs: number = Date.now()): Promise<ReminderSyncResult> {
  const Notifications = requireNotifications();
  if (!Notifications) {
    return { ok: false, scheduled: 0, skipped: 0, message: '这台设备上发不了通知，提醒没有排。' };
  }
  const settings = getSettings();
  const { today } = effectiveToday(nowMs, settings.day_start_hour, settings.last_settled_date);

  const tasks = listActiveTasks();
  const withReminder = tasks.filter((task) => task.reminderMinute !== null);

  // 一条提醒都没设：清空队列就够了，不用问权限
  if (withReminder.length === 0) {
    await cancelReminders();
    return { ok: true, scheduled: 0, skipped: 0, message: '没有设提醒的任务。' };
  }

  const permission = await getPermission();
  if (permission !== 'granted') {
    await cancelReminders();
    return {
      ok: false,
      scheduled: 0,
      skipped: 0,
      message:
        permission === 'denied'
          ? '系统里把 Ember 的通知关掉了，所以提醒不会出现。'
          : '还没有允许 Ember 发通知，所以提醒不会出现。',
    };
  }

  await ensureChannel();
  await cancelReminders();

  /*
   * 「今天已经做过的」从这里查，而不是从 services/today.ts 取：
   * 那边装配的是首页视图（含连胜、目标名等一堆用不上的东西），
   * 这里只要一个 id 集合。直接查一次打卡表更直白，也避免 services 之间互相 import。
   */
  const doneToday = new Set<string>();
  try {
    for (const pair of listActiveCheckinDates(today)) {
      if (pair.localDate === today) doneToday.add(pair.taskId);
    }
  } catch (err) {
    // 查不到就当「今天什么都没做」——最多多排一条提醒，不影响数据
    console.warn('[Ember] 读取今日打卡失败，提醒按未完成处理', err);
  }

  const all = buildOccurrences(
    withReminder,
    today,
    settings.day_start_hour,
    settings.week_starts_on,
    nowMs,
    doneToday
  );
  const chosen = capOccurrences(all, REMINDER_MAX_SCHEDULED);

  let scheduled = 0;
  for (const item of chosen) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: reminderIdentifier(item.taskId, item.dateKey),
        content: {
          title: item.title,
          body: item.body,
          // 点通知进来时带上任务 id：将来可以跳到那一行，现在只是留着
          data: { taskId: item.taskId, dateKey: item.dateKey },
          // 不出声：安静的通知是「有空的时候记一下」，响铃的通知是「你该做了」。
          // 文案与音量必须说同一件事。
          sound: false,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: item.atMs,
          channelId: CHANNEL_ID,
        },
      });
      scheduled += 1;
    } catch (err) {
      // 单条失败不影响其它条：机型限流、权限被中途收回都可能让某一条失败
      console.warn('[Ember] 排一条提醒失败', item.taskId, item.dateKey, err);
    }
  }

  return {
    ok: true,
    scheduled,
    skipped: all.length - chosen.length,
    message:
      scheduled === 0
        ? '这段时间没有需要提醒的事。'
        : `排好了 ${scheduled} 条提醒。`,
  };
}

/**
 * 算下周复盘提醒该排在哪个时刻（纯函数，不碰通知 API）。
 *
 * 规则：
 *   - 只排一条：本周日 20:00；
 *   - 如果本周日已经过了（比如现在是周一），就排到下周日；
 *   - 如果这个时刻已经过了，同样往后推一周。
 *
 * 为什么只排一条而不是预排几周：
 *   任务提醒预排 7 天是因为它每天都有；周复盘一周才一次，
 *   排一条就够覆盖到「下次打开 App」了，而每次启动都会重排。
 *   预排多周反而会在「用户已经写过了」时多弹一次。
 *
 * 返回 null 表示不需要排（算不出来时宁可不错）。
 */
export function nextReviewReminderMs(nowMs: number, dayStartHour: number): number | null {
  try {
    const today = businessDate(nowMs, dayStartHour);
    // 用 startOfWeek 而不是自己算星期：星期偏移的写法（周日=0 还是 1）
    // 是最容易写反的地方，而项目里已经有唯一入口了。
    // 固定用周一为周首：复盘的主键是「这一周的周一」，与用户的周起始设置无关。
    let sunday = addDays(startOfWeek(today, 1), 6);

    let atMs = reminderInstantMs(sunday, REVIEW_REMINDER_MINUTE, dayStartHour);
    // 已经过了（现在是周日 21 点之后，或者已经过了本周日）→ 推到下周日
    while (atMs <= nowMs) {
      sunday = addDays(sunday, 7);
      atMs = reminderInstantMs(sunday, REVIEW_REMINDER_MINUTE, dayStartHour);
    }
    return atMs;
  } catch (err) {
    console.warn('[Ember] 计算周复盘提醒时刻失败', err);
    return null;
  }
}

/**
 * 排一条周复盘提醒。
 *
 * ---- 它不请求权限 ----
 *
 * 周复盘提醒是**自动的**，不是用户主动打开的。而权限只在用户
 * 「第一次打开某条任务提醒」时才问（D36）——那是他的一个明确动作，
 * 因果关系清楚。为一个他没要求过的周提醒弹权限框，他会点「不允许」，
 * 而安卓上拒绝过就不再弹，等于把他以后想开的任务提醒也堵死了。
 *
 * 所以：**只在已经有权限时排**。没权限就什么都不做，不打扰。
 *
 * ---- 已经写过这一周就不排 ----
 *
 * 用户周日白天就写完了，晚上不该再被问一次。所以排之前查一次。
 */
export async function syncReviewReminder(nowMs: number = Date.now()): Promise<void> {
  try {
    const Notifications = requireNotifications();
    if (!Notifications) return;
    // 先取消旧的：一周一条，重排就是替换
    await cancelReviewReminder();

    const permission = await getPermission();
    if (permission !== 'granted') return;

    const settings = getSettings();
    const { today } = effectiveToday(
      nowMs,
      settings.day_start_hour,
      settings.last_settled_date
    );

    // 这一周已经写过 → 不排（用户周日白天就写完了，晚上不该再问）
    const thisWeek = weekKeyOf(today);
    if (listReviewWeeks().includes(thisWeek)) return;

    const atMs = nextReviewReminderMs(nowMs, settings.day_start_hour);
    if (atMs === null) return;

    await ensureChannel();

    await Notifications.scheduleNotificationAsync({
      identifier: `${REVIEW_REMINDER_PREFIX}${thisWeek}`,
      content: {
        title: '这一周',
        body: REVIEW_REMINDER_BODY,
        data: { kind: 'weekly-review', weekKey: thisWeek },
        // 与任务提醒同一条规矩：不出声、不弹横幅（D36）
        sound: false,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: atMs,
        channelId: CHANNEL_ID,
      },
    });
  } catch (err) {
    // 提醒不是关键路径：排不上就排不上，绝不阻断任何事
    console.warn('[Ember] 排周复盘提醒失败', err);
  }
}

/** 取消周复盘提醒（只取消自己那条） */
export async function cancelReviewReminder(): Promise<void> {
  const Notifications = requireNotifications();
  if (!Notifications) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    const mine = scheduled.filter((request) =>
      request.identifier.startsWith(REVIEW_REMINDER_PREFIX)
    );
    await Promise.all(
      mine.map((request) =>
        Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => undefined)
      )
    );
  } catch (err) {
    // 读不到列表时不退回「全部取消」：那会把任务提醒也删掉，
    // 而周复盘提醒丢一条只是少一次邀请，代价小得多
    console.warn('[Ember] 取消周复盘提醒失败', err);
  }
}

/**
 * 启动时的提醒维护。
 *
 * 做两件事：
 *   1. 比对时区，变了就整体重排（排期用的是墙上时钟，换时区后旧排期全错）；
 *   2. 补排（昨天排的 7 天已经用掉一天，今天要补上第 7 天）。
 *
 * 为什么每次启动都做：Android 会在省电模式下丢掉部分闹钟，
 * 而重排的成本是 20 条系统调用，几十毫秒。比起「提醒突然不响了」，这个成本值得。
 *
 * 失败一律吞掉：启动流程里的任何一步抛错都会让 App 打不开，而提醒不是关键路径。
 */
export async function maintainRemindersOnLaunch(nowMs: number = Date.now()): Promise<void> {
  try {
    const settings = getSettings();
    const timeZone = readTimeZone();
    const changed = timeZone !== '' && settings.last_time_zone !== timeZone;

    if (changed) {
      updateSettings({ lastTimeZone: timeZone });
    }

    // 只有用户设过提醒才重排：没设过的人不该在启动时被问权限、也不该写系统队列
    const hasAny = listActiveTasks().some((task) => task.reminderMinute !== null);
    if (hasAny) {
      await syncReminders(nowMs);
    }

    /*
     * 周复盘提醒。**与任务提醒分开调**，而不是合进 syncReminders：
     *
     *   - 它不需要「用户设过提醒」这个前提（但内部会自己查权限，没权限就不排）；
     *   - 它不被 cancelReminders 管（前缀不同），所以任务提醒清空时它还在；
     *   - 它的时机是「每周一条」，与 7 天预排的逻辑无关。
     */
    await syncReviewReminder(nowMs);
  } catch (err) {
    console.warn('[Ember] 启动时维护提醒失败', err);
  }
}

/**
 * 读本地时区名。
 *
 * 用 Intl 而不是 native 模块：RN 0.88 的 Hermes 自带完整 Intl，
 * 而为此装一个 expo-localization 只为拿一个字符串不值得。
 *
 * 取不到时返回空串，调用方据此跳过「时区变了」的判断——
 * 宁可某次启动不重排，也不要因为读不到时区就每次启动都重排。
 */
export function readTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
  } catch {
    return '';
  }
}

/**
 * 一个任务下一次提醒的时刻（毫秒）。没有提醒或已经过了今天的时间点时为 null。
 *
 * 只给界面显示「下次提醒是明天 08:00」用，不参与排期。
 * 这里用「从今天往后找 7 天」而不是直接算今天，是因为今天的时刻可能已经过了。
 */
export function nextReminderMs(
  task: Task,
  nowMs: number,
  dayStartHour: number
): number | null {
  if (task.reminderMinute === null) return null;
  const today = businessDate(nowMs, dayStartHour);

  for (let offset = 0; offset < REMINDER_HORIZON_DAYS; offset++) {
    const dateKey = addDays(today, offset);
    if (!isScheduledOn(task, dateKey, 1, 0)) continue;
    const atMs = reminderInstantMs(dateKey, task.reminderMinute, dayStartHour);
    if (atMs > nowMs) return atMs;
  }
  return null;
}

/** 距离某天还有几天。给「明天 / 后天」的文案用。负数按 0 算 */
export function daysUntil(fromDateKey: string, toDateKey: string): number {
  if (!isDateKey(fromDateKey) || !isDateKey(toDateKey)) return 0;
  return Math.max(0, diffDays(fromDateKey, toDateKey));
}

/** 提醒设置页上的一行：一个任务 + 它的提醒时刻 */
export interface ReminderTarget {
  id: string;
  title: string;
  /** 从零点起的分钟数。null = 不提醒 */
  minute: number | null;
  /** 任务类型。习惯与待办在列表里长得一样，但读屏需要区分 */
  type: Task['type'];
}

/**
 * 列出现在可以设提醒的任务。
 *
 * 只列活跃任务：暂停 / 归档 / 已完成的待办不会排提醒，
 * 列出来会让人以为设了就能响。已经软删除的更不该出现——
 * 而它们的 reminder_minute 还留在库里（软删除不动列），
 * 所以这里必须走 listActiveTasks，不能直接查表。
 */
export function listReminderTargets(): ReminderTarget[] {
  return listActiveTasks().map((task) => ({
    id: task.id,
    title: task.title,
    minute: task.reminderMinute,
    type: task.type,
  }));
}

/**
 * 改一个任务的提醒时刻，然后重排。
 *
 * 两件事必须一起做：只写库不重排，用户改完看不到任何变化（旧通知还在）；
 * 只重排不写库，下次启动又会被库里的旧值覆盖回去。
 *
 * 写库是同步的、重排是异步的：先写库（失败会抛错，界面可以提示），
 * 再 await 重排。重排失败只记日志——库里已经是新值了，
 * 下次启动会补上，这比「写失败却排上了」安全。
 */
export async function setTaskReminder(
  taskId: string,
  minute: number | null,
  nowMs: number = Date.now()
): Promise<ReminderSyncResult> {
  updateTask(taskId, { reminderMinute: minute });
  return syncReminders(nowMs);
}
