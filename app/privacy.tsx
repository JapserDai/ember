import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '../src/components/Card';
import { SparkMark } from '../src/components/SparkMark';
import { useTheme } from '../src/theme/ThemeProvider';

/**
 * 隐私说明（阶段 6 第 5 条）。
 *
 * ---- 为什么这一页在 App 里，而不是只放在落地页 ----
 *
 * 落地页说明的是「这个 App 怎么用」，而这一页回答的是「我的数据在哪」。
 * 后者是用户装完之后会突然想起来的问题，那时他人在 App 里，
 * 不会为了一个答案去浏览器里翻。
 *
 * ---- 文案的三条规矩 ----
 *
 * 1. **说事实，不说承诺。** 不写「我们致力于保护您的隐私」，
 *    写「这个 App 没有网络权限」——后者可以验证，前者不能。
 * 2. **不写法律套话。** 没有「收集」「处理」「第三方」这些词，
 *    因为没有第三方，也没有收集。
 * 3. **写清代价。** 「数据只在这台手机上」的另一面是「手机坏了就没了」，
 *    这一句必须说，不能只讲好处。
 *
 * ---- 「没有网络权限」是坐实的，不只是文案 ----
 *
 * `app.json` 的 `android.blockedPermissions` 显式移除了
 * `INTERNET` 与 `ACCESS_NETWORK_STATE`（见 docs/02 §7.4）。
 * 所以用户装完在系统设置里查到的权限列表里，确实没有联网。
 */
/**
 * 版本号。从 `app.json` 的 `expo.version` 读，不另写常量。
 *
 * `expo-constants` 已经在依赖里（`services/reminders.ts` 用它判断
 * 是不是跑在 Expo Go 里），所以这里不多装任何东西。
 */
const APP_VERSION = Constants.expoConfig?.version ?? '';

export default function PrivacyScreen() {
  const { theme, palette } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handleBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/settings');
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

        <View
          style={[
            styles.titleRow,
            { marginTop: theme.spacing.md, gap: theme.spacing.sm },
          ]}
        >
          <Text
            style={{
              flexShrink: 1,
              fontSize: theme.typography.size.title,
              lineHeight: theme.typography.lineHeight.title,
              fontWeight: theme.typography.weight.semibold,
              color: palette.text,
              fontFamily: theme.typography.fontFamily.title,
            }}
          >
            你的数据在哪儿
          </Text>
          {/*
           * 品牌记号唯一出现在界面里的地方（D50）。
           *
           * 为什么是这一页：它是全 App 唯一一页「说的就是 Ember 自己是什么」，
           * 而记号就是那个「是什么」。放在标题右边、与标题同高，是「署名」
           * 而不是「装饰」——它挨着的那句话是这一页的结论。
           *
           * 不传 label：读屏念完「你的数据在哪儿」再念一句「火花」是噪音。
           */}
          <SparkMark size={theme.typography.size.title} />
        </View>
      </View>

      <Card style={{ marginTop: theme.spacing.lg, marginHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          Ember 没有任何网络权限。
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
          没有账号，没有服务器。你的记录只存在这台手机上，不会发送到任何地方。
          装完之后可以在手机的「设置 → 应用 → Ember → 权限」里核对——那里不会有联网权限。
        </Text>
      </Card>

      <Card style={{ marginTop: theme.spacing.cardGap, marginHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          这里没有 AI 服务。
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
          所有的「看看最近」「拆一件事」都是用 App 内置的模板算出来的，
          不联网，也不会把你的记录发给谁。
        </Text>
      </Card>

      <Card style={{ marginTop: theme.spacing.cardGap, marginHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          你可以随时把全部数据带走。
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
          设置 → 备份与导入，可以把全部记录导成一个文件，也可以从一份备份完整恢复。
        </Text>
      </Card>

      {/* 代价。不能只讲好处 */}
      <Card style={{ marginTop: theme.spacing.cardGap, marginHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.body,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.text,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          代价是：手机坏了就没了。
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
          没有服务器，就没有第二份。卸载、换手机、手机坏掉，数据都会跟着没。
          隔一段时间导出一份放在别处，是唯一的保险。
        </Text>
      </Card>

      <View style={{ marginTop: theme.spacing.xl, paddingHorizontal: theme.spacing.pageX }}>
        <Text
          style={{
            fontSize: theme.typography.size.caption,
            lineHeight: theme.typography.lineHeight.body,
            color: palette.textMuted,
            fontFamily: theme.typography.fontFamily.body,
          }}
        >
          这一页说的每一句都可以自己验证：权限在系统设置里，数据在导出的文件里。
        </Text>

        {/*
         * 署名。与落地页顶栏、App 图标、通知栏图标是同一个记号
         * （`src/domain/spark.ts` 的 SPARK_PATH，由 `scripts/make-logo.ts` 生成位图）。
         *
         * 版本号读 `app.json` 的 `expo.version`，不另写一份常量——
         * 写死的那份迟早与真正打进包里的版本不一致，而「关于」里写错版本
         * 是最没必要的一种错。
         */}
        <View
          style={[
            styles.signature,
            { marginTop: theme.spacing.xl, gap: theme.spacing.xs },
          ]}
        >
          <SparkMark size={16} />
          <Text
            style={{
              fontSize: theme.typography.size.caption,
              lineHeight: theme.typography.lineHeight.caption,
              color: palette.textMuted,
              fontFamily: theme.typography.fontFamily.body,
            }}
          >
            Ember {APP_VERSION}
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

/*
 * 只留布局，不留尺寸与颜色：间距走 theme.spacing、颜色走 palette（D30 的同一条规矩）。
 * 两处 gap 在组件里给，因为它们跟着字号变——1.5 倍字号时记号与字的距离也该大一点。
 */
const styles = StyleSheet.create({
  /** 标题与记号同一条横线。记号是署名，所以与标题底部对齐而不是居中 */
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  /** 页脚署名：记号 + 「Ember 0.0.1」 */
  signature: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
