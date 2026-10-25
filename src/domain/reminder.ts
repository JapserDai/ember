/**
 * 提醒时刻与提醒文案（纯函数：不碰数据库、不碰通知 API、不读系统时间）。
 *
 * ---- 为什么时刻存成一个整数 ----
 *
 * 这一层只做两件事：把「从零点起的分钟数」和「20:30」互相转，
 * 以及从 20 条文案里按种子挑一条。前者是格式，后者是语气，
 * 其余的（什么时候真的弹、谁能弹、弹几条）都是 services 的事。
 *
 * ---- 提醒是这个 App 里唯一会主动打扰人的东西 ----
 *
 * 其他所有功能都是「你来的时候它在」。通知反过来：它在你没打开 App 的时候
 * 出现在锁屏上。所以这一层有一条硬规矩：
 *
 *   **文案只能描述事实、发出邀请，不能催促，更不能评价。**
 *
 * 「你还没做」是催促，「今天这一格还空着」是事实。
 * 「坚持一下」是评价，「想起来了就点一下」是邀请（而且允许你不点）。
 * 全部 20 条都要过 `text-rules.ts` 的禁用词表，与 App 里其它文案同一把尺子。
 *
 * ---- 为什么文案要按种子挑而不是随机 ----
 *
 * 同一个任务在同一天重排通知（改设置、换时区、杀进程重开都会触发重排）
 * 必须得到同一句话。用 Math.random 的话，用户改一次设置，锁屏上那句话就变了，
 * 会显得这个 App 在抽风。种子固定为「任务 id + 日期」，跨设备也一致。
 */

/**
 * 一天的分钟数。
 *
 * 时刻用「从零点起的分钟数」表示：0 = 00:00，1439 = 23:59。
 * 一列整数就能排序、比较、做 CHECK，也不必处理 "8:5" 这种非法字符串。
 */
export const MINUTES_PER_DAY = 1440;

/** 提醒时刻的合法区间。写进 tasks.reminder_minute 的 CHECK 也是这两头 */
export const REMINDER_MIN_MINUTE = 0;
export const REMINDER_MAX_MINUTE = MINUTES_PER_DAY - 1;

/**
 * 分钟数是不是合法的提醒时刻。
 *
 * 只接受整数：`reminderMinute: 8.5` 这种值会让 `formatReminder` 拼出 "08:30"
 * 看起来很正常，但库里那一列是 INTEGER，写进去会被 SQLite 静默截成 8，
 * 于是提醒时间悄悄变成了 00:08。宁可在入口就拒掉。
 */
export function isReminderMinute(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= REMINDER_MIN_MINUTE &&
    value <= REMINDER_MAX_MINUTE
  );
}

/** 两位补零 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 分钟数 → "20:30"。
 *
 * 非法值返回空串而不是抛错：它会被用在界面的一行副标题上，
 * 那里的正确降级是「这一行不写」，不是让整页崩掉。
 */
export function formatReminderMinute(minute: number | null | undefined): string {
  if (!isReminderMinute(minute)) return '';
  return `${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`;
}

/**
 * "20:30" → 分钟数。
 *
 * 只认 24 小时制的 `H:MM` / `HH:MM`。**不认**「晚上八点半」这类说法：
 * 解析自然语言的规则太多（早上/晚上、点半/点一刻、十二小时制的 12 点是几点），
 * 猜错一次就会在某个奇怪的时间把人吵醒，而用户以为自己设对了。
 *
 * 非法输入返回 null，由界面给一句格式提示。
 */
export function parseReminderInput(text: string): number | null {
  const match = /^\s*(\d{1,2})\s*[:：]\s*(\d{1,2})\s*$/.exec(text);
  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  return hour * 60 + minute;
}

/**
 * 设置页与新建页上的几个快捷时刻。
 *
 * 选的不是「好看的时间」，是一天里三个真实的分界：
 * 早上 8 点（出门前）、中午 12 点（午饭）、晚上 20 点（饭后）。
 * 这三个覆盖了大多数习惯，剩下的自己写。
 */
export const REMINDER_PRESETS: ReadonlyArray<{ label: string; minute: number }> = [
  { label: '08:00', minute: 8 * 60 },
  { label: '12:00', minute: 12 * 60 },
  { label: '20:00', minute: 20 * 60 },
];

/** 一整句「每天 20:30」，给设置页那一行用。null 表示不提醒 */
export function describeReminder(minute: number | null | undefined): string {
  const clock = formatReminderMinute(minute);
  return clock ? `每天 ${clock}` : '不提醒';
}

/**
 * 提醒文案库（20 条轮换）。
 *
 * ---- 三条写作规则 ----
 *
 * 1. **只描述事实或发出邀请，不催促、不评价。**
 *    「今天这一格还空着」是事实；「你还没做」是催促，读起来像被记账。
 * 2. **明确允许不做。** 「忘了也没关系」「方便的时候再说」这类句子看着多余，
 *    但它们是这个 App 的立场的落点：不来也可以，不算欠账。
 * 3. **不提数字。** 不写「已经 3 天没记」——那正是「永不惩罚」要避免的计数。
 *
 * 全部不含 `FORBIDDEN_WORDS` 里的任何一个词（有一条断言逐条检查）。
 */
