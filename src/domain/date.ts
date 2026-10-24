/**
 * 业务日工具（全项目唯一入口）
 *
 * 为什么单独写这一层：
 * 1. 「今天」不是 UTC 的今天，也不是日历的今天，而是「本地时间过了 day_start_hour 才算新的一天」。
 *    凌晨 3:59 打卡算前一天，4:00 才算新的一天。
 * 2. 业务日只以 "YYYY-MM-DD" 字符串在层与层之间传递；UTC 毫秒只用于审计、排序、修复倒计时。
 * 3. 日期加减全部走 UTC 日期序数，避免夏令时那天只有 23 小时导致 ±1 天算错。
 * 4. 任何地方出现 new Date().getDate() 之类的散装写法都是 bug，必须回到这里。
 *
 * 本文件是纯函数：不 import React、不碰数据库、不读全局状态。
 */

/** 一小时的毫秒数。只用于「距业务日结束过了几小时」这类估算，不用于日期加减 */
export const MS_PER_HOUR = 3_600_000;

/** 一天的毫秒数。只用于把 UTC 日期序数差换算成天数（UTC 没有夏令时，恒为 24 小时） */
const MS_PER_UTC_DAY = 86_400_000;

/** 默认日界：凌晨 4 点。与 settings.day_start_hour 的默认值保持一致 */
export const DEFAULT_DAY_START_HOUR = 4;

/** 把数字补成两位字符串：7 -> "07" */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** 把日界小时钳制到 0–23 的整数；脏数据回退到默认值 4 */
function clampDayStartHour(hour: number): number {
  if (!Number.isFinite(hour)) return DEFAULT_DAY_START_HOUR;
  return Math.min(23, Math.max(0, Math.floor(hour)));
}

/**
 * 把 Date 转成本地时区的日期键 "YYYY-MM-DD"。
 *
 * 注意：这里用的是本地 getFullYear/getMonth/getDate，不是 UTC 版本。
 * 因为业务日永远跟着用户手机的本地时钟走——用户出国后，日期就该按当地日历算。
 */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * 把日期键还原成 Date。
 *
 * 为什么固定用本地正午 12:00：
 * 夏令时切换通常发生在凌晨 2–3 点，那段时间「这个钟点可能不存在」或「存在两次」。
 * 正午永远存在、且离切换点足够远，所以用正午构造出来的 Date 一定落在正确的那一天。
 */
export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0);
}

/**
 * 校验一个字符串是不是合法的业务日键。
 *
 * 除了格式，还要反向验证一遍：像 "2026-02-30" 这种会被 Date 自动滚到 3 月 2 日，
 * 用 toDateKey 再转一次就会和原字符串不一致，从而被拒绝。
 */
export function isDateKey(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = dateFromKey(value);
  if (Number.isNaN(d.getTime())) return false;
  return toDateKey(d) === value;
}

/**
 * 由「当前真实时间 + 日界」推导业务日。
 *
 * 做法：先构造「本地今天 dayStartHour 点」这个时间点。
 * - 当前时间 >= 它，说明已经过了今天的切换点，算今天；
 * - 否则说明还停留在昨晚的尾巴上，算昨天。
 *
 * 用本地构造器而不是「减去 N 毫秒」，是为了让夏令时那天的 23 小时也能算对。
 */
export function businessDate(nowMs: number, dayStartHour: number): string {
  const now = new Date(nowMs);
  const hour = clampDayStartHour(dayStartHour);

  // 本地今天 hour 点整。若该钟点因夏令时不存在，JS 会自动顺延到下一个有效时刻
  const todayStartMs = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    hour,
    0,
    0,
    0
  ).getTime();

  if (nowMs >= todayStartMs) return toDateKey(now);
  // 还没到切换点：日历上的昨天就是业务日
  return addDays(toDateKey(now), -1);
}

