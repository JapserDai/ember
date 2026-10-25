import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../../src/components/Card';
import { exportBackup } from '../../src/services/backup';
import {
  importBackup,
  preImportSnapshotUri,
  restorePreImportSnapshot,
} from '../../src/services/backup-import';
import { clearLog, logLineCount } from '../../src/services/errorLog';
import { exportLog } from '../../src/services/logExport';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 备份页（设置 → 数据 → 备份）。
 *
 * 两件事：把数据导出去、把数据导回来。
 *
 * ---- 为什么整页只有两个按钮 ----
 *
 * 备份在这个 App 里不是一个功能，是一句承诺：**你记下的东西是你的。**
 * 所以这一页要说的不是「我们支持导出」，而是三句实话：
 *   1. 数据只在这台手机上，没有别的地方有一份；
 *   2. 卸载、换机、手机坏了，就没了；
 *   3. 现在可以导出一份，也可以从一份导回来。
 *
 * 页面上不写「建议每周备份」这类话——它把责任推给用户，而真正的问题是
 * App 没有服务器。说清事实，比催人备份更有用。
 *
 * ---- 导入为什么要点两次 ----
 *
 * 导入会**整个换掉**现有数据。一次点击就完成的话，误触的代价是几年的记录。
 * 所以：第一次点弹出确认（说清「现在这些会被换掉」），确认之后才真的选文件；
 * 选文件本身也是一次明确的动作。两次都不难，但都不是误触能完成的。
 *
 * ---- 为什么导入按钮是次要样式 ----
 *
 * 导出是这一页的日常动作，导入是一年用一次的动作。两个同样重的实心按钮
 * 会让人以为它们是同一类事。导入用描边按钮，位置在导出下面。
 */
