/**
 * 业务日的唯一入口。
 *
 * 规则（docs/03 §4）：
 * 1. 业务日 = localDate "YYYY-MM-DD"，由「设备本地时间 + dayStart」推导。
 * 2. 绝不用 UTC 时间戳判断业务日；UTC 只用于审计、排序、补记倒计时。
 * 3. dayStart 默认 4 点：凌晨 3:59 仍算前一天，4:00 算新的一天。
 * 4. 日期加减一律走 UTC 日期序数，避免夏令时那天只有 23 小时导致算错一天。
 * 5. 业务日只能前进：系统时间被调回过去时，沿用上次结算日（见 effectiveToday）。
 *
 * 本文件属于 domain 层：不 import React、不碰数据库，只接收纯数据返回纯数据。
 * 全项目只允许从这里取「今天」；任何 new Date().getDate() 之类的散装写法都是 bug。
 */

/** 默认日界：凌晨 4 点。与 settings.day_start_hour 的默认值一致 */
export const DEFAULT_DAY_START_HOUR = 4;

/** 一小时的毫秒数。只用于「距业务日结束过了几小时」这类估算，不用于日期加减 */
export const MS_PER_HOUR = 3_600_000;

/** 一天的毫秒数。只用于 UTC 日期序数做差（UTC 没有夏令时，恒为 24 小时） */
const MS_PER_UTC_DAY = 86_400_000;

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 数字补两位：7 -> "07" */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 把日界小时钳制到 0–23 的整数；脏数据回退到默认值 4 */
function clampDayStartHour(hour: number): number {
  if (!Number.isFinite(hour)) return DEFAULT_DAY_START_HOUR;
  return Math.min(23, Math.max(0, Math.floor(hour)));
}

/**
 * 把本地 Date 格式化成 "YYYY-MM-DD"。
 *
 * 用本地的 getFullYear/getMonth/getDate，不用 toISOString——
 * toISOString 是 UTC，东八区晚上 8 点之后就会变成「明天」，业务日会整体错一天。
 */
export function toLocalDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** 同 toLocalDateString，只是换了个更短的名字，方便业务代码里用 */
export function toDateKey(d: Date): string {
  return toLocalDateString(d);
}

/**
 * 把日期键还原成 Date。
 *
 * 为什么固定用本地正午 12:00：夏令时切换通常在凌晨 2–3 点，
 * 那个钟点可能不存在或存在两次；正午永远存在且远离切换点，
 * 所以构造出来的 Date 一定落在正确的那一天。
 */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

/** 解析 "YYYY-MM-DD"，非法输入返回 null（不抛异常，调用方自行回退） */
export function parseLocalDate(
  localDate: string,
): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

/**
 * 严格的业务日键校验。
 *
 * 除了格式，还要反向验证：像 "2026-02-30" 会被 Date 自动滚到 3 月 2 日，
 * 用 toDateKey 再转一次就和原串不一致，从而被拒绝。
 */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = dateFromKey(value);
  if (Number.isNaN(d.getTime())) return false;
  return toDateKey(d) === value;
}

/**
 * 业务日：本地时间 dayStartHour 点之前，仍属于前一个业务日。
 *
 * 做法：先构造「本地今天 dayStartHour 点」这个时间点。
 * - 当前时间 >= 它 → 已经过了今天的切换点，算今天；
 * - 否则 → 还停留在昨晚的尾巴上，算昨天。
 *
 * 用本地构造器而不是「减 N 毫秒」，是为了让夏令时那天也能算对。
 * @param nowMs 当前时间戳（毫秒）
 * @param dayStartHour 日界小时，0–23，来自 settings.day_start_hour
 */
export function businessDate(
  nowMs: number,
  dayStartHour: number = DEFAULT_DAY_START_HOUR,
): string {
  const now = new Date(nowMs);
  const hour = clampDayStartHour(dayStartHour);

  const todayStartMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    0,
    0,
    0,
  ).getTime();

  if (nowMs >= todayStartMs) return toDateKey(now);
  // 还没到切换点：日历上的昨天就是业务日
  return addDays(toDateKey(now), -1);
}

/**
 * 业务日加减 n 天。
 *
 * 用 Date.UTC 的日期序数做加法：UTC 每天恒为 24 小时，
 * 所以「+1 天」在任何时区、任何夏令时切换日都稳定得到下一天。
 * 取 UTC 字段回写字符串，保证不被本地时区偏移带跑。
 */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + n, 12, 0, 0, 0));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** 日期键转 UTC 日期序数（毫秒）。只用于做差，不参与业务判断 */
