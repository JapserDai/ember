/**
 * 本地错误日志（阶段 6 第 8 条）。
 *
 * ---- 为什么它必须是本地的 ----
 *
 * 这个 App 没有网络权限。所以「错误上报」这件事只能做成
 * 「记在本地 + 用户自己导出」。没有第二种可能，也不该有。
 *
 * ---- 为什么要记，而不是只 console.warn ----
 *
 * `console.warn` 在 Release 包里**看不到**——用户手机上没有终端。
 * 所以一个只在真机上复现的问题，如果只打了 console，那就永远查不到。
 *
 * 记进一个文件之后，用户可以在「设置 → 数据」里导出来发给开发者。
 *
 * ---- 为什么不装 crash reporter ----
 *
 * 那些库全部需要联网。装一个不能联网的上报库，等于装一个死代码。
 *
 * ---- 记什么、不记什么 ----
 *
 * 记：时间、级别、消息、以及一段**脱敏过的**细节（错误码、表名、操作名）。
 * 不记：用户写的任何内容（任务名、目标、复盘正文、bio）。
 *
 * 最后一条很重要：错误日志是给排查用的，不是给窥探用的。
 * 所以 `logError` 只接受结构化的短字段，不接受任意字符串拼接。
 */
import { File, Paths } from 'expo-file-system';

/** 一条日志 */
export interface LogEntry {
  /** 毫秒时间戳 */
  at: number;
  level: 'warn' | 'error';
  /** 发生了什么。固定短语，不带用户内容 */
  message: string;
  /** 附带的短字段。值只能是数字/短字符串/布尔 */
  detail?: Record<string, string | number | boolean | null>;
}

/** 日志文件名。放缓存目录：它是排查用的临时物，不该占文档空间 */
const LOG_FILE = 'ember-log.txt';

/**
 * 最多保留多少行。
 *
 * 500 行大约 30–60 KB。超过就截掉最早的——
 * 一个无限增长的日志文件会在几个月后变成一个几十 MB 的包袱。
 */
const MAX_LINES = 500;

/** 内存里的缓冲。写盘是异步的，而日志调用发生在同步的代码路径里 */
let buffer: string[] = [];
let loaded = false;

/** 日志文件 */
function logFile(): File {
  return new File(Paths.cache, LOG_FILE);
}

/**
 * 把一行格式化成可读的文本。
 *
 * 用「时间 级别 消息 {细节}」这一种格式，不引 JSON 的缩进：
 * 日志是给人看的，一行一条最好读，也最好用 grep。
 */
function format(entry: LogEntry): string {
  const iso = new Date(entry.at).toISOString().replace('T', ' ').slice(0, 19);
  const detail = entry.detail
    ? ' ' +
      Object.entries(entry.detail)
        .map(([key, value]) => `${key}=${value === null ? 'null' : String(value)}`)
        .join(' ')
    : '';
  return `${iso} ${entry.level.toUpperCase()} ${entry.message}${detail}`;
}

/** 首次使用时把磁盘上已有的日志读进缓冲 */
function ensureLoaded(): void {
  if (loaded) return;
  loaded = true;
  try {
    const file = logFile();
    if (file.exists) {
      const text = file.textSync();
      buffer = text.split('\n').filter((line) => line.length > 0);
    }
  } catch {
    // 读不到就从空开始：日志读不出来不该让 App 出问题
    buffer = [];
  }
}

/** 把缓冲写回磁盘（覆盖写） */
function flush(): void {
  try {
    const file = logFile();
    if (file.exists) file.delete();
    file.writeSync(buffer.join('\n'));
  } catch {
    // 写不进去就只留在内存里：下一次可能就能写了
  }
}

/**
 * 记一条。
 *
 * **绝不抛错**：日志是排查工具，它自己出问题不该让业务代码崩掉。
 * 这一条必须守住——`logError` 会被放在 catch 块里，而 catch 块里再抛错
 * 会让原始错误被吞掉。
 */
export function logError(
  message: string,
  detail?: LogEntry['detail'],
  level: LogEntry['level'] = 'warn'
): void {
  // 同时打到 console：开发时能在终端看到，而发布包里只看得到文件
  if (level === 'error') console.error(message, detail ?? '');
  else console.warn(message, detail ?? '');

  try {
    ensureLoaded();
    buffer.push(format({ at: Date.now(), level, message, detail }));
    if (buffer.length > MAX_LINES) {
      buffer = buffer.slice(buffer.length - MAX_LINES);
    }
    flush();
  } catch {
    // 静默：见上面的注释
  }
}

/** 读全部日志（给设置页的「看看日志」用） */
export function readLog(): string {
  try {
    ensureLoaded();
    return buffer.join('\n');
  } catch {
    return '';
  }
}

/** 日志有多少行。设置页用它决定要不要显示「导出日志」 */
export function logLineCount(): number {
  try {
    ensureLoaded();
    return buffer.length;
  } catch {
    return 0;
  }
}

/** 清空日志 */
export function clearLog(): void {
  try {
    buffer = [];
    const file = logFile();
    if (file.exists) file.delete();
  } catch {
    // 同上，静默
  }
}

/**
 * 导出的文件名。
 *
 * 带日期：用户可能隔几天导两份，带日期才能在文件管理器里分清。
 */
export function logFileName(nowMs: number = Date.now()): string {
  const d = new Date(nowMs);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `ember-log-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.txt`;
}