export default function BackupScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /** 正在导出或导入。期间两个按钮都不给点 */
  const [busy, setBusy] = useState(false);
  /** 上一次操作的结果。null 表示还没操作过 */
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  /** 导入前快照是否存在。存在时给一个「回到导入前」的入口 */
  const [hasSnapshot, setHasSnapshot] = useState(false);
  /** 日志行数。0 表示还没记过什么，不显示导出入口 */
  const [logLines, setLogLines] = useState(0);

  useFocusEffect(
    useCallback(() => {
      try {
        setHasSnapshot(preImportSnapshotUri() !== null);
      } catch {
        setHasSnapshot(false);
      }
      setLogLines(logLineCount());
    }, [])
  );

  const handleExport = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const outcome = await exportBackup();
      setResult({ ok: outcome.ok, text: outcome.message });
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const runImport = useCallback(async () => {
    setBusy(true);
    try {
      const outcome = await importBackup();
      if (outcome.code === 'CANCELLED') {
        // 用户在选文件时退出了：什么都没发生，不必报一句「失败」
        return;
      }
      setResult({ ok: outcome.ok, text: outcome.message });
      if (outcome.ok) setHasSnapshot(true);
    } catch (err) {
      console.warn('[Ember] 导入备份失败', err);
      setResult({ ok: false, text: '没能导入，稍后再试一次。' });
    } finally {
      setBusy(false);
    }
  }, []);

  const handleImport = useCallback(() => {
    if (busy) return;
    Alert.alert(
      '用备份换掉现在的数据？',
      '现在记下的东西会被备份里的内容整个替换掉。换之前会自动存一份现在的，出事时能回来。',
      [
        { text: '算了', style: 'cancel' },
        { text: '选文件', onPress: () => void runImport() },
      ]
    );
  }, [busy, runImport]);

  const handleRestore = useCallback(() => {
    if (busy) return;
    Alert.alert('回到导入前的那份数据？', '现在这些会被换掉。这一步做完就不能再往前退了。', [
      { text: '算了', style: 'cancel' },
      {
        text: '回到导入前',
        style: 'destructive',
        onPress: () => {
          setBusy(true);
          try {
            const outcome = restorePreImportSnapshot();
            setResult({ ok: outcome.ok, text: outcome.message });
            if (outcome.ok) setHasSnapshot(false);
          } catch (err) {
            console.warn('[Ember] 回退失败', err);
            setResult({ ok: false, text: '回退没能完成。' });
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [busy]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/settings');
    }
  };

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
          accessibilityLabel="返回设置"
          onPress={handleBack}
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
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            返回
          </Text>
        </Pressable>

        <Text
          style={{
            marginTop: theme.spacing.md,
            fontSize: theme.typography.size.title,
            lineHeight: theme.typography.lineHeight.title,
            fontWeight: theme.typography.weight.semibold,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.title,
          }}
        >
          备份
        </Text>
      </View>

      {/* 三句实话。不是免责声明，是把真实处境说清楚 */}
      <Card style={{ marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          所有记录只在这台手机上。没有账号，没有服务器，别的地方没有第二份。
        </Text>
        <Text
          style={{
            marginTop: theme.spacing.sm,
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          卸载、换手机、手机坏掉，数据都会跟着没。导出一份放在别处，是唯一的保险。
        </Text>
      </Card>

      {/* 导出 */}
      <View style={{ marginTop: theme.spacing.lg, paddingHorizontal: theme.spacing.pageX }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="导出备份"
          accessibilityState={{ disabled: busy }}
          onPress={handleExport}
          disabled={busy}
          style={({ pressed }) => ({
            minHeight: 52,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.button,
            backgroundColor: palette.primary,
            // 忙的时候降到半透明：按钮还在原处，只是暂时不接
            opacity: busy ? 0.5 : pressed ? 0.75 : 1,
          })}
        >
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              fontWeight: theme.typography.weight.medium,
              color: palette.onPrimary,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {busy ? '正在处理…' : '导出备份'}
          </Text>
        </Pressable>

        {/* 导入。次要样式：一年用一次的动作，不该和导出一样重 */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="从备份导入"
          accessibilityHint="会用备份里的内容换掉现在的数据"
          accessibilityState={{ disabled: busy }}
          onPress={handleImport}
          disabled={busy}
          style={({ pressed }) => ({
            marginTop: theme.spacing.sm,
            minHeight: 52,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.button,
            borderWidth: 1,
            borderColor: palette.primary,
            opacity: busy ? 0.5 : pressed ? 0.6 : 1,
          })}
        >
          <Text
            style={{
              fontSize: theme.typography.size.body,
              lineHeight: theme.typography.lineHeight.body,
              fontWeight: theme.typography.weight.medium,
              color: palette.primary,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            从备份导入
          </Text>
        </Pressable>

        {/* 结果。成功是既成事实（用次要色），失败才用危险色 */}
        {result ? (
          <Text
            accessibilityRole={result.ok ? undefined : 'alert'}
            style={{
              marginTop: theme.spacing.md,
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: result.ok ? palette.textMuted : palette.danger,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            {result.text}
          </Text>
        ) : null}
      </View>

      {/* 回到导入前。只有真的导入过才出现——没有快照时这一块整块不画 */}
      {hasSnapshot ? (
        <Card style={{ marginTop: theme.spacing.xl, marginHorizontal: theme.spacing.pageX }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            上次导入之前的那份数据还留着。如果导进来的东西不对，可以回到它。
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="回到导入前的数据"
            onPress={handleRestore}
            disabled={busy}
            style={({ pressed }) => ({
              alignSelf: 'flex-start',
              minHeight: theme.touchTarget,
              justifyContent: 'center',
              opacity: busy ? 0.5 : pressed ? 0.55 : 1,
            })}
          >
            <Text
              style={{
                fontSize: theme.typography.size.label,
                lineHeight: theme.typography.lineHeight.label,
                color: palette.danger,
                fontFamily: theme.typography.fontFamily.body,
              }}
            >
              回到导入前
            </Text>
          </Pressable>
        </Card>
      ) : null}

      {/* 导入会做什么。写清楚，不藏在确认框里 */}
      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          导入是整体替换，不会和现在的记录合并。文件先过一遍检查，不对就不动你的数据；
          检查通过后，动手之前会自动把现在这份存起来。
        </Text>
      </View>

      {/*
       * 日志（阶段 6 第 8 条）。
       *
       * 只在真的记过东西时出现：一个空日志的导出按钮只会让人以为哪里坏了。
       * 日志不上传（这个 App 没有网络权限），只能用户自己导出后发给开发者。
       */}
      {logLines > 0 ? (
        <Card style={{ marginTop: theme.spacing.xl, marginHorizontal: theme.spacing.pageX }}>
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.body,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            出问题时可以导出一份日志（{logLines} 行）。里面没有你写的任何内容，
            只有时间和错误码。它不会被上传到任何地方。
          </Text>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="导出日志"
              onPress={() => {
                void exportLog().then((outcome) => {
                  setResult({ ok: outcome.ok, text: outcome.message });
                  setLogLines(logLineCount());
                });
              }}
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
                导出日志
              </Text>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="清空日志"
              onPress={() => {
                clearLog();
                setLogLines(0);
                setResult({ ok: true, text: '日志已经清空了。' });
              }}
              style={({ pressed }) => ({
                marginLeft: theme.spacing.md,
                minHeight: theme.touchTarget,
                justifyContent: 'center',
                opacity: pressed ? 0.55 : 1,
              })}
            >
              <Text
                style={{
                  fontSize: theme.typography.size.label,
                  lineHeight: theme.typography.lineHeight.label,
                  color: palette.textMuted,
                  fontFamily: theme.typography.fontFamily.body,
                }}
              >
                清空
              </Text>
            </Pressable>
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}