export const REMINDER_LINES: readonly string[] = [
  '有空的时候，记一下。',
  '这件事今天在清单上。',
  '想起来了就点一下。',
  '现在方便的话，可以做一点。',
  '今天这一格还空着。',
  '不急，方便的时候再说。',
  '一个很小的动作就够了。',
  '想起来就去做，忘了也没关系。',
  '今天做到这儿也可以。',
  '顺手做掉它？',
  '这一件还在清单上。',
  '随时都可以，不用挑时候。',
  '有心情就做一点。',
  '今天想不想动一动？',
  '留着，什么时候做都算数。',
  '一小步也算数。',
  '想起来就打开看看。',
  '今天过得怎么样？',
  '今天的清单在这里。',
  '方便的话看一眼。',
];

/**
 * 一条提醒的文案种子。
 *
 * `任务 id | 业务日`：同一个任务在同一天无论重排多少次都是同一句，
 * 第二天换新的一句。用任务 id 而不是标题——标题可以改，
 * 改完标题通知里的那句话跟着变，会以为是另一件事提醒了他。
 */
export function reminderSeed(taskId: string, dateKey: string): string {
  return `${taskId}|${dateKey}`;
}

/**
 * 一个业务日里的提醒时刻，换算成真实时间戳（本地毫秒）。
 *
 * ---- 为什么不能直接 dateKey + 分钟数 ----
 *
 * 业务日不是自然日。日界为 4 点时，「10 月 25 日」这一天从 25 日 04:00
 * 一直持续到 26 日 04:00。所以业务日 10-25 上的两个提醒：
 *   - 20:00 → 10-25 20:00（还在同一天）
 *   - 00:30 → **10-26 00:30**（已经跨到日历上的第二天）
 *
 * 直接把分钟数加到 dateKey 上，会把凌晨的提醒排到前一天凌晨——
 * 提前将近 24 小时弹出来，而且那天用户还没开始做。
 *
 * 规则：分钟数 ≥ 日界 → 落在 dateKey 当天；否则落在 dateKey 的下一天。
 * 这条规则只在 0 ≤ 日界 ≤ 23 时成立，与 settings.day_start_hour 的 CHECK 一致。
 */
export function reminderInstantMs(
  dateKey: string,
  minute: number,
  dayStartHour: number
): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  const dayStart = Math.max(0, Math.min(23, Math.floor(dayStartHour))) * 60;
  const dayOffset = minute >= dayStart ? 0 : 1;
  return new Date(year, month - 1, day + dayOffset, Math.floor(minute / 60), minute % 60, 0, 0).getTime();
}

/**
 * 一次提醒排期的候选。
 *
 * 只描述「哪件事、哪一天、几点、说什么」，不含任何通知 API 的概念。
 * 真正调 `scheduleNotificationAsync` 的是 services/reminders.ts——
 * 这样「排哪些」可以在没有原生模块的环境里被断言，而「怎么排」只有一处。
 */
export interface ReminderOccurrence {
  /** 任务的 id。同时也是取消通知时要对上的键 */
  taskId: string;
  /** 任务标题。通知的标题用它 */
  title: string;
  /** 这条提醒属于哪个业务日 */
  dateKey: string;
  /** 真实触发时刻（本地毫秒） */
  atMs: number;
  /** 通知正文（已按种子挑好的一条） */
  body: string;
}

/**
 * 把候选按时间排序、截断到上限。
 *
 * ---- 为什么是「最近的先排」而不是「每件事平均分」 ----
 *
 * 上限 20 条（docs/05 阶段 2 第 1 条）。3 件事 × 7 天 = 21 条，必然要少排一条。
 * 两种分法：
 *   - 平均分：每件事排 6 天，第 7 天全部没有；
 *   - 最近的先排：前 6 天排满，第 7 天少一条。
 * 后者更好：通知的价值随「离现在多远」衰减，用户真正会看到的是明天早上那一条。
 * 而且被截掉的永远是最后一天，不是随机某天——规则可预期。
 *
 * 排序键是 (时刻, 任务 id)：同一时刻有两条提醒时，按 id 排，
 * 保证每次重排得到完全相同的顺序（种子化 PRNG 的同一个要求）。
 */
export function capOccurrences(
  items: readonly ReminderOccurrence[],
  max: number
): ReminderOccurrence[] {
  return [...items]
    .sort((a, b) => (a.atMs !== b.atMs ? a.atMs - b.atMs : a.taskId < b.taskId ? -1 : a.taskId > b.taskId ? 1 : 0))
    .slice(0, Math.max(0, max));
}

/**
 * 通知的稳定标识符。
 *
 * 用它而不是让系统自己生成 id：重排时要先取消旧的，如果两边 id 对不上，
 * 就只能 `cancelAllScheduledNotificationsAsync()`——那会把将来可能加的
 * 其它类型通知（周复盘提醒）一起取消掉。
 *
 * 前缀 `reminder:` 是给「取消时只取消自己的」用的：
 * 系统返回的已排列表里，只有以它开头的才归提醒功能管。
 */
export const REMINDER_ID_PREFIX = 'reminder:';

export function reminderIdentifier(taskId: string, dateKey: string): string {
  return `${REMINDER_ID_PREFIX}${taskId}:${dateKey}`;
}

/** 这个标识符是不是提醒功能排的 */
export function isReminderIdentifier(identifier: string): boolean {
  return identifier.startsWith(REMINDER_ID_PREFIX);
}
