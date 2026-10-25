import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StageNote } from '../../src/components/StageNote';
import { useTheme } from '../../src/theme/ThemeProvider';

/**
 * 回忆页。
 *
 * 阶段 1 没有事件表，也不生成回忆卡。
 * 完整的回忆系统（时间线、周报、月报）在阶段 3 与阶段 5。
 *
 * 这一页将来是这个 App 最「不游戏」的地方：
 * 它不给你奖励，只是把你走过的日子摆出来。
 */
export default function MemoriesScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: palette.background }}
      contentContainerStyle={{
        paddingHorizontal: theme.spacing.pageX,
        paddingTop: insets.top + theme.spacing.lg,
        paddingBottom: insets.bottom + theme.spacing.xxl,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          fontSize: theme.typography.size.title,
          lineHeight: theme.typography.lineHeight.title,
          fontWeight: theme.typography.weight.semibold,
          color: palette.text,
          fontFamily: theme.typography.fontFamily.title,
        }}
      >
        回忆
      </Text>

      <Text
        style={{
          marginTop: theme.spacing.md,
          fontSize: theme.typography.size.heading,
          lineHeight: theme.typography.lineHeight.heading,
          color: palette.text,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        走过的日子会留在这里。
      </Text>

      <Text
        style={{
          marginTop: theme.spacing.sm,
          fontSize: theme.typography.size.body,
          lineHeight: theme.typography.lineHeight.body,
          color: palette.textMuted,
          fontFamily: theme.typography.fontFamily.body,
        }}
      >
        不是成绩单，是一份记录。想不起来自己做过什么的时候，可以来这儿看看。
      </Text>

      <View
        style={{
          marginTop: theme.spacing.xl,
          borderTopWidth: 1,
          borderTopColor: palette.border,
          paddingTop: theme.spacing.lg,
        }}
      >
        <StageNote title="还没有回忆">
          记录满几天之后，这里会出现第一条。所有内容都只存在这台手机上。
        </StageNote>
      </View>

      <View style={{ marginTop: theme.spacing.xxl }}>
        <StageNote title="阶段 3 与阶段 5 会做">
          时间线倒序、每周一份小结、每月一份回看；关键节点自动生成一张回忆卡，可以导出成图片。
        </StageNote>
      </View>
    </ScrollView>
  );
}
