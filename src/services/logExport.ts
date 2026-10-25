/**
 * 日志导出（阶段 6 第 8 条）。
 *
 * 单独一个文件而不是塞进 errorLog.ts：写日志是**同步、频繁、绝不能抛错**的，
 * 而导出是**异步、偶发、可以失败**的。两者的错误处理策略完全相反，
 * 混在一起会让「写日志」那一半被迫 import expo-sharing。
 */
import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';

import { logFileName, readLog } from './errorLog';

export interface ExportLogResult {
  ok: boolean;
  message: string;
  uri?: string;
}

/**
 * 把日志导出成一个 txt 文件，走系统分享面板。
 *
 * 失败不抛错：这是排查用的辅助功能，它失败不该影响任何事。
 */
export async function exportLog(nowMs: number = Date.now()): Promise<ExportLogResult> {
  const text = readLog();

  if (text.length === 0) {
    return { ok: false, message: '还没有记录下什么。' };
  }

  try {
    const file = new File(Paths.cache, logFileName(nowMs));
    if (file.exists) file.delete();
    file.writeSync(text);

    let canShare = false;
    try {
      canShare = await Sharing.isAvailableAsync();
    } catch {
      canShare = false;
    }

    if (!canShare) {
      return {
        ok: false,
        message: '已经写好了，但这台手机没有可以接收文件的 App。',
        uri: file.uri,
      };
    }

    await Sharing.shareAsync(file.uri, {
      mimeType: 'text/plain',
      dialogTitle: '保存 Ember 的日志',
    });

    return { ok: true, message: '日志已经写好了。', uri: file.uri };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : '没能写出来。',
    };
  }
}