function utcOrdinal(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

/**
 * 两个业务日相差多少天：返回 b - a。
 *
 * 正数表示 b 比 a 晚，负数表示早，0 表示同一天。
 * 例：diffDays('2026-10-24', '2026-10-26') === 2。
 */
export function diffDays(a: string, b: string): number {
  return Math.round((utcOrdinal(b) - utcOrdinal(a)) / MS_PER_UTC_DAY);
}

/**
 * ISO 星期：1 = 周一 … 7 = 周日。
 *
 * 数据库里 week_starts_on / weekly_days 用的都是这套编号，
 * 统一在这里转换，不要在外面临时用 getDay()（那是 0 = 周日）。
 */
export function isoWeekday(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  const wd = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay(); // 0 = 周日
  return wd === 0 ? 7 : wd;
}

/**
 * 所在业务周的起始日。
 *
 * weekStartsOn：1 = 周一（默认，符合中国习惯），0 = 周日。
 * 先把 ISO 星期换算成「距本周第一天过了几天」，再回退相应天数。
 */
export function startOfWeek(key: string, weekStartsOn: number = 1): string {
  const wd = isoWeekday(key); // 1..7
  const ws = weekStartsOn === 0 ? 0 : 1;
  const offset = ws === 1 ? wd - 1 : wd % 7;
  return addDays(key, -offset);
}

/**
 * 该月有多少天。
 *
 * new Date(y, m, 0) 的 m 是 1 基月份，传进去正好是「下个月的第 0 天」，
 * 也就是本月最后一天。不需要判断闰年。
 */
export function daysInMonth(key: string): number {
  const [y, m] = key.split('-').map(Number);
  return new Date(y, m || 1, 0).getDate();
}

/** 该业务日是这个月的几号（1–31） */
export function dayOfMonth(key: string): number {
  return Number(key.slice(8, 10));
}

/**
 * 业务日开始的那个真实时间点（本地毫秒）。
 *
 * 例：key = '2026-10-24'、dayStartHour = 4 → 2026-10-24 04:00:00.000（本地）。
 */
export function businessDayStartMs(key: string, dayStartHour: number): number {
  const d = dateFromKey(key);
  return new Date(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    clampDayStartHour(dayStartHour),
    0,
    0,
    0,
  ).getTime();
}

/**
 * 业务日结束的那个真实时间点 = 下一个业务日的开始点。
 *
 * 注意不是「当天 23:59」：日界为 4 点时，10 月 24 日的业务日要持续到 10 月 25 日 04:00。
 * 补记窗口就是从这个时间点往后算小时的（见 score.ts）。
 */
export function businessDayEndMs(key: string, dayStartHour: number): number {
  return businessDayStartMs(addDays(key, 1), dayStartHour);
}

/**
 * 防时钟回拨后的「有效今天」。
 *
 * 规则：业务日只能前进，不能倒退。
 * - lastSettledDate 为空（首次启动）：直接采用真实业务日；
 * - 真实业务日比上次结算日还早：说明系统时间被调回去了，
 *   沿用 lastSettledDate，并把 clockBack 标记为 true，由上层只做记录、不做惩罚。
 *
 * 为什么不在这里抛错：跨时区旅行、时区自动切换都可能让业务日短暂回退，
 * 抛错会误伤正常用户。这里只返回事实，决策交给调用方。
 */
export function effectiveToday(
  nowMs: number,
  dayStartHour: number,
  lastSettledDate: string | null | undefined,
): { today: string; clockBack: boolean } {
  const rawToday = businessDate(nowMs, dayStartHour);

  if (!lastSettledDate || !isDateKey(lastSettledDate)) {
    return { today: rawToday, clockBack: false };
  }

  // 上次结算日比真实今天更晚 → 时钟被调回去了
  if (diffDays(rawToday, lastSettledDate) > 0) {
    return { today: lastSettledDate, clockBack: true };
  }

  return { today: rawToday, clockBack: false };
}

/** 返回「周五」这样的星期标签；非法日期返回空串 */
export function weekdayLabel(localDate: string): string {
  if (!isDateKey(localDate)) return '';
  // 用本地构造算星期，避免 new Date("YYYY-MM-DD") 被当成 UTC
  const wd = isoWeekday(localDate);
  return WEEKDAY_LABELS[wd % 7] ?? '';
}

/** 返回「10 月 24 日 周五」这样的中文日期标签 */
export function formatDateLabel(localDate: string): string {
  const parsed = parseLocalDate(localDate);
  if (!parsed) return '';
  const week = weekdayLabel(localDate);
  return `${parsed.month} 月 ${parsed.day} 日${week ? ` ${week}` : ''}`;
}

/** 取本地小时（0–23），用于问候语 */
export function hourOf(nowMs: number): number {
  return new Date(nowMs).getHours();
}

/** 按本地小时给一句问候。语气克制，不催促 */
export function greetingForHour(hour: number): string {
  if (hour < 5) return '夜深了';
  if (hour < 11) return '早';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}