/**
 * 业务日加减 n 天。
 *
 * 用 Date.UTC 的日期序数做加法：UTC 没有夏令时，每天恒为 24 小时，
 * 所以 "2026-03-08 + 1 天" 在任何时区都稳定得到 "2026-03-09"。
 * 取 UTC 字段回写字符串，保证不会被本地时区偏移带跑。
 */
export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const t = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + n, 12, 0, 0, 0));
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`;
}

/** 把日期键换成 UTC 日期序数（毫秒）。只用于做差，不参与任何业务判断 */
function utcOrdinal(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

/**
 * 两个业务日相差多少天：返回 b - a。
 *
 * 正数表示 b 比 a 晚，负数表示早，0 表示同一天。
 * 例：diffDays('2026-10-24', '2026-10-26') === 2。
 * 用 Math.round 吸收 UTC 序数必然的整日差，避免浮点误差。
 */
export function diffDays(a: string, b: string): number {
  return Math.round((utcOrdinal(b) - utcOrdinal(a)) / MS_PER_UTC_DAY);
}

/**
 * ISO 星期：1 = 周一 ... 7 = 周日。
 *
 * 数据库里 week_starts_on / weekly_days 用的都是这套编号，
 * 所以统一在这里转换，不要在外面临时用 getDay()（那是 0 = 周日）。
 */
export function isoWeekday(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  const wd = new Date(Date.UTC(y, (m || 1) - 1, d || 1)).getUTCDay(); // 0 = 周日
  return wd === 0 ? 7 : wd;
}

/**
 * 所在业务周的起始日。
 *
 * weekStartsOn: 1 = 周一（默认，符合中国习惯），0 = 周日。
 * 先把 ISO 星期换算成「距离本周第一天过了几天」，再回退相应天数。
 */
export function startOfWeek(key: string, weekStartsOn: number = 1): string {
  const wd = isoWeekday(key); // 1..7
  const ws = weekStartsOn === 0 ? 0 : 1;
  // 周一起始：周一偏移 0、周二偏移 1 …… 周日偏移 6
  // 周日起始：周日偏移 0、周一偏移 1 …… 周六偏移 6
  const offset = ws === 1 ? wd - 1 : wd % 7;
  return addDays(key, -offset);
}

/**
 * 该月有多少天。
 *
 * new Date(y, m, 0) 里的 m 是 1 基月份，传给构造器时正好是「下个月的第 0 天」，
 * 也就是本月最后一天。这个技巧不需要判断闰年，也不受时区影响（只取日期字段）。
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
 * 用本地构造器，夏令时当天也能得到正确的时间戳。
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
    0
  ).getTime();
}

/**
 * 业务日结束的那个真实时间点 = 下一个业务日的开始点。
 *
 * 注意不是「当天 23:59」：日界是 4 点时，10 月 24 日的业务日要一直持续到 10 月 25 日 04:00。
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
 * - 真实业务日比上次结算日还早：说明用户把系统时间调回去了，
 *   此时沿用 lastSettledDate，并把 clockBack 标记为 true，交给上层只做记录、不做惩罚。
 *
 * 为什么不在这里抛错：跨时区旅行、时区自动切换都可能让业务日短暂回退，
 * 抛错会误伤正常用户。这里只返回事实，决策交给调用方。
 */
export function effectiveToday(
  nowMs: number,
  dayStartHour: number,
  lastSettledDate: string | null | undefined
): { today: string; clockBack: boolean } {
  const rawToday = businessDate(nowMs, dayStartHour);

  if (!lastSettledDate || !isDateKey(lastSettledDate)) {
    return { today: rawToday, clockBack: false };
  }

  // diffDays(rawToday, lastSettledDate) > 0 表示上次结算日比「真实今天」更晚
  if (diffDays(rawToday, lastSettledDate) > 0) {
    return { today: lastSettledDate, clockBack: true };
  }

  return { today: rawToday, clockBack: false };
}
